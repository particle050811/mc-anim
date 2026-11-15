// 台词字幕排时间：每句开口前 0.15 秒出、说完 0.4 秒收，下一句出来上一句就收；一句切几屏时到配音响度的谷里找停顿换屏。
// 照抄旧项目 工具/合成第六章/字幕.py（plan_subtitles、find_voiced_runs、screen_switch_times），数值不改；
// 落点不再从各段代码里扒，由 台词落点.ts 按段.ts 的声音 cue 算。产出 字幕表.tsv、SRT。
// 接上段的落点（上一段说过来的后半截）不出字幕，字幕表末尾照旧另列一行，写它和开口那段差几帧。
import type { SubtitlePosition, SubtitleCard } from './字幕卡.ts';

export const sampleRate = 48000;
const leadSec = 0.15;
const holdSec = 0.4;
const screenLeadSec = 0.15;
const minPauseSec = 0.1;
const silenceBelowPeakDb = 40; // 且不高于 −60 dBFS

export type LineLanding = {
  id: string;
  段: string;
  /** cue 写的开口落在段内第几帧（cue 秒 × fps） */
  段内帧: number;
  /** 配音文件第 0 秒落在全片第几帧（= 段起帧 +（cue 秒 − 开口秒）× fps） */
  文件头帧: number;
  文件: string;
  /** 配音的资产 id */
  配音: string;
  字: string;
  角色: string;
  位置: SubtitlePosition;
  屏们: SubtitleCard[];
  /** 上一段说过来的后半截（同一个文件在这一段接着放）：不出字幕，只拿来对两边接没接上 */
  接上段?: true;
};

/** 10 毫秒一格的响度，响的连成一段，中间静不到 0.1 秒的并起来；返回 [起秒, 止秒] */
export const voicedSegments = (x: Float32Array): [number, number][] => {
  const hop = sampleRate / 100;
  const n = Math.floor(x.length / hop);
  const db = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += x[k]! * x[k]!;
    db[i] = 20 * Math.log10(Math.sqrt(s / hop) + 1e-9);
  }
  let max = -Infinity;
  for (const v of db) max = Math.max(max, v);
  const threshold = Math.max(max - silenceBelowPeakDb, -60);
  let runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!(db[i]! > threshold)) continue;
    const last = runs[runs.length - 1];
    if (last && i - last[1] < minPauseSec * 100) last[1] = i + 1;
    else runs.push([i, i + 1]);
  }
  const longRuns = runs.filter(([a, b]) => b - a >= 3); // 孤立的一两格（喘气、毛刺）不算
  if (longRuns.length) runs = longRuns;
  return runs.map(([a, b]) => [a / 100, b / 100]);
};

/** 10 毫秒一格、按 窗 × 10 毫秒平滑的响度（dB），平滑同 numpy convolve 'same' */
export const smoothLoudness = (x: Float32Array, windowLen: number): Float64Array => {
  const hop = sampleRate / 100;
  const n = Math.floor(x.length / hop);
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += x[k]! * x[k]!;
    p[i] = s / hop;
  }
  const out = new Float64Array(n);
  const leftRadius = Math.floor((windowLen - 1) / 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i - leftRadius; j < i - leftRadius + windowLen; j++) if (j >= 0 && j < n) s += p[j]!;
    out[i] = 10 * Math.log10(s / windowLen + 1e-12);
  }
  return out;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** 一句切成几屏时，第 2、3…屏从文件第几秒换上（字幕.py 的 screen_switch_times：在响度的谷里找停顿当锚点，没有就按音节比例） */
export const screenTimes = (screens: SubtitleCard[], x: Float32Array, voicedSpans: [number, number][]): [number, string][] => {
  const clauses = screens.flatMap((p, k) => p.分句.map((c) => ({ 屏: k, ...c })));
  const screenStartClause = screens.map((_, k) => clauses.findIndex((c) => c.屏 === k));
  const syllables = clauses.map((c) => Math.max(c.音节, 0));
  const env = smoothLoudness(x, 5);
  const valley = smoothLoudness(x, 15);
  const t = (j: number) => j / 100;
  const speechStartSec = voicedSpans[0]![0];
  const end = voicedSpans[voicedSpans.length - 1]![1];
  const mask = new Uint8Array(env.length);
  for (const [a, b] of voicedSpans) for (let j = Math.trunc(a * 100); j < Math.trunc(b * 100) && j < mask.length; j++) mask[j] = 1;
  const medianEnv = median([...env].filter((_, j) => mask[j]));
  const voicedSec = (t0: number, t1: number) => voicedSpans.reduce((a, [s, e]) => a + Math.max(0, Math.min(t1, e) - Math.max(t0, s)), 0);
  const estimateForward = (from: number, left: number) => {
    for (const [s, e] of voicedSpans) {
      if (e <= from) continue;
      const len = e - Math.max(from, s);
      if (left <= len) return Math.max(from, s) + left;
      left -= len;
    }
    return end;
  };
  const sum = (a: number, b?: number) => syllables.slice(a, b).reduce((p, q) => p + q, 0);
  const boundaries: { 秒: number; valley: number | null; 依据: string }[] = [{ 秒: speechStartSec, valley: null, 依据: '开口' }];
  let cursor = speechStartSec;
  let anchorClause = 0;
  for (let i = 1; i < clauses.length; i++) {
    const secPerSyllable = voicedSec(cursor, end) / Math.max(sum(anchorClause), 1);
    const estimatedSec = estimateForward(cursor, secPerSyllable * sum(anchorClause, i));
    if (clauses[i - 1]!.标点断) {
      const widthSec = Math.max(0.8, 4 * secPerSyllable);
      const lo = Math.max(cursor + 0.2, estimatedSec - widthSec);
      const hi = Math.min(end - 0.2, estimatedSec + widthSec);
      const valleys: number[] = [];
      for (let j = 1; j < valley.length - 1; j++) {
        if (lo <= t(j) && t(j) <= hi && valley[j]! <= valley[j - 1]! && valley[j]! < valley[j + 1]! && medianEnv - valley[j]! >= 10) valleys.push(j);
      }
      if (valleys.length) {
        // 深的、离估计点近的优先：每离 1 秒折 8 dB（同分取先出现的，同 Python max）
        let j = valleys[0]!;
        const score = (k: number) => medianEnv - valley[k]! - 8 * Math.abs(t(k) - estimatedSec);
        for (const k of valleys) if (score(k) > score(j)) j = k;
        let start = t(j);
        for (let k = j + 1; k < env.length; k++) {
          if (t(k) > t(j) && env[k]! > medianEnv - 10) {
            start = t(k);
            break;
          }
        }
        boundaries.push({ 秒: start, valley: t(j), 依据: `停顿（谷底 ${t(j).toFixed(2)} 秒低 ${(medianEnv - valley[j]!).toFixed(0)} dB，${start.toFixed(2)} 秒重新开口；估计 ${estimatedSec.toFixed(2)}）` });
        cursor = start;
        anchorClause = i;
        continue;
      }
    }
    boundaries.push({ 秒: estimatedSec, valley: null, 依据: '按音节比例' + (clauses[i - 1]!.标点断 ? '（这个标点后没找到停顿）' : '') });
  }
  return screens.slice(1).map((_, k) => {
    const b = boundaries[screenStartClause[k + 1]!]!;
    return [b.valley !== null ? Math.max(b.valley, b.秒 - screenLeadSec) : b.秒, b.依据];
  });
};

export type SubtitleScreen = { 字: string; 位置: SubtitlePosition; 起帧: number; 止帧: number; 句: string; 角色: string; 段: string; 依据: string };
export type PlacedSentence = LineLanding & { voicedSpans: [number, number][]; 开: number; end: number; 开口帧: number };
export type FollowOn = { 落点: LineLanding; 差: number };

// Python round（银行家舍入）：字幕.py 用 int(round(...))
const rounder = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
};

/** 排每屏的起止帧（全片帧）；读声音交给 读声音（测试可以注入）。
 *  切点们（全片帧，段和段的交界）：一句的末屏只因「说完留 0.4 秒」伸过切点、配音在切点前已经说完的，到切点就收
 *  （用户 11-05 定，那时 6-李樱-不值一提、7-李樱-溜了、7-刘心忠-风筝 伸过 1～6 帧）；话本身跨段的照旧跨过去 */
export const placeSubtitles = (landings: LineLanding[], totalFrames: number, fps: number, readAudio: (file: string) => Float32Array, cutPoints: readonly number[] = []) => {
  const sentences: PlacedSentence[] = [];
  const screens: SubtitleScreen[] = [];
  const changes = new Map<string, [number, string][]>();
  for (const a of landings) {
    if (a.接上段) continue;
    const x = readAudio(a.文件);
    const voicedSpans = voicedSegments(x);
    if (!voicedSpans.length) throw new Error(`字幕：${a.id} 的配音 ${a.文件} 没有声音`);
    const speechStartSec = voicedSpans[0]![0];
    const end = voicedSpans[voicedSpans.length - 1]![1];
    const e: PlacedSentence = { ...a, voicedSpans, 开: speechStartSec, end, 开口帧: a.文件头帧 + speechStartSec * fps };
    sentences.push(e);
    changes.set(a.id + '\u0000' + a.段, screenTimes(a.屏们, x, voicedSpans));
  }
  for (const e of [...sentences].sort((a, b) => a.开口帧 - b.开口帧)) {
    const switches = changes.get(e.id + '\u0000' + e.段)!;
    const subtitleSecs = [e.开 - leadSec, ...switches.map(([t]) => t), e.end + holdSec];
    const bases = ['开口', ...switches.map(([, d]) => d)];
    const frames = subtitleSecs.map((t) => rounder(e.文件头帧 + t * fps));
    const speechEndFrame = e.文件头帧 + e.end * fps;
    const lastIndex = frames.length - 1;
    const cutPoint = cutPoints.find((c) => frames[lastIndex - 1]! < c && c < frames[lastIndex]! && speechEndFrame <= c);
    if (cutPoint !== undefined) frames[lastIndex] = cutPoint;
    e.屏们.forEach((p, k) => screens.push({ 字: p.字, 位置: e.位置, 起帧: frames[k]!, 止帧: frames[k + 1]!, 句: e.id, 角色: e.角色, 段: e.段, 依据: bases[k]! }));
  }
  for (let i = 0; i + 1 < screens.length; i++) if (screens[i]!.止帧 > screens[i + 1]!.起帧) screens[i]!.止帧 = screens[i + 1]!.起帧;
  for (const p of screens) {
    p.起帧 = Math.max(0, p.起帧);
    p.止帧 = Math.min(totalFrames, p.止帧);
    if (p.止帧 <= p.起帧) throw new Error(`字幕：「${p.字}」被下一句挤得没有了（${p.句}）`);
  }
  // 接着放的后半截：换到全片帧要和开口那一段对上（开口那段不在这次范围里的不列）
  const followOns: FollowOn[] = landings.flatMap((a) => {
    const prevLine = a.接上段 ? sentences.find((e) => e.id === a.id) : undefined;
    return prevLine ? [{ 落点: a, 差: a.文件头帧 - prevLine.文件头帧 }] : [];
  });
  // 容差是以前 24 帧编排时的 1.5 帧，换成秒
  for (const x of followOns) if (Math.abs(x.差) / fps > 1.5 / 24) throw new Error(`字幕：${x.落点.id} 在 ${x.落点.段} 接着放的后半截和开口那段差 ${x.差.toFixed(1)} 帧`);
  return { 屏们: screens, sentences, followOns };
};

const clockTime = (frame: number, fps: number) => {
  const sec = frame / fps;
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, '0')}`;
};

// 差的格式同 Python f'{差:+.2f}'；先舍到 0.01，免得 −0.00
const signedNum = (x: number) => {
  const r = Math.round(x * 100) / 100 + 0;
  return (r >= 0 ? '+' : '') + r.toFixed(2);
};

export const subtitleTableTsv = (screens: SubtitleScreen[], fps: number, followOns: FollowOn[] = []) =>
  [
    '句\t角色\t段\t字\t起帧\t止帧（不含）\t起\t止\t换上的依据',
    ...screens.map((p) => `${p.句}\t${p.角色}\t${p.段}\t${p.字}\t${p.起帧}\t${p.止帧}\t${clockTime(p.起帧, fps)}\t${clockTime(p.止帧, fps)}\t${p.依据}`),
    ...followOns.map(({ 落点: a, 差: frameDiff }) => `${a.id}\t${a.角色}\t${a.段}\t（接着放的后半截，和开口那段差 ${signedNum(frameDiff)} 帧）\t\t\t\t\t`),
  ].join('\n') + '\n';

const srtTime = (frame: number, fps: number) => {
  const ms = rounder((frame * 1000) / fps);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
export const srt = (screens: SubtitleScreen[], fps: number) => screens.map((p, i) => `${i + 1}\n${srtTime(p.起帧, fps)} --> ${srtTime(p.止帧, fps)}\n${p.字}\n\n`).join('');
