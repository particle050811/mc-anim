// 存档的区域按需读成列段：内存里留最近用的几十个，磁盘上按「区域文件 sha256 + 种子」缓存在 <数据根>/cache/列段/（内容寻址，换存档、重生成都自动失效）。
// 套编辑（编辑/套用.ts）在这一层做：烘焙、查询拿到的都是套完编辑的列段，原始存档不动。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { decodeColumnSegments, encodeColumnSegments, type UnpackedColumnSegmentRegion } from './列段.ts';
import { regionFileName, parseRegionFileName, readRegion } from './存档.ts';

/** 列段缓存的键随它变：读存档的写法（状态串、并段规则）改了就换一版 */
const READ_METHOD = 'mca-列段v2';

/** 读缓存时把修改时间推到现在（超过 1 天才动，省系统调用）：anim cache gc 按它算多久没用过 */
const markUsed = (f: string, now = Date.now()) => {
  try {
    if (now - fs.statSync(f).mtimeMs > 24 * 3600 * 1000) fs.utimesSync(f, new Date(now), new Date(now));
  } catch {
    // 别的进程刚回收了，或只读盘：不影响这次读
  }
};

export type RegionTransform = (r: UnpackedColumnSegmentRegion) => UnpackedColumnSegmentRegion;

// 缓存键（区域文件 sha256 接种子、读法版本）按「路径、大小、修改时间、种子」记在进程里：同一个存档常有两个区域源（套编辑的和编辑读原样的），共用一份
const keyTable = new Map<string, string>();

export class RegionSource {
  private cache = new Map<string, UnpackedColumnSegmentRegion | null>();
  private memoryLimit = 40;

  readonly regionDir: string;
  readonly 种子: string;
  private cacheDir: string | null;
  private transform: RegionTransform | null;

  constructor(regionDir: string, seed: string, cacheDir: string | null, transform: RegionTransform | null = null) {
    this.regionDir = regionDir;
    this.种子 = seed;
    this.cacheDir = cacheDir;
    this.transform = transform;
  }

  /** 存档里有的区域文件 [rx, rz]，按文件名排好 */
  regionFiles(): [number, number][] {
    if (!fs.existsSync(this.regionDir)) throw new Error(`没有区域目录 ${this.regionDir}`);
    return fs
      .readdirSync(this.regionDir)
      .sort()
      .map(parseRegionFileName)
      .filter((x): x is readonly [number, number] => !!x)
      .map(([a, b]) => [a, b]);
  }

  文件(rx: number, rz: number) {
    return path.join(this.regionDir, regionFileName(rx, rz));
  }

  private get keySuffix() {
    return `\0${this.种子}\0${READ_METHOD}`;
  }

  /** 区域文件的戳；文件不在返回 null */
  private stamp(rx: number, rz: number) {
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const st = fs.statSync(f);
    return { f, stamp: `${f}\0${st.size}\0${st.mtimeMs}\0${this.种子}` };
  }

  private cacheFile(rx: number, rz: number) {
    if (!this.cacheDir) return null;
    const s = this.stamp(rx, rz);
    if (!s) return null;
    let h = keyTable.get(s.stamp);
    if (!h) keyTable.set(s.stamp, (h = createHash('sha256').update(fs.readFileSync(s.f)).update(this.keySuffix).digest('hex')));
    return path.join(this.cacheDir, h.slice(0, 2), h);
  }

  /** 在工作线程里先把这些区域的缓存键算好（之后 缓存文件 直接查表）；没缓存目录、文件不在的跳过 */
  async computeKeys(regions: readonly [number, number][], threadCount: number) {
    if (!this.cacheDir) return;
    const pending = regions.map(([rx, rz]) => this.stamp(rx, rz)).filter((s): s is { f: string; stamp: string } => !!s && !keyTable.has(s.stamp));
    if (pending.length <= 2) return; // 一两个文件起线程不划算，留给 缓存文件 当场算
    let nextIndex = 0;
    const runThread = () =>
      new Promise<void>((resolve, reject) => {
        const w = new Worker(new URL('./算键工人.ts', import.meta.url));
        let current: { f: string; stamp: string } | undefined;
        const dispatch = () => {
          current = pending[nextIndex++];
          if (current) w.postMessage({ 文件: current.f, 后缀: this.keySuffix });
          else void w.terminate().then(() => resolve());
        };
        w.on('message', (h: string) => {
          keyTable.set(current!.stamp, h);
          dispatch();
        });
        w.on('error', reject);
        dispatch();
      });
    await Promise.all(Array.from({ length: Math.max(1, Math.min(threadCount, pending.length)) }, runThread));
  }

  /** 列段缓存里已经有了（读它不用解存档） */
  isCached(rx: number, rz: number) {
    const c = this.cacheFile(rx, rz);
    return !!c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`));
  }

  /** 读一个区域（不套编辑）：先看缓存，没有就解存档并写缓存 */
  原样(rx: number, rz: number): UnpackedColumnSegmentRegion | null {
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const c = this.cacheFile(rx, rz);
    if (c && fs.existsSync(`${c}.列段`)) {
      markUsed(`${c}.列段`);
      return decodeColumnSegments(fs.readFileSync(`${c}.列段`));
    }
    if (c && fs.existsSync(`${c}.空`)) {
      markUsed(`${c}.空`);
      return null;
    }
    const r = readRegion(f, rx, rz, this.种子);
    if (c) writeCache(c, r ? encodeColumnSegments(r.columnSeg) : null);
    return r ? decodeColumnSegments(encodeColumnSegments(r.columnSeg)) : null;
  }

  /** 套过编辑的区域；内存里留最近用的 */
  区域(rx: number, rz: number): UnpackedColumnSegmentRegion | null {
    const k = `${rx},${rz}`;
    let r = this.cache.get(k);
    if (r !== undefined) {
      this.cache.delete(k); // 挪到最新
      this.cache.set(k, r);
      return r;
    }
    r = this.原样(rx, rz);
    if (r && this.transform) r = this.transform(r);
    this.cache.set(k, r);
    if (this.cache.size > this.memoryLimit) this.cache.delete(this.cache.keys().next().value!);
    return r;
  }

  /** 只解几个区块（查询小范围用，不写缓存、不进内存）；整区域已在缓存就用缓存 */
  partialRegion(rx: number, rz: number, chunkSet: ReadonlySet<number>): UnpackedColumnSegmentRegion | null {
    const k = `${rx},${rz}`;
    if (this.cache.has(k)) return this.区域(rx, rz);
    const c = this.cacheFile(rx, rz);
    if (c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`))) return this.区域(rx, rz);
    const f = this.文件(rx, rz);
    if (!fs.existsSync(f)) return null;
    const r = readRegion(f, rx, rz, this.种子, chunkSet);
    if (!r) return null;
    const d = decodeColumnSegments(encodeColumnSegments(r.columnSeg));
    return this.transform ? this.transform(d) : d;
  }

  /** 并行把没缓存的区域读进缓存；返回有数据的区域 */
  async preRead(regions: [number, number][], threadCount: number, log?: (s: string) => void): Promise<[number, number][]> {
    if (!this.cacheDir) throw new Error('预读要有缓存目录');
    await this.computeKeys(regions, threadCount);
    const pending: { rx: number; rz: number; cachePath: string }[] = [];
    const hasData: [number, number][] = [];
    for (const [rx, rz] of regions) {
      const c = this.cacheFile(rx, rz);
      if (!c) continue;
      if (fs.existsSync(`${c}.列段`)) hasData.push([rx, rz]);
      else if (!fs.existsSync(`${c}.空`)) pending.push({ rx, rz, cachePath: c });
    }
    if (pending.length) {
      log?.(`读存档：${pending.length} 个区域没缓存，${Math.min(threadCount, pending.length)} 个线程读`);
      const t0 = performance.now();
      let nextIndex = 0;
      const runThread = () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./读区域工人.ts', import.meta.url), { workerData: { 种子: this.种子 } });
          const dispatch = () => {
            const j = pending[nextIndex++];
            if (j) w.postMessage({ 文件: this.文件(j.rx, j.rz), rx: j.rx, rz: j.rz, cachePath: j.cachePath });
            else void w.terminate().then(() => resolve());
          };
          w.on('message', (m: { rx: number; rz: number; 区块数: number; 字节: number }) => {
            if (m.区块数) {
              hasData.push([m.rx, m.rz]);
              log?.(`  r.${m.rx}.${m.rz}：${m.区块数} 个区块，${(m.字节 / 1e6).toFixed(1)} MB`);
            }
            dispatch();
          });
          w.on('error', reject);
          dispatch();
        });
      await Promise.all(Array.from({ length: Math.max(1, Math.min(threadCount, pending.length)) }, runThread));
      log?.(`读存档完，${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    }
    const compareRegion = (a: [number, number], b: [number, number]) => regionFileName(...a).localeCompare(regionFileName(...b));
    return hasData.sort(compareRegion);
  }
}

export const writeCache = (pathPrefix: string, gz: Buffer | null) => {
  fs.mkdirSync(path.dirname(pathPrefix), { recursive: true });
  const targetPath = gz ? `${pathPrefix}.列段` : `${pathPrefix}.空`;
  const tmp = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, gz ?? '');
  fs.renameSync(tmp, targetPath);
};
