// 存档的区域按需读成列段：内存里留最近用的几十个，磁盘上按「区域文件 sha256 + 种子」缓存在 <数据根>/cache/列段/（内容寻址，换存档、重生成都自动失效）。
// 套编辑（编辑/套用.ts）在这一层做：烘焙、查询拿到的都是套完编辑的列段，原始存档不动。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { 解码列段, 编码列段, type 解开的列段 } from './列段.ts';
import { 区域文件名, 解析区域文件名, 读区域 } from './存档.ts';

/** 列段缓存的键随它变：读存档的写法（状态串、并段规则）改了就换一版 */
const 读法版本 = 'mca-列段v2';

export type 区域变换 = (r: 解开的列段) => 解开的列段;

export class 区域源 {
  private 内存 = new Map<string, 解开的列段 | null>();
  private 内存上限 = 40;
  private 键缓存 = new Map<string, string>();

  readonly 区域目录: string;
  readonly 种子: string;
  private 缓存目录: string | null;
  private 变换: 区域变换 | null;

  constructor(区域目录: string, 种子: string, 缓存目录: string | null, 变换: 区域变换 | null = null) {
    this.区域目录 = 区域目录;
    this.种子 = 种子;
    this.缓存目录 = 缓存目录;
    this.变换 = 变换;
  }

  /** 存档里有的区域文件 [rx, rz]，按文件名排好 */
  区域文件(): [number, number][] {
    if (!fs.existsSync(this.区域目录)) throw new Error(`没有区域目录 ${this.区域目录}`);
    return fs
      .readdirSync(this.区域目录)
      .sort()
      .map(解析区域文件名)
      .filter((x): x is readonly [number, number] => !!x)
      .map(([a, b]) => [a, b]);
  }

  文件(rx: number, rz: number) {
    return path.join(this.区域目录, 区域文件名(rx, rz));
  }

  private 缓存文件(rx: number, rz: number) {
    if (!this.缓存目录) return null;
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const st = fs.statSync(f);
    const 戳 = `${f}\0${st.size}\0${st.mtimeMs}`;
    let h = this.键缓存.get(戳);
    if (!h) this.键缓存.set(戳, (h = createHash('sha256').update(fs.readFileSync(f)).update(`\0${this.种子}\0${读法版本}`).digest('hex')));
    return path.join(this.缓存目录, h.slice(0, 2), h);
  }

  /** 列段缓存里已经有了（读它不用解存档） */
  已缓存(rx: number, rz: number) {
    const c = this.缓存文件(rx, rz);
    return !!c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`));
  }

  /** 读一个区域（不套编辑）：先看缓存，没有就解存档并写缓存 */
  原样(rx: number, rz: number): 解开的列段 | null {
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const c = this.缓存文件(rx, rz);
    if (c && fs.existsSync(`${c}.列段`)) return 解码列段(fs.readFileSync(`${c}.列段`));
    if (c && fs.existsSync(`${c}.空`)) return null;
    const r = 读区域(f, rx, rz, this.种子);
    if (c) 写缓存(c, r ? 编码列段(r.列段) : null);
    return r ? 解码列段(编码列段(r.列段)) : null;
  }

  /** 套过编辑的区域；内存里留最近用的 */
  区域(rx: number, rz: number): 解开的列段 | null {
    const k = `${rx},${rz}`;
    let r = this.内存.get(k);
    if (r !== undefined) {
      this.内存.delete(k); // 挪到最新
      this.内存.set(k, r);
      return r;
    }
    r = this.原样(rx, rz);
    if (r && this.变换) r = this.变换(r);
    this.内存.set(k, r);
    if (this.内存.size > this.内存上限) this.内存.delete(this.内存.keys().next().value!);
    return r;
  }

  /** 只解几个区块（查询小范围用，不写缓存、不进内存）；整区域已在缓存就用缓存 */
  局部(rx: number, rz: number, 区块: ReadonlySet<number>): 解开的列段 | null {
    const k = `${rx},${rz}`;
    if (this.内存.has(k)) return this.区域(rx, rz);
    const c = this.缓存文件(rx, rz);
    if (c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`))) return this.区域(rx, rz);
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const r = 读区域(f, rx, rz, this.种子, 区块);
    if (!r) return null;
    const d = 解码列段(编码列段(r.列段));
    return this.变换 ? this.变换(d) : d;
  }

  /** 并行把没缓存的区域读进缓存；返回有数据的区域 */
  async 预读(区域们: [number, number][], 线程数: number, 日志?: (s: string) => void): Promise<[number, number][]> {
    if (!this.缓存目录) throw new Error('预读要有缓存目录');
    const 待: { rx: number; rz: number; 缓存: string }[] = [];
    const 有数据: [number, number][] = [];
    for (const [rx, rz] of 区域们) {
      const c = this.缓存文件(rx, rz);
      if (!c) continue;
      if (fs.existsSync(`${c}.列段`)) 有数据.push([rx, rz]);
      else if (!fs.existsSync(`${c}.空`)) 待.push({ rx, rz, 缓存: c });
    }
    if (待.length) {
      日志?.(`读存档：${待.length} 个区域没缓存，${Math.min(线程数, 待.length)} 个线程读`);
      const t0 = performance.now();
      let 下一个 = 0;
      const 跑一个线程 = () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./读区域工人.ts', import.meta.url), { workerData: { 种子: this.种子 } });
          const 发 = () => {
            const j = 待[下一个++];
            if (j) w.postMessage({ 文件: this.文件(j.rx, j.rz), rx: j.rx, rz: j.rz, 缓存: j.缓存 });
            else void w.terminate().then(() => resolve());
          };
          w.on('message', (m: { rx: number; rz: number; 区块数: number; 字节: number }) => {
            if (m.区块数) {
              有数据.push([m.rx, m.rz]);
              日志?.(`  r.${m.rx}.${m.rz}：${m.区块数} 个区块，${(m.字节 / 1e6).toFixed(1)} MB`);
            }
            发();
          });
          w.on('error', reject);
          发();
        });
      await Promise.all(Array.from({ length: Math.max(1, Math.min(线程数, 待.length)) }, 跑一个线程));
      日志?.(`读存档完，${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    }
    const 序 = (a: [number, number], b: [number, number]) => 区域文件名(...a).localeCompare(区域文件名(...b));
    return 有数据.sort(序);
  }
}

export const 写缓存 = (前缀: string, gz: Buffer | null) => {
  fs.mkdirSync(path.dirname(前缀), { recursive: true });
  const 目标 = gz ? `${前缀}.列段` : `${前缀}.空`;
  const tmp = `${目标}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, gz ?? '');
  fs.renameSync(tmp, 目标);
};
