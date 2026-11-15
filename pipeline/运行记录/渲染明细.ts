// 渲染明细：每次 renderMedia、renderStill 留一份 JSON，看一段的时间花在哪一帧、等哪个 delayRender，渲的时候机器忙不忙。用 anim 耗时 看。
// 不改 engine：engine 进指纹，往里加计时全片过期。数据取自 Remotion 的 verbose 日志（页面的 delayRender 清除时报标签和毫秒）和 onProgress，日志级别不进指纹、不改像素（docs/渲染性能.md 有核对）。
// 帧的毫秒是相邻两次 onProgress 的差（并发 1，每帧回调一次），含截图、交给编码器；delayRender 可能重叠，各标签加起来不等于帧的毫秒。
// 占地：每帧约 100 字节，一份最多几百 KB，只留最近 保留份数 份。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { readTempParallel, noTempReading, type TempReading } from '../环境/温度.ts';
import {readMemory,readPressure} from '../环境/资源.ts';
import {currentTicket,gateHeartbeat} from '../闸/闸.ts';
import { writeJson, promptOnly } from '../闸/文件.ts';
import os from 'node:os';
import path from 'node:path';
import { timingLogPath, config } from '../环境/配置.ts';
import type { StageRecord } from './阶段.ts';

const formatVersion = 1;
const defaultKeepCount = 300;
const sampleIntervalMs = 10_000;
// 一帧里短于这个的等待不逐帧记（只进总表），不然文件翻几倍
const frameWaitMinMs = 20;

export type FrameRecord = { 帧: number; 毫秒: number; 等?: Record<string, number> };
export type WaitStat = { 标签: string; 次: number; 总毫秒: number; 最大毫秒: number };
type SamplePoint = '开始' | '采样' | '结束';
export type SystemSample = Partial<TempReading> & { 时点?: SamplePoint; 闸?:number|null; 压力?:number|null; 秒: number; 负载: number; 空闲内存GB: number; 换出GB: number | null; 子进程内存GB: number | null; 子进程CPU: number | null };
export type DetailSummary = { 帧数: number; 首帧毫秒: number; 中位毫秒: number; P90毫秒: number; P99毫秒: number; 最慢帧: { 帧: number; 毫秒: number }[] };
export type RenderDetail = {
  票?: string;
  版本: number;
  标签: string;
  开始: string;
  总秒: number;
  主机: string;
  平台: string;
  环境: Record<string, string>;
  小结: DetailSummary;
  等待: WaitStat[];
  阶段: StageRecord[];
  系统: SystemSample[];
  温度?: { 开始: TempReading; 结束: TempReading; 最高: TempReading };
  帧: FrameRecord[];
};

export const detailDir = () => path.join(path.dirname(timingLogPath()), '渲染明细');

const ANSI = /\u001b\[[0-9;]*m/g;

/** 标签里的帧号、地址、块数换成 #，同一类等待才归得到一起 */
export const classifyLabel = (label: string) =>
  label
    .replace(/ - See https?:.*$/, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 48);

/** 一行 Remotion 日志是 delayRender 清除的话，取标签和毫秒 */
export const parseWait = (line: string): { 标签: string; 毫秒: number } | null => {
  // Remotion 无色标签用方括号，彩色标签用背景色和空格（Windows 默认启用颜色）；去掉 ANSI 后两种边界都要认。
  const m = /delayRender\(\)\]?[ \t]+"(.*)" handle was cleared after (\d+)ms\s*$/.exec(line.replace(ANSI, ''));
  return m ? { 标签: classifyLabel(m[1]!), 毫秒: Number(m[2]) } : null;
};

const quantile = (ascending: number[], p: number) => (ascending.length ? ascending[Math.min(ascending.length - 1, Math.floor(p * ascending.length))]! : 0);

export const computeSummary = (frameRecords: readonly FrameRecord[]): DetailSummary => {
  // 首帧要建场景，单算，不进分位
  const restFrameMs = frameRecords.slice(1).map((f) => f.毫秒).sort((a, b) => a - b);
  return {
    帧数: frameRecords.length,
    首帧毫秒: frameRecords[0]?.毫秒 ?? 0,
    中位毫秒: quantile(restFrameMs, 0.5),
    P90毫秒: quantile(restFrameMs, 0.9),
    P99毫秒: quantile(restFrameMs, 0.99),
    最慢帧: [...frameRecords].slice(1).sort((a, b) => b.毫秒 - a.毫秒).slice(0, 5).map((f) => ({ 帧: f.帧, 毫秒: f.毫秒 })),
  };
};

const runCapture = (cmd: string, args: string[]) =>
  new Promise<string | null>((resolve) => {
    execFile(cmd, args, { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err ? null : out));
  });

const parsePs = (psOutput: string) => psOutput.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).filter((c) => c.length >= 4 && c.every(Number.isFinite));
/** 根的子孙（不含根） */
const descendants = (rows: number[][], rootNode: number) => {
  const childrenByPid = new Map<number, number[]>();
  for (const [pid, ppid] of rows) childrenByPid.set(ppid!, [...(childrenByPid.get(ppid!) ?? []), pid!]);
  const descendants = new Set<number>();
  const stack = [rootNode];
  while (stack.length) for (const c of childrenByPid.get(stack.pop()!) ?? []) if (!descendants.has(c)) (descendants.add(c), stack.push(c));
  return descendants;
};
const sumRows = (rows: number[][], pidSet: ReadonlySet<number>) => {
  let kb = 0;
  let cpu = 0;
  for (const [pid, , rss, pc] of rows) if (pidSet.has(pid!)) (kb += rss!, cpu += pc!);
  return { memoryGb: Number((kb / 1024 / 1024).toFixed(2)), CPU: Number(cpu.toFixed(0)) };
};

/** 本进程的子孙（浏览器、ffmpeg）的内存和 CPU；Windows 没有 ps，记 null */
export const sumDescendants = (psOutput: string, rootNode: number) => {
  const rows = parsePs(psOutput);
  return sumRows(rows, descendants(rows, rootNode));
};

/** vm.swapusage 的 used = 123.00M */
export const parseSwapOut = (output: string): number | null => {
  const m = /used = ([\d.]+)([MGK])/.exec(output);
  return m ? Number((Number(m[1]) * { K: 1 / 1024 / 1024, M: 1 / 1024, G: 1 }[m[2] as 'K' | 'M' | 'G']).toFixed(2)) : null;
};

const takeSample = async (startMs: number, timePoint: SamplePoint): Promise<SystemSample> => {
  // 时间戳对齐出帧的起点，不能等子进程返回后再取，否则慢探针会把峰值挪到后面的帧。
  const sec = Number(((Date.now() - startMs) / 1000).toFixed(3));
  const [ps, swapOut, temperature] = await Promise.all([
    process.platform === 'win32' ? null : runCapture('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=']),
    process.platform === 'darwin' ? runCapture('sysctl', ['-n', 'vm.swapusage']) : null,
    Promise.resolve().then(readTempParallel).catch(noTempReading),
  ]);
  const memory=readMemory();
  const descendants = ps ? sumDescendants(ps, process.pid) : null;
  return {
    秒: sec, 时点: timePoint, ...temperature,
    负载: Number(os.loadavg()[0]!.toFixed(1)),
    空闲内存GB: Number(((memory?.空闲 ?? os.freemem()) / 1024 ** 3).toFixed(1)),
    闸:memory?.空闲百分比??null,压力:readPressure(),
    换出GB: swapOut ? parseSwapOut(swapOut) : null,
    子进程内存GB: descendants?.memoryGb ?? null,
    子进程CPU: descendants?.CPU ?? null,
  };
};

const tempSummary = (systemSamples: readonly SystemSample[]): NonNullable<RenderDetail['温度']> => {
  const toReading = (s?: SystemSample): TempReading => ({ 芯片最高温: s?.芯片最高温 ?? null, 发热等级: s?.发热等级 ?? null });
  const peakOf = (propKey: keyof TempReading) => {
    const values = systemSamples.flatMap(s => s[propKey] == null ? [] : [s[propKey]!]);
    return values.length ? Math.max(...values) : null;
  };
  return { 开始: toReading(systemSamples.find(s => s.时点 === '开始')), 结束: toReading(systemSamples.findLast(s => s.时点 === '结束')), 最高: { 芯片最高温: peakOf('芯片最高温'), 发热等级: peakOf('发热等级') } };
};

/** 一次渲染的收集器：包住 renderMedia（把 verbose 日志收走不刷屏），onProgress 传进去，完了 写出 */
export class DetailCollector {
  frameRecords: FrameRecord[] = [];
  private 等待 = new Map<string, WaitStat>();
  private currentWaits: Record<string, number> = {};
  private 系统: SystemSample[] = [];
  private lastTime = 0;
  private lastFrameCount = 0;
  private 起 = Date.now();
  private 止: number | null = null;
  private 票 = currentTicket();
  private timer: NodeJS.Timeout | null = null;
  private pendingSamples: Promise<unknown>[] = [];

  private 标签: string;
  private startFrame: number;

  constructor(label: string, startFrame = 0) {
    this.标签 = label;
    this.startFrame = startFrame;
  }

  行(logText: string) {
    const w = parseWait(logText);
    if (!w) return;
    const s = this.等待.get(w.标签) ?? { 标签: w.标签, 次: 0, 总毫秒: 0, 最大毫秒: 0 };
    s.次++;
    s.总毫秒 += w.毫秒;
    s.最大毫秒 = Math.max(s.最大毫秒, w.毫秒);
    this.等待.set(w.标签, s);
    if (w.毫秒 >= frameWaitMinMs) this.currentWaits[w.标签] = (this.currentWaits[w.标签] ?? 0) + w.毫秒;
  }

  /** 进度回调的同一帧数可能回调多次（编码进度也走这里），帧数变了才算出了一帧 */
  frameDone(framesDone: number, now = Date.now()) {
    gateHeartbeat(framesDone);
    if (framesDone === this.lastFrameCount) return;
    const newFrames = framesDone - this.lastFrameCount;
    const frameMs = Math.round((now - (this.lastFrameCount === 0 ? this.起 : this.lastTime)) / newFrames);
    for (let k = 0; k < newFrames; k++) {
      const waits = k === 0 && Object.keys(this.currentWaits).length ? { 等: this.currentWaits } : {};
      this.frameRecords.push({ 帧: this.startFrame + this.lastFrameCount + k, 毫秒: frameMs, ...waits });
    }
    this.currentWaits = {};
    this.lastTime = now;
    this.lastFrameCount = framesDone;
  }

  /** fn 期间 console.log 全归 Remotion（只包 renderMedia、renderStill，它们不打别的）：verbose 日志不刷屏；系统采样同时跑。原样留一份给 转发（bench --详细 的日志文件） */
  async 包<T>(fn: () => Promise<T>, forward?: (logText: string) => void): Promise<T> {
    const originalLog = console.log;
    console.log = (...a: unknown[]) => {
      const logText = a.map(String).join(' ');
      this.行(logText);
      forward?.(logText);
    };
    this.起 = Date.now();
    this.pendingSamples.push(takeSample(this.起, '开始').then((x) => this.系统.push(x)));
    this.timer = setInterval(() => this.pendingSamples.push(takeSample(this.起, '采样').then((x) => this.系统.push(x))), sampleIntervalMs);
    this.timer.unref();
    try {
      return await fn();
    } finally {
      console.log = originalLog;
      clearInterval(this.timer);
      this.pendingSamples.push(takeSample(this.起, '结束').then((x) => this.系统.push(x)));
    }
  }

  /** 总秒止于出完片：渲段之后在闸里派生段签、删旧，不算进这次渲染 */
  stopTimer(now = Date.now()) {
    this.止 = now;
  }

  /** 写出明细文件；写不成只提示，不影响渲染 */
  async writeOut(stages: readonly StageRecord[], env: Record<string, string> = {}, dir = detailDir()): Promise<{ 文件: string | null; 明细: RenderDetail }> {
    await Promise.allSettled(this.pendingSamples);
    const detail: RenderDetail = {
      版本: formatVersion,
      票:this.票,
      标签: this.标签,
      开始: new Date(this.起).toISOString().replace(/\.\d+Z$/, 'Z'),
      总秒: Number((((this.止 ?? Date.now()) - this.起) / 1000).toFixed(2)),
      主机: config('主机'),
      平台: `${process.platform}-${process.arch}`,
      环境: env,
      小结: computeSummary(this.frameRecords),
      等待: [...this.等待.values()].sort((a, b) => b.总毫秒 - a.总毫秒),
      阶段: stages.filter((r) => r.标签 === this.标签),
      系统: this.系统.sort((a, b) => a.秒 - b.秒),
      温度: this.系统.length ? tempSummary(this.系统) : undefined,
      帧: this.frameRecords,
    };
    try {
      const fileName = `${detail.开始.replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}-${this.标签.replace(/[\\/:*?"<>|\s]+/g, '_')}-${process.pid}.json`;
      const file = path.join(dir, fileName);
      writeJson(file, detail);
      promptOnly('清旧明细', () => clearOldDetails(dir));
      return { 文件: file, 明细: detail };
    } catch (e) {
      console.error(`!! 渲染明细没写成：${(e as Error).message}`);
      return { 文件: null, 明细: detail };
    }
  }
}

const listDetails = (detailDir: string) => (fs.existsSync(detailDir) ? fs.readdirSync(detailDir).filter((f) => f.endsWith('.json')).sort() : []);

/** 种从文件名取（<开始>-<标签>-<pid>.json，标签里的 : 变 _）：不解析内容，半截的文件照常轮转，也不用每次把几百份全读一遍。 */
const detailKind = (f: string) => /^\d{8}-\d{6}-([^_]+)_/.exec(f)?.[1] ?? '未知';

export const clearOldDetails = (detailDir: string, keepCount = defaultKeepCount) => {
  const byKind = new Map<string, string[]>();
  for (const f of listDetails(detailDir)) byKind.set(detailKind(f), [...(byKind.get(detailKind(f)) ?? []), f]);
  for (const files of byKind.values()) for (const f of files.slice(0, Math.max(0, files.length - keepCount))) fs.rmSync(path.join(detailDir, f), { force: true });
};

/** 最近的明细，新的在前；给了 含 只要标签里含这个字的 */
export const readDetailList = (o: { contains?: string; 最多?: number; 目录?: string } = {}): { 文件: string; 明细: RenderDetail }[] => {
  const dir = o.目录 ?? detailDir();
  const entries: { 文件: string; 明细: RenderDetail }[] = [];
  for (const f of listDetails(dir).reverse()) {
    if (o.contains && !f.includes(o.contains.replace(/[\\/:*?"<>|\s]+/g, '_'))) continue;
    try {
      entries.push({ 文件: path.join(dir, f), 明细: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RenderDetail });
    } catch {
      continue;
    }
    if (o.最多 && entries.length >= o.最多) break;
  }
  return entries;
};

const fmtSec = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} 秒`;

const tempReport = (d: RenderDetail) => {
  const t = d.温度?.最高;
  return [t?.芯片最高温 == null ? '' : `最高芯温 ${t.芯片最高温.toFixed(1)}°C`, t?.发热等级 == null ? '' : `最高发热等级 ${t.发热等级}`].filter(Boolean).join('，');
};

/** anim 耗时 <段>：一份明细给人看的报告 */
export const detailReport = (d: RenderDetail, file?: string) => {
  const frameTotalMs = d.帧.reduce((a, f) => a + f.毫秒, 0);
  const lines = [
    `${d.标签}  ${d.开始}  ${d.主机}（${d.平台}）`,
    ...Object.entries(d.环境).map(([k, v]) => `  ${k}：${v}`),
    `总 ${d.总秒.toFixed(1)} 秒，${d.小结.帧数} 帧，首帧 ${fmtSec(d.小结.首帧毫秒)}；其后每帧 中位 ${d.小结.中位毫秒} 毫秒、P90 ${d.小结.P90毫秒}、P99 ${d.小结.P99毫秒}；出帧合计 ${fmtSec(frameTotalMs)}`,
  ];
  if (d.阶段.length) lines.push('阶段：', ...d.阶段.map((r) => `  ${r.阶段.padEnd(8, '　')} ${r.秒.toFixed(1)} 秒`));
  if (d.等待.length) {
    lines.push('等得最多（delayRender，可能重叠，加起来不等于出帧合计）：');
    for (const w of d.等待.slice(0, 10)) lines.push(`  ${fmtSec(w.总毫秒).padStart(9)}  ${String(w.次).padStart(5)} 次  最长 ${fmtSec(w.最大毫秒)}  ${w.标签}`);
  }
  if (d.小结.最慢帧.length) {
    lines.push('最慢的帧：');
    for (const f of d.小结.最慢帧) {
      const waits = d.帧.find((x) => x.帧 === f.帧)?.等 ?? {};
      lines.push(`  第 ${f.帧} 帧 ${f.毫秒} 毫秒  ${Object.entries(waits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join('、')}`);
    }
  }
  if (d.系统.length) {
    const maxOf = (extract: (s: SystemSample) => number | null) => Math.max(...d.系统.map((s) => extract(s) ?? 0));
    lines.push(`机器（${d.系统.length} 次采样的最大值）：负载 ${maxOf((s) => s.负载)}，子进程内存 ${maxOf((s) => s.子进程内存GB)} GB，子进程 CPU ${maxOf((s) => s.子进程CPU)}%，换出 ${maxOf((s) => s.换出GB)} GB；空闲内存最少 ${Math.min(...d.系统.map((s) => s.空闲内存GB))} GB`);
  }
  if (tempReport(d)) lines.push(`温度（采样峰值）：${tempReport(d)}`);
  if (file) lines.push(`文件：${file}`);
  return lines.join('\n');
};

/** anim 耗时：最近几次一行一条 */
export const detailOverview = (details: readonly { 明细: RenderDetail }[]) =>
  details.map(({ 明细: d }) => `${d.开始}  ${d.总秒.toFixed(0).padStart(5)} 秒  ${String(d.小结.帧数).padStart(5)} 帧  中位 ${String(d.小结.中位毫秒).padStart(5)} 毫秒  P90 ${String(d.小结.P90毫秒).padStart(5)}  首帧 ${fmtSec(d.小结.首帧毫秒).padStart(8)}  ${d.等待[0]?.标签 ?? ''}  ${d.标签}${tempReport(d) ? '  ' + tempReport(d) : ''}`).join('\n');
