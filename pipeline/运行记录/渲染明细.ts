// 渲染明细：每次 renderMedia、renderStill 留一份 JSON，看一段的时间花在哪一帧、等哪个 delayRender，渲的时候机器忙不忙。用 anim 耗时 看。
// 不改 engine：engine 进指纹，往里加计时全片过期。数据取自 Remotion 的 verbose 日志（页面的 delayRender 清除时报标签和毫秒）和 onProgress，日志级别不进指纹、不改像素（docs/渲染性能.md 有核对）。
// 帧的毫秒是相邻两次 onProgress 的差（并发 1，每帧回调一次），含截图、交给编码器；delayRender 可能重叠，各标签加起来不等于帧的毫秒。
// 占地：每帧约 100 字节，一份最多几百 KB，只留最近 保留份数 份。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import {读内存,读压力} from '../环境/资源.ts';
import {当前票,闸心跳} from '../闸/闸.ts';
import { 写JSON, 只提示 } from '../闸/文件.ts';
import os from 'node:os';
import path from 'node:path';
import { 耗时表, 配置 } from '../环境/配置.ts';
import type { 阶段记录 } from './阶段.ts';

const 版本 = 1;
const 保留份数 = 300;
const 采样间隔毫秒 = 10_000;
// 一帧里短于这个的等待不逐帧记（只进总表），不然文件翻几倍
const 逐帧记的下限毫秒 = 20;

export type 帧记录 = { 帧: number; 毫秒: number; 等?: Record<string, number> };
export type 等待统计 = { 标签: string; 次: number; 总毫秒: number; 最大毫秒: number };
export type 系统采样 = { 闸?:number|null; 压力?:number|null; 秒: number; 负载: number; 空闲内存GB: number; 换出GB: number | null; 子进程内存GB: number | null; 子进程CPU: number | null; /** 后台转存子进程（不算进 子进程*），这刻没在转就没有 */ 后台内存GB?: number | null; 后台CPU?: number | null };
export type 明细小结 = { 帧数: number; 首帧毫秒: number; 中位毫秒: number; P90毫秒: number; P99毫秒: number; 最慢帧: { 帧: number; 毫秒: number }[] };
export type 渲染明细 = {
  票?: string;
  版本: number;
  标签: string;
  开始: string;
  总秒: number;
  主机: string;
  平台: string;
  环境: Record<string, string>;
  小结: 明细小结;
  等待: 等待统计[];
  阶段: 阶段记录[];
  系统: 系统采样[];
  帧: 帧记录[];
};

export const 明细目录 = () => path.join(path.dirname(耗时表()), '渲染明细');

const ANSI = /\u001b\[[0-9;]*m/g;

/** 标签里的帧号、地址、块数换成 #，同一类等待才归得到一起 */
export const 归类标签 = (标签: string) =>
  标签
    .replace(/ - See https?:.*$/, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 48);

/** 一行 Remotion 日志是 delayRender 清除的话，取标签和毫秒 */
export const 解析等待 = (行: string): { 标签: string; 毫秒: number } | null => {
  const m = /delayRender\(\)\] "(.*)" handle was cleared after (\d+)ms\s*$/.exec(行.replace(ANSI, ''));
  return m ? { 标签: 归类标签(m[1]!), 毫秒: Number(m[2]) } : null;
};

const 分位 = (升序: number[], p: number) => (升序.length ? 升序[Math.min(升序.length - 1, Math.floor(p * 升序.length))]! : 0);

export const 算小结 = (帧: readonly 帧记录[]): 明细小结 => {
  // 首帧要建场景，单算，不进分位
  const 后面 = 帧.slice(1).map((f) => f.毫秒).sort((a, b) => a - b);
  return {
    帧数: 帧.length,
    首帧毫秒: 帧[0]?.毫秒 ?? 0,
    中位毫秒: 分位(后面, 0.5),
    P90毫秒: 分位(后面, 0.9),
    P99毫秒: 分位(后面, 0.99),
    最慢帧: [...帧].slice(1).sort((a, b) => b.毫秒 - a.毫秒).slice(0, 5).map((f) => ({ 帧: f.帧, 毫秒: f.毫秒 })),
  };
};

const 跑取输出 = (cmd: string, args: string[]) =>
  new Promise<string | null>((resolve) => {
    execFile(cmd, args, { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err ? null : out));
  });

/** 跑后台子进程 登记的根：也是本进程的子孙，混进 子进程* 就分不清出帧和转存各占多少 */
const 后台根们 = new Set<number>();
export const 登记后台根 = (pid: number) => {
  后台根们.add(pid);
  return () => void 后台根们.delete(pid);
};

const 空集 = new Set<number>();
const 解析ps = (ps输出: string) => ps输出.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).filter((c) => c.length >= 4 && c.every(Number.isFinite));
/** 根的子孙（不含根）；碰到排除的连它的子树一起不进 */
const 子孙 = (行们: number[][], 根: number, 排除: ReadonlySet<number> = 空集) => {
  const 子们 = new Map<number, number[]>();
  for (const [pid, ppid] of 行们) 子们.set(ppid!, [...(子们.get(ppid!) ?? []), pid!]);
  const 在内 = new Set<number>();
  const 栈 = [根];
  while (栈.length) for (const c of 子们.get(栈.pop()!) ?? []) if (!在内.has(c) && !排除.has(c)) (在内.add(c), 栈.push(c));
  return 在内;
};
const 合计 = (行们: number[][], 在内: ReadonlySet<number>) => {
  let kb = 0;
  let cpu = 0;
  for (const [pid, , rss, pc] of 行们) if (在内.has(pid!)) (kb += rss!, cpu += pc!);
  return { 内存GB: Number((kb / 1024 / 1024).toFixed(2)), CPU: Number(cpu.toFixed(0)) };
};

/** 本进程的子孙（浏览器、ffmpeg）的内存和 CPU，后台子进程那几棵除外；Windows 没有 ps，记 null */
export const 累计子孙 = (ps输出: string, 根: number, 排除: ReadonlySet<number> = 空集) => {
  const 行们 = 解析ps(ps输出);
  return 合计(行们, 子孙(行们, 根, 排除));
};

/** 后台子进程（node、它起的 ffmpeg）连根带子孙 */
export const 累计后台 = (ps输出: string, 根们: ReadonlySet<number>) => {
  const 行们 = 解析ps(ps输出);
  return 合计(行们, new Set([...根们].flatMap((r) => [r, ...子孙(行们, r)])));
};

/** ps 的 time 列：[天-][时:]分:秒[.小数]（macOS 0:00.02，Linux 00:00:02、1-00:00:02） */
export const 解析CPU时间 = (文: string): number | null => {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(文.trim());
  return m ? Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]) : null;
};

/** ps -o pid=,ppid=,time= 的一次读数里，根连子孙每个进程的 CPU 秒 */
export const 读子树CPU = (ps输出: string, 根: number) => {
  const 行们 = ps输出.trim().split('\n').map((l) => l.trim().split(/\s+/));
  const 树 = 行们.map((c) => [Number(c[0]), Number(c[1])]).filter((c) => c.every(Number.isFinite));
  const 在内 = new Set([根, ...子孙(树, 根)]);
  const 出 = new Map<number, number>();
  for (const [p, , t] of 行们) {
    const 秒 = 解析CPU时间(t ?? '');
    if (在内.has(Number(p)) && 秒 !== null) 出.set(Number(p), 秒);
  }
  return 出;
};

/**
 * 这个进程连子孙花了多少 CPU 秒：定时读 ps，每个 pid 留最后一次读数相加。macOS 的 ps 不累计已退出的子进程，也没有 RUSAGE_CHILDREN，只能这样；
 * 进程退出前最后一个间隔的量读不到，是估算。读不到 ps（Windows）是 null
 */
export const 建CPU账 = (根 = process.pid, 间隔毫秒 = 2000) => {
  const 账 = new Map<number, number>();
  let 读到过 = false;
  const 读 = async () => {
    const out = process.platform === 'win32' ? null : await 跑取输出('ps', ['-A', '-o', 'pid=,ppid=,time=']);
    if (!out) return;
    读到过 = true;
    for (const [pid, 秒] of 读子树CPU(out, 根)) 账.set(pid, 秒);
  };
  void 读();
  const 定时 = setInterval(() => void 读(), 间隔毫秒);
  定时.unref();
  return {
    止: async (): Promise<number | null> => {
      clearInterval(定时);
      await 读();
      return 读到过 ? Number([...账.values()].reduce((a, b) => a + b, 0).toFixed(1)) : null;
    },
  };
};

/** vm.swapusage 的 used = 123.00M */
export const 解析换出 = (输出: string): number | null => {
  const m = /used = ([\d.]+)([MGK])/.exec(输出);
  return m ? Number((Number(m[1]) * { K: 1 / 1024 / 1024, M: 1 / 1024, G: 1 }[m[2] as 'K' | 'M' | 'G']).toFixed(2)) : null;
};

const 采一次 = async (起: number): Promise<系统采样> => {
  const [ps, 换] = await Promise.all([
    process.platform === 'win32' ? null : 跑取输出('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=']),
    process.platform === 'darwin' ? 跑取输出('sysctl', ['-n', 'vm.swapusage']) : null,
  ]);
  const 内存=读内存();
  const 子 = ps ? 累计子孙(ps, process.pid, 后台根们) : null;
  const 后 = ps && 后台根们.size ? 累计后台(ps, 后台根们) : null;
  return {
    秒: Math.round((Date.now() - 起) / 1000),
    负载: Number(os.loadavg()[0]!.toFixed(1)),
    空闲内存GB: Number(((内存?.空闲 ?? os.freemem()) / 1024 ** 3).toFixed(1)),
    闸:内存?.空闲百分比??null,压力:读压力(),
    换出GB: 换 ? 解析换出(换) : null,
    子进程内存GB: 子?.内存GB ?? null,
    子进程CPU: 子?.CPU ?? null,
    ...(后 ? { 后台内存GB: 后.内存GB, 后台CPU: 后.CPU } : {}),
  };
};

/** 一次渲染的收集器：包住 renderMedia（把 verbose 日志收走不刷屏），onProgress 传进去，完了 写出 */
export class 明细收集 {
  帧们: 帧记录[] = [];
  private 等待 = new Map<string, 等待统计>();
  private 当前等: Record<string, number> = {};
  private 系统: 系统采样[] = [];
  private 上次 = 0;
  private 上次帧数 = 0;
  private 起 = Date.now();
  private 止: number | null = null;
  private 票 = 当前票();
  private 定时: NodeJS.Timeout | null = null;
  private 采样中: Promise<unknown>[] = [];

  private 标签: string;
  private 起始帧: number;

  constructor(标签: string, 起始帧 = 0) {
    this.标签 = 标签;
    this.起始帧 = 起始帧;
  }

  行(文本: string) {
    const w = 解析等待(文本);
    if (!w) return;
    const s = this.等待.get(w.标签) ?? { 标签: w.标签, 次: 0, 总毫秒: 0, 最大毫秒: 0 };
    s.次++;
    s.总毫秒 += w.毫秒;
    s.最大毫秒 = Math.max(s.最大毫秒, w.毫秒);
    this.等待.set(w.标签, s);
    if (w.毫秒 >= 逐帧记的下限毫秒) this.当前等[w.标签] = (this.当前等[w.标签] ?? 0) + w.毫秒;
  }

  /** 进度回调的同一帧数可能回调多次（编码进度也走这里），帧数变了才算出了一帧 */
  帧完成(已出帧数: number, now = Date.now()) {
    闸心跳(已出帧数);
    if (已出帧数 === this.上次帧数) return;
    const 这次几帧 = 已出帧数 - this.上次帧数;
    const 毫秒 = Math.round((now - (this.上次帧数 === 0 ? this.起 : this.上次)) / 这次几帧);
    for (let k = 0; k < 这次几帧; k++) {
      const 等 = k === 0 && Object.keys(this.当前等).length ? { 等: this.当前等 } : {};
      this.帧们.push({ 帧: this.起始帧 + this.上次帧数 + k, 毫秒, ...等 });
    }
    this.当前等 = {};
    this.上次 = now;
    this.上次帧数 = 已出帧数;
  }

  /** fn 期间 console.log 全归 Remotion（只包 renderMedia、renderStill，它们不打别的）：verbose 日志不刷屏；系统采样同时跑。原样留一份给 转发（bench --详细 的日志文件） */
  async 包<T>(fn: () => Promise<T>, 转发?: (文本: string) => void): Promise<T> {
    const 原 = console.log;
    console.log = (...a: unknown[]) => {
      const 文本 = a.map(String).join(' ');
      this.行(文本);
      转发?.(文本);
    };
    this.起 = Date.now();
    this.采样中.push(采一次(this.起).then((x) => this.系统.push(x)));
    this.定时 = setInterval(() => this.采样中.push(采一次(this.起).then((x) => this.系统.push(x))), 采样间隔毫秒);
    this.定时.unref();
    try {
      return await fn();
    } finally {
      console.log = 原;
      clearInterval(this.定时);
    }
  }

  /** 写出 要等后台收工才调（阶段才齐），总秒按这一刻算：后台排队不算这次渲染 */
  停表(now = Date.now()) {
    this.止 = now;
  }

  /** 写出明细文件；写不成只提示，不影响渲染 */
  async 写出(阶段: readonly 阶段记录[], 环境: Record<string, string> = {}, 目录 = 明细目录()): Promise<{ 文件: string | null; 明细: 渲染明细 }> {
    await Promise.allSettled(this.采样中);
    const 明细: 渲染明细 = {
      版本,
      票:this.票,
      标签: this.标签,
      开始: new Date(this.起).toISOString().replace(/\.\d+Z$/, 'Z'),
      总秒: Number((((this.止 ?? Date.now()) - this.起) / 1000).toFixed(2)),
      主机: 配置('主机'),
      平台: `${process.platform}-${process.arch}`,
      环境,
      小结: 算小结(this.帧们),
      等待: [...this.等待.values()].sort((a, b) => b.总毫秒 - a.总毫秒),
      阶段: 阶段.filter((r) => r.标签 === this.标签),
      系统: this.系统.sort((a, b) => a.秒 - b.秒),
      帧: this.帧们,
    };
    try {
      const 名 = `${明细.开始.replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}-${this.标签.replace(/[\\/:*?"<>|\s]+/g, '_')}-${process.pid}.json`;
      const 文件 = path.join(目录, 名);
      写JSON(文件, 明细);
      只提示('清旧明细', () => 清旧明细(目录));
      return { 文件, 明细 };
    } catch (e) {
      console.error(`!! 渲染明细没写成：${(e as Error).message}`);
      return { 文件: null, 明细 };
    }
  }
}

const 列明细 = (目录: string) => (fs.existsSync(目录) ? fs.readdirSync(目录).filter((f) => f.endsWith('.json')).sort() : []);

/** 种从文件名取（<开始>-<标签>-<pid>.json，标签里的 : 变 _）：不解析内容，半截的文件照常轮转，也不用每次把几百份全读一遍。 */
const 明细种 = (f: string) => /^\d{8}-\d{6}-([^_]+)_/.exec(f)?.[1] ?? '未知';

export const 清旧明细 = (目录: string, 份数 = 保留份数) => {
  const 分种 = new Map<string, string[]>();
  for (const f of 列明细(目录)) 分种.set(明细种(f), [...(分种.get(明细种(f)) ?? []), f]);
  for (const files of 分种.values()) for (const f of files.slice(0, Math.max(0, files.length - 份数))) fs.rmSync(path.join(目录, f), { force: true });
};

/** 最近的明细，新的在前；给了 含 只要标签里含这个字的 */
export const 读明细们 = (o: { 含?: string; 最多?: number; 目录?: string } = {}): { 文件: string; 明细: 渲染明细 }[] => {
  const 目录 = o.目录 ?? 明细目录();
  const 出: { 文件: string; 明细: 渲染明细 }[] = [];
  for (const f of 列明细(目录).reverse()) {
    if (o.含 && !f.includes(o.含.replace(/[\\/:*?"<>|\s]+/g, '_'))) continue;
    try {
      出.push({ 文件: path.join(目录, f), 明细: JSON.parse(fs.readFileSync(path.join(目录, f), 'utf8')) as 渲染明细 });
    } catch {
      continue;
    }
    if (o.最多 && 出.length >= o.最多) break;
  }
  return 出;
};

const 秒 = (毫秒: number) => `${(毫秒 / 1000).toFixed(1)} 秒`;

/** anim 耗时 <段>：一份明细给人看的报告 */
export const 明细报告 = (d: 渲染明细, 文件?: string) => {
  const 帧总 = d.帧.reduce((a, f) => a + f.毫秒, 0);
  const 行们 = [
    `${d.标签}  ${d.开始}  ${d.主机}（${d.平台}）`,
    ...Object.entries(d.环境).map(([k, v]) => `  ${k}：${v}`),
    `总 ${d.总秒.toFixed(1)} 秒，${d.小结.帧数} 帧，首帧 ${秒(d.小结.首帧毫秒)}；其后每帧 中位 ${d.小结.中位毫秒} 毫秒、P90 ${d.小结.P90毫秒}、P99 ${d.小结.P99毫秒}；出帧合计 ${秒(帧总)}`,
  ];
  if (d.阶段.length) 行们.push('阶段：', ...d.阶段.map((r) => `  ${r.阶段.padEnd(8, '　')} ${r.秒.toFixed(1)} 秒`));
  if (d.等待.length) {
    行们.push('等得最多（delayRender，可能重叠，加起来不等于出帧合计）：');
    for (const w of d.等待.slice(0, 10)) 行们.push(`  ${秒(w.总毫秒).padStart(9)}  ${String(w.次).padStart(5)} 次  最长 ${秒(w.最大毫秒)}  ${w.标签}`);
  }
  if (d.小结.最慢帧.length) {
    行们.push('最慢的帧：');
    for (const f of d.小结.最慢帧) {
      const 等 = d.帧.find((x) => x.帧 === f.帧)?.等 ?? {};
      行们.push(`  第 ${f.帧} 帧 ${f.毫秒} 毫秒  ${Object.entries(等).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join('、')}`);
    }
  }
  if (d.系统.length) {
    const 最大 = (取: (s: 系统采样) => number | null) => Math.max(...d.系统.map((s) => 取(s) ?? 0));
    行们.push(`机器（${d.系统.length} 次采样的最大值）：负载 ${最大((s) => s.负载)}，子进程内存 ${最大((s) => s.子进程内存GB)} GB，子进程 CPU ${最大((s) => s.子进程CPU)}%，换出 ${最大((s) => s.换出GB)} GB；空闲内存最少 ${Math.min(...d.系统.map((s) => s.空闲内存GB))} GB`);
    if (d.系统.some((s) => s.后台CPU != null)) 行们.push(`后台转存（同时在转的，不算进上面的子进程）：内存 ${最大((s) => s.后台内存GB ?? null)} GB，CPU ${最大((s) => s.后台CPU ?? null)}%`);
  }
  if (文件) 行们.push(`文件：${文件}`);
  return 行们.join('\n');
};

/** anim 耗时：最近几次一行一条 */
export const 明细一览 = (们: readonly { 明细: 渲染明细 }[]) =>
  们.map(({ 明细: d }) => `${d.开始}  ${d.总秒.toFixed(0).padStart(5)} 秒  ${String(d.小结.帧数).padStart(5)} 帧  中位 ${String(d.小结.中位毫秒).padStart(5)} 毫秒  P90 ${String(d.小结.P90毫秒).padStart(5)}  首帧 ${秒(d.小结.首帧毫秒).padStart(8)}  ${d.等待[0]?.标签 ?? ''}  ${d.标签}`).join('\n');
