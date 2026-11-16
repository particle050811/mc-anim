// 渲染明细：每次 renderMedia、renderStill 留一份 JSON，看一段的时间花在哪一帧、等哪个 delayRender，渲的时候机器忙不忙。用 anim timing 看。
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

export type FrameRecord = { frame: number; ms: number; waits?: Record<string, number> };
export type WaitStat = { label: string; count: number; totalMs: number; maxMs: number };
type SamplePoint = '开始' | '采样' | '结束';
export type SystemSample = Partial<TempReading> & { timePoint?: SamplePoint; gate?:number|null; pressure?:number|null; sec: number; load: number; freeMemoryGb: number; swapOutGb: number | null; childMemoryGb: number | null; childCpu: number | null };
export type DetailSummary = { frameCount: number; firstFrameMs: number; medianMs: number; p90Ms: number; p99Ms: number; slowestFrames: { frame: number; ms: number }[] };
export type RenderDetail = {
  ticket?: string;
  version: number;
  label: string;
  startedAt: string;
  totalSec: number;
  host: string;
  platform: string;
  env: Record<string, string>;
  summary: DetailSummary;
  waiting: WaitStat[];
  stage: StageRecord[];
  system: SystemSample[];
  temperature?: { startedAt: TempReading; endedAt: TempReading; peak: TempReading };
  frame: FrameRecord[];
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
export const parseWait = (line: string): { label: string; ms: number } | null => {
  // Remotion 无色标签用方括号，彩色标签用背景色和空格（Windows 默认启用颜色）；去掉 ANSI 后两种边界都要认。
  const m = /delayRender\(\)\]?[ \t]+"(.*)" handle was cleared after (\d+)ms\s*$/.exec(line.replace(ANSI, ''));
  return m ? { label: classifyLabel(m[1]!), ms: Number(m[2]) } : null;
};

const quantile = (ascending: number[], p: number) => (ascending.length ? ascending[Math.min(ascending.length - 1, Math.floor(p * ascending.length))]! : 0);

export const computeSummary = (frameRecords: readonly FrameRecord[]): DetailSummary => {
  // 首帧要建场景，单算，不进分位
  const restFrameMs = frameRecords.slice(1).map((f) => f.ms).sort((a, b) => a - b);
  return {
    frameCount: frameRecords.length,
    firstFrameMs: frameRecords[0]?.ms ?? 0,
    medianMs: quantile(restFrameMs, 0.5),
    p90Ms: quantile(restFrameMs, 0.9),
    p99Ms: quantile(restFrameMs, 0.99),
    slowestFrames: [...frameRecords].slice(1).sort((a, b) => b.ms - a.ms).slice(0, 5).map((f) => ({ frame: f.frame, ms: f.ms })),
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
    sec: sec, timePoint: timePoint, ...temperature,
    load: Number(os.loadavg()[0]!.toFixed(1)),
    freeMemoryGb: Number(((memory?.free ?? os.freemem()) / 1024 ** 3).toFixed(1)),
    gate:memory?.freePercent??null,pressure:readPressure(),
    swapOutGb: swapOut ? parseSwapOut(swapOut) : null,
    childMemoryGb: descendants?.memoryGb ?? null,
    childCpu: descendants?.CPU ?? null,
  };
};

const tempSummary = (systemSamples: readonly SystemSample[]): NonNullable<RenderDetail['temperature']> => {
  const toReading = (s?: SystemSample): TempReading => ({ chipMaxTemp: s?.chipMaxTemp ?? null, thermalLevel: s?.thermalLevel ?? null });
  const peakOf = (propKey: keyof TempReading) => {
    const values = systemSamples.flatMap(s => s[propKey] == null ? [] : [s[propKey]!]);
    return values.length ? Math.max(...values) : null;
  };
  return { startedAt: toReading(systemSamples.find(s => s.timePoint === '开始')), endedAt: toReading(systemSamples.findLast(s => s.timePoint === '结束')), peak: { chipMaxTemp: peakOf('chipMaxTemp'), thermalLevel: peakOf('thermalLevel') } };
};

/** 一次渲染的收集器：包住 renderMedia（把 verbose 日志收走不刷屏），onProgress 传进去，完了 写出 */
export class DetailCollector {
  frameRecords: FrameRecord[] = [];
  private waiting = new Map<string, WaitStat>();
  private currentWaits: Record<string, number> = {};
  private system: SystemSample[] = [];
  private lastTime = 0;
  private lastFrameCount = 0;
  private start = Date.now();
  private end: number | null = null;
  private ticket = currentTicket();
  private timer: NodeJS.Timeout | null = null;
  private pendingSamples: Promise<unknown>[] = [];

  private label: string;
  private startFrame: number;

  constructor(label: string, startFrame = 0) {
    this.label = label;
    this.startFrame = startFrame;
  }

  行(logText: string) {
    const w = parseWait(logText);
    if (!w) return;
    const s = this.waiting.get(w.label) ?? { label: w.label, count: 0, totalMs: 0, maxMs: 0 };
    s.count++;
    s.totalMs += w.ms;
    s.maxMs = Math.max(s.maxMs, w.ms);
    this.waiting.set(w.label, s);
    if (w.ms >= frameWaitMinMs) this.currentWaits[w.label] = (this.currentWaits[w.label] ?? 0) + w.ms;
  }

  /** 进度回调的同一帧数可能回调多次（编码进度也走这里），帧数变了才算出了一帧 */
  frameDone(framesDone: number, now = Date.now()) {
    gateHeartbeat(framesDone);
    if (framesDone === this.lastFrameCount) return;
    const newFrames = framesDone - this.lastFrameCount;
    const frameMs = Math.round((now - (this.lastFrameCount === 0 ? this.start : this.lastTime)) / newFrames);
    for (let k = 0; k < newFrames; k++) {
      const waits = k === 0 && Object.keys(this.currentWaits).length ? { waits: this.currentWaits } : {};
      this.frameRecords.push({ frame: this.startFrame + this.lastFrameCount + k, ms: frameMs, ...waits });
    }
    this.currentWaits = {};
    this.lastTime = now;
    this.lastFrameCount = framesDone;
  }

  /** fn 期间 console.log 全归 Remotion（只包 renderMedia、renderStill，它们不打别的）：verbose 日志不刷屏；系统采样同时跑。原样留一份给 转发（bench --verbose 的日志文件） */
  async pack<T>(fn: () => Promise<T>, forward?: (logText: string) => void): Promise<T> {
    const originalLog = console.log;
    console.log = (...a: unknown[]) => {
      const logText = a.map(String).join(' ');
      this.行(logText);
      forward?.(logText);
    };
    this.start = Date.now();
    this.pendingSamples.push(takeSample(this.start, '开始').then((x) => this.system.push(x)));
    this.timer = setInterval(() => this.pendingSamples.push(takeSample(this.start, '采样').then((x) => this.system.push(x))), sampleIntervalMs);
    this.timer.unref();
    try {
      return await fn();
    } finally {
      console.log = originalLog;
      clearInterval(this.timer);
      this.pendingSamples.push(takeSample(this.start, '结束').then((x) => this.system.push(x)));
    }
  }

  /** 总秒止于出完片：渲段之后在闸里派生段签、删旧，不算进这次渲染 */
  stopTimer(now = Date.now()) {
    this.end = now;
  }

  /** 写出明细文件；写不成只提示，不影响渲染 */
  async writeOut(stages: readonly StageRecord[], env: Record<string, string> = {}, dir = detailDir()): Promise<{ file: string | null; detail: RenderDetail }> {
    await Promise.allSettled(this.pendingSamples);
    const detail: RenderDetail = {
      version: formatVersion,
      ticket:this.ticket,
      label: this.label,
      startedAt: new Date(this.start).toISOString().replace(/\.\d+Z$/, 'Z'),
      totalSec: Number((((this.end ?? Date.now()) - this.start) / 1000).toFixed(2)),
      host: config('主机'),
      platform: `${process.platform}-${process.arch}`,
      env: env,
      summary: computeSummary(this.frameRecords),
      waiting: [...this.waiting.values()].sort((a, b) => b.totalMs - a.totalMs),
      stage: stages.filter((r) => r.label === this.label),
      system: this.system.sort((a, b) => a.sec - b.sec),
      temperature: this.system.length ? tempSummary(this.system) : undefined,
      frame: this.frameRecords,
    };
    try {
      const fileName = `${detail.startedAt.replace(/[-:]/g, '').replace('T', '-').replace('Z', '')}-${this.label.replace(/[\\/:*?"<>|\s]+/g, '_')}-${process.pid}.json`;
      const file = path.join(dir, fileName);
      writeJson(file, detail);
      promptOnly('清旧明细', () => clearOldDetails(dir));
      return { file: file, detail: detail };
    } catch (e) {
      console.error(`!! 渲染明细没写成：${(e as Error).message}`);
      return { file: null, detail: detail };
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
export const readDetailList = (o: { contains?: string; 最多?: number; 目录?: string } = {}): { file: string; detail: RenderDetail }[] => {
  const dir = o.目录 ?? detailDir();
  const entries: { file: string; detail: RenderDetail }[] = [];
  for (const f of listDetails(dir).reverse()) {
    if (o.contains && !f.includes(o.contains.replace(/[\\/:*?"<>|\s]+/g, '_'))) continue;
    try {
      entries.push({ file: path.join(dir, f), detail: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RenderDetail });
    } catch {
      continue;
    }
    if (o.最多 && entries.length >= o.最多) break;
  }
  return entries;
};

const fmtSec = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} 秒`;

const tempReport = (d: RenderDetail) => {
  const t = d.temperature?.peak;
  return [t?.chipMaxTemp == null ? '' : `最高芯温 ${t.chipMaxTemp.toFixed(1)}°C`, t?.thermalLevel == null ? '' : `最高发热等级 ${t.thermalLevel}`].filter(Boolean).join('，');
};

/** anim timing <段>：一份明细给人看的报告 */
export const detailReport = (d: RenderDetail, file?: string) => {
  const frameTotalMs = d.frame.reduce((a, f) => a + f.ms, 0);
  const lines = [
    `${d.label}  ${d.startedAt}  ${d.host}（${d.platform}）`,
    ...Object.entries(d.env).map(([k, v]) => `  ${k}：${v}`),
    `总 ${d.totalSec.toFixed(1)} 秒，${d.summary.frameCount} 帧，首帧 ${fmtSec(d.summary.firstFrameMs)}；其后每帧 中位 ${d.summary.medianMs} 毫秒、P90 ${d.summary.p90Ms}、P99 ${d.summary.p99Ms}；出帧合计 ${fmtSec(frameTotalMs)}`,
  ];
  if (d.stage.length) lines.push('阶段：', ...d.stage.map((r) => `  ${r.stage.padEnd(8, '　')} ${r.sec.toFixed(1)} 秒`));
  if (d.waiting.length) {
    lines.push('等得最多（delayRender，可能重叠，加起来不等于出帧合计）：');
    for (const w of d.waiting.slice(0, 10)) lines.push(`  ${fmtSec(w.totalMs).padStart(9)}  ${String(w.count).padStart(5)} 次  最长 ${fmtSec(w.maxMs)}  ${w.label}`);
  }
  if (d.summary.slowestFrames.length) {
    lines.push('最慢的帧：');
    for (const f of d.summary.slowestFrames) {
      const waits = d.frame.find((x) => x.frame === f.frame)?.waits ?? {};
      lines.push(`  第 ${f.frame} 帧 ${f.ms} 毫秒  ${Object.entries(waits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join('、')}`);
    }
  }
  if (d.system.length) {
    const maxOf = (extract: (s: SystemSample) => number | null) => Math.max(...d.system.map((s) => extract(s) ?? 0));
    lines.push(`机器（${d.system.length} 次采样的最大值）：负载 ${maxOf((s) => s.load)}，子进程内存 ${maxOf((s) => s.childMemoryGb)} GB，子进程 CPU ${maxOf((s) => s.childCpu)}%，换出 ${maxOf((s) => s.swapOutGb)} GB；空闲内存最少 ${Math.min(...d.system.map((s) => s.freeMemoryGb))} GB`);
  }
  if (tempReport(d)) lines.push(`温度（采样峰值）：${tempReport(d)}`);
  if (file) lines.push(`文件：${file}`);
  return lines.join('\n');
};

/** anim timing：最近几次一行一条 */
export const detailOverview = (details: readonly { detail: RenderDetail }[]) =>
  details.map(({ detail: d }) => `${d.startedAt}  ${d.totalSec.toFixed(0).padStart(5)} 秒  ${String(d.summary.frameCount).padStart(5)} 帧  中位 ${String(d.summary.medianMs).padStart(5)} 毫秒  P90 ${String(d.summary.p90Ms).padStart(5)}  首帧 ${fmtSec(d.summary.firstFrameMs).padStart(8)}  ${d.waiting[0]?.label ?? ''}  ${d.label}${tempReport(d) ? '  ' + tempReport(d) : ''}`).join('\n');
