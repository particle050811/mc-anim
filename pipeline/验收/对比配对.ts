// anim diff 的两边怎么配对、怎么读像素。A 是旧（改前），B 是新（改后），差 = B − A。
// 目录：同名的配一对；剩下的按名字里的帧号（「第N帧」，没有就取最后一串数字）配，两边各只有一个这个帧号才配。
// 视频：按帧号对齐抽帧，yuv420p 原样解出来按 比较.ts 的固定公式换 RGB（和 verify 一样，不经 swscale）；两边帧数不同只比到短的那边。
// 帧是哪段第几帧（复查命令要）：静帧看文件名 <段键>-第N帧；视频看旁边 anim film 写的 manifest.json（试看片带 frames 起点），也可以 --seg 指定。
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../环境/配置.ts';
import { runCapture } from '../环境/子进程.ts';
import { videoInfo } from '../渲/探测.ts';
import { yuvToRgb } from './比较.ts';
import { pngToRgb } from './帧差.ts';
import { frameStream, sampleFrames } from './帧流.ts';

export type SegFrame = { segKey: string; frame: number };
/** 一对要比的帧：label 是在表里、文件名里怎么称呼它；segFrame 能定出是哪段第几帧时有；variant 是静帧文件名里帧号后面的后缀（-望远-…、-光影-…） */
export type PairPlan = { label: string; aFile: string; bFile: string; frame: number | null; segFrame: SegFrame | null; variant: string };
export type DiffPlan = {
  kind: '图' | '视频';
  pairs: PairPlan[];
  onlyA: string[];
  onlyB: string[];
  notes: string[];
  /** 视频：两边文件和要比的帧 */
  video?: { a: string; b: string; frames: number[]; width: number; height: number };
  /** 视频试看片的试看参数（manifest.json 的 trial），复查时要照设 */
  trialEnv?: { a?: Record<string, string>; b?: Record<string, string> };
};

const videoExts = new Set(['.mp4', '.mov', '.mkv', '.webm']);
const imageExts = new Set(['.png']);

const stillName = /^(.+)-第(\d+)帧(.*)\.png$/i;

/** 静帧文件名 <段键>-第N帧<后缀>.png 拆开；不是这个样子返回 null */
export const parseStillName = (name: string): { segKey: string; frame: number; variant: string } | null => {
  const m = stillName.exec(name);
  return m ? { segKey: m[1]!, frame: Number(m[2]), variant: m[3]! } : null;
};

/** 配对用的帧号：「第N帧」，没有就取文件名（去扩展名）里最后一串数字 */
export const frameKey = (name: string): number | null => {
  const s = parseStillName(name);
  if (s) return s.frame;
  const nums = path.parse(name).name.match(/\d+/g);
  return nums ? Number(nums.at(-1)) : null;
};

const pairOf = (label: string, aFile: string, bFile: string): PairPlan => {
  const s = parseStillName(path.basename(bFile)) ?? parseStillName(path.basename(aFile));
  return { label, aFile, bFile, frame: s?.frame ?? frameKey(path.basename(bFile)), segFrame: s ? { segKey: s.segKey, frame: s.frame } : null, variant: s?.variant ?? '' };
};

/** 两个目录里的图配对（只看一层） */
export const pairDirs = (aDir: string, bDir: string): Pick<DiffPlan, 'pairs' | 'onlyA' | 'onlyB' | 'notes'> => {
  const list = (d: string) => fs.readdirSync(d).filter((n) => imageExts.has(path.extname(n).toLowerCase()) && fs.statSync(path.join(d, n)).isFile()).sort();
  const aNames = list(aDir), bNames = list(bDir);
  const bSet = new Set(bNames);
  const pairs: PairPlan[] = [];
  const restA: string[] = [], restB = new Set(bNames);
  for (const n of aNames) {
    if (bSet.has(n)) {
      pairs.push(pairOf(n.replace(/\.png$/i, ''), path.join(aDir, n), path.join(bDir, n)));
      restB.delete(n);
    } else restA.push(n);
  }
  const notes: string[] = [];
  // 剩下的按帧号配：两边都只有一张是这个帧号才算
  const byFrame = (names: Iterable<string>) => {
    const m = new Map<number, string[]>();
    for (const n of names) {
      const k = frameKey(n);
      if (k !== null) m.set(k, [...(m.get(k) ?? []), n]);
    }
    return m;
  };
  const aByFrame = byFrame(restA), bByFrame = byFrame(restB);
  const onlyA = new Set(restA);
  for (const [k, an] of aByFrame) {
    const bn = bByFrame.get(k);
    if (an.length !== 1 || bn?.length !== 1) continue;
    pairs.push(pairOf(`第${k}帧（${an[0]} ↔ ${bn[0]}）`, path.join(aDir, an[0]!), path.join(bDir, bn[0]!)));
    onlyA.delete(an[0]!);
    restB.delete(bn[0]!);
    notes.push(`${an[0]} 和 ${bn[0]} 名字不同，按帧号 ${k} 配成一对`);
  }
  pairs.sort((x, y) => (x.frame ?? Infinity) - (y.frame ?? Infinity) || x.label.localeCompare(y.label));
  return { pairs, onlyA: [...onlyA], onlyB: [...restB], notes };
};

const probeFps = (file: string) => {
  const r = runCapture([config('ffprobe'), '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file]).trim();
  const [n, d] = r.split('/').map(Number);
  return n && d ? n / d : 60;
};

type FilmManifest = { file?: { film?: string }; trial?: Record<string, string>; frames?: [number, number]; segment?: { key: string; frameCount: number; filmStartFrame: number }[] };

/** 视频旁边 anim film 写的 manifest.json（要写的就是这个文件）；没有、对不上返回 null */
export const readFilmManifest = (video: string): FilmManifest | null => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(path.dirname(video), 'manifest.json'), 'utf8')) as FilmManifest;
    return j.file?.film === path.basename(video) && Array.isArray(j.segment) ? j : null;
  } catch {
    return null;
  }
};

/** 成片第 filmFrame 帧是哪段第几帧（试看片 --frames 出的一截，段内帧号从 frames[0] 起） */
export const segFrameFromManifest = (m: FilmManifest, filmFrame: number): SegFrame | null => {
  const s = m.segment?.find((x) => filmFrame >= x.filmStartFrame && filmFrame < x.filmStartFrame + x.frameCount);
  if (!s) return null;
  return { segKey: s.key, frame: filmFrame - s.filmStartFrame + (m.frames && m.segment!.length === 1 ? m.frames[0] : 0) };
};

/** 视频要比的帧：--frames 给范围或列表，--every 给间隔；都没给是每秒一帧（含首尾） */
export const pickVideoFrames = (frameCount: number, fps: number, o: { frames?: number[]; every?: number }): number[] => {
  const every = o.every ?? Math.max(1, Math.round(fps));
  let frames = o.frames ? o.frames.filter((f) => f < frameCount) : sampleFrames(frameCount, every);
  if (o.frames && o.every) frames = frames.filter((f) => (f - frames[0]!) % o.every! === 0);
  return frames;
};

export type PlanOptions = { frames?: number[]; every?: number; seg?: SegFrame | null };

/** 看 A、B 是什么（两个目录、两张图、两个视频），排出要比的对 */
export const planDiff = (a: string, b: string, o: PlanOptions = {}): DiffPlan => {
  for (const p of [a, b]) if (!fs.existsSync(p)) throw new Error(`没有 ${p}`);
  const [sa, sb] = [fs.statSync(a), fs.statSync(b)];
  const kindOf = (p: string, st: fs.Stats) => (st.isDirectory() ? '目录' : videoExts.has(path.extname(p).toLowerCase()) ? '视频' : imageExts.has(path.extname(p).toLowerCase()) ? '图' : null);
  const [ka, kb] = [kindOf(a, sa), kindOf(b, sb)];
  if (!ka || !kb || ka !== kb) throw new Error(`A、B 要是两个目录、两张 PNG 或两个视频（mp4/mov/mkv/webm）：A 是${ka ?? '认不出的文件'}，B 是${kb ?? '认不出的文件'}`);
  if ((o.frames || o.every) && ka !== '视频') throw new Error('--frames、--every 只给视频用：目录按文件配对');
  if (ka === '目录') return { kind: '图', ...pairDirs(a, b) };
  if (ka === '图') return { kind: '图', pairs: [pairOf(path.basename(b).replace(/\.png$/i, ''), a, b)], onlyA: [], onlyB: [], notes: [] };
  const [ia, ib] = [videoInfo(a), videoInfo(b)];
  if (ia.width !== ib.width || ia.height !== ib.height) throw new Error(`两个视频尺寸不同：A ${ia.width}×${ia.height}，B ${ib.width}×${ib.height}`);
  const notes: string[] = [];
  const frameCount = Math.min(ia.frameCount, ib.frameCount);
  if (ia.frameCount !== ib.frameCount) notes.push(`两边帧数不同（A ${ia.frameCount}，B ${ib.frameCount}），只比前 ${frameCount} 帧`);
  const frames = pickVideoFrames(frameCount, probeFps(b), o);
  if (!frames.length) throw new Error(`要比的帧都不在视频里（只有 ${frameCount} 帧）`);
  const [ma, mb] = [readFilmManifest(a), readFilmManifest(b)];
  const segOf = (f: number): SegFrame | null => (o.seg ? { segKey: o.seg.segKey, frame: o.seg.frame + f } : mb ? segFrameFromManifest(mb, f) : ma ? segFrameFromManifest(ma, f) : null);
  if (!o.seg && !ma && !mb) notes.push('两个视频旁边都没有 anim film 的 manifest.json，定不出是哪段第几帧：复查命令里的段、帧要自己填（或者 --seg <段键>[@<视频第 0 帧是段内第几帧>]）');
  const pad = String(frames.at(-1)!).length;
  const pairs = frames.map((f) => ({ label: `第${String(f).padStart(pad, '0')}帧`, aFile: a, bFile: b, frame: f, segFrame: segOf(f), variant: '' }));
  return { kind: '视频', pairs, onlyA: [], onlyB: [], notes, video: { a, b, frames, width: ib.width, height: ib.height }, trialEnv: { a: ma?.trial, b: mb?.trial } };
};

export type DecodedPair = { pair: PairPlan; width: number; height: number; oldRgb: Buffer; newRgb: Buffer } | { pair: PairPlan; identical: { width: number; height: number } } | { pair: PairPlan; error: string };

/** PNG 头里的宽高（IHDR 在第 16～23 字节） */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

/** 按 plan 的顺序交出每对的像素；视频两边各起一个 ffmpeg 同步往下读 */
export async function* readPairs(plan: DiffPlan): AsyncGenerator<DecodedPair> {
  if (plan.kind === '图') {
    for (const pair of plan.pairs) {
      const [ab, bb] = [fs.readFileSync(pair.aFile), fs.readFileSync(pair.bFile)];
      // 字节一样就不解了（4K PNG 解一张要一秒多）
      if (ab.equals(bb)) {
        yield { pair, identical: pngSize(bb) };
        continue;
      }
      const a = pngToRgb(ab);
      const b = pngToRgb(bb);
      if (a.width !== b.width || a.height !== b.height) yield { pair, error: `尺寸不同：A ${a.width}×${a.height}，B ${b.width}×${b.height}` };
      else yield { pair, width: b.width, height: b.height, oldRgb: a.rgb, newRgb: b.rgb };
    }
    return;
  }
  const v = plan.video!;
  const sa = frameStream(v.a, v.frames, v.width, v.height, { 格式: 'yuv420p' });
  const sb = frameStream(v.b, v.frames, v.width, v.height, { 格式: 'yuv420p' });
  try {
    for (const pair of plan.pairs) {
      const [ya, yb] = await Promise.all([sa.next(), sb.next()]);
      if (ya.done || yb.done) throw new Error(`第 ${pair.frame} 帧解不出来（${ya.done ? 'A' : 'B'} 提前完了）`);
      yield { pair, width: v.width, height: v.height, oldRgb: yuvToRgb(ya.value, v.width, v.height), newRgb: yuvToRgb(yb.value, v.width, v.height) };
    }
  } finally {
    await Promise.all([sa.return(undefined), sb.return(undefined)]);
  }
}
