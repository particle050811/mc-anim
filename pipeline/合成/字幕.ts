// 台词字幕排时间：每句开口前 0.15 秒出、说完 0.4 秒收，下一句出来上一句就收；一句切几屏时到配音响度的谷里找停顿换屏。
// 照抄旧项目 工具/合成第六章/字幕.py（plan_subtitles、find_voiced_runs、screen_switch_times、verify_onsets），数值不改；
// 落点不再从各段代码里扒，由 台词落点.ts 按段.ts 的声音 cue 算。产出 字幕表.tsv、SRT、字幕核对.tsv。
// 接上段的落点（上一段说过来的后半截）不出字幕，字幕表末尾照旧另列一行，写它和开口那段差几帧。
import { 互相关 } from './音频.ts';
import type { 字幕位置, 屏 } from './字幕卡.ts';

export const 采样率 = 48000;
const 提前秒 = 0.15;
const 留秒 = 0.4;
const 换屏提前秒 = 0.15;
const 最短停顿秒 = 0.1;
const 静音低于峰值dB = 40; // 且不高于 −60 dBFS

export type 台词落点 = {
  id: string;
  段: string;
  /** cue 写的帧：开口落在段内第几帧 */
  段内帧: number;
  /** 配音文件第 0 秒落在全片第几帧（= 段起帧 + cue 帧 − 开口秒 × fps） */
  文件头帧: number;
  文件: string;
  /** 配音的资产 id（剪辑包按它取文件） */
  配音: string;
  字: string;
  角色: string;
  位置: 字幕位置;
  屏们: 屏[];
  /** 上一段说过来的后半截（同一个文件在这一段接着放）：不出字幕、不核对开口，只拿来对两边接没接上 */
  接上段?: true;
};

/** 10 毫秒一格的响度，响的连成一段，中间静不到 0.1 秒的并起来；返回 [起秒, 止秒] */
export const 有声段 = (x: Float32Array): [number, number][] => {
  const hop = 采样率 / 100;
  const n = Math.floor(x.length / hop);
  const db = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += x[k]! * x[k]!;
    db[i] = 20 * Math.log10(Math.sqrt(s / hop) + 1e-9);
  }
  let max = -Infinity;
  for (const v of db) max = Math.max(max, v);
  const 阈 = Math.max(max - 静音低于峰值dB, -60);
  let runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!(db[i]! > 阈)) continue;
    const last = runs[runs.length - 1];
    if (last && i - last[1] < 最短停顿秒 * 100) last[1] = i + 1;
    else runs.push([i, i + 1]);
  }
  const 长的 = runs.filter(([a, b]) => b - a >= 3); // 孤立的一两格（喘气、毛刺）不算
  if (长的.length) runs = 长的;
  return runs.map(([a, b]) => [a / 100, b / 100]);
};

/** 10 毫秒一格、按 窗 × 10 毫秒平滑的响度（dB），平滑同 numpy convolve 'same' */
export const 平滑响度 = (x: Float32Array, 窗: number): Float64Array => {
  const hop = 采样率 / 100;
  const n = Math.floor(x.length / hop);
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += x[k]! * x[k]!;
    p[i] = s / hop;
  }
  const out = new Float64Array(n);
  const 左 = Math.floor((窗 - 1) / 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i - 左; j < i - 左 + 窗; j++) if (j >= 0 && j < n) s += p[j]!;
    out[i] = 10 * Math.log10(s / 窗 + 1e-12);
  }
  return out;
};

const 中位数 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** 一句切成几屏时，第 2、3…屏从文件第几秒换上（字幕.py 的 screen_switch_times：在响度的谷里找停顿当锚点，没有就按音节比例） */
export const 换屏时刻 = (屏们: 屏[], x: Float32Array, 有声: [number, number][]): [number, string][] => {
  const 截们 = 屏们.flatMap((p, k) => p.分句.map((c) => ({ 屏: k, ...c })));
  const 屏首截 = 屏们.map((_, k) => 截们.findIndex((c) => c.屏 === k));
  const 音节 = 截们.map((c) => Math.max(c.音节, 0));
  const env = 平滑响度(x, 5);
  const valley = 平滑响度(x, 15);
  const t = (j: number) => j / 100;
  const 开 = 有声[0]![0];
  const 完 = 有声[有声.length - 1]![1];
  const mask = new Uint8Array(env.length);
  for (const [a, b] of 有声) for (let j = Math.trunc(a * 100); j < Math.trunc(b * 100) && j < mask.length; j++) mask[j] = 1;
  const 中位 = 中位数([...env].filter((_, j) => mask[j]));
  const 有声秒 = (t0: number, t1: number) => 有声.reduce((a, [s, e]) => a + Math.max(0, Math.min(t1, e) - Math.max(t0, s)), 0);
  const 往后说 = (from: number, left: number) => {
    for (const [s, e] of 有声) {
      if (e <= from) continue;
      const len = e - Math.max(from, s);
      if (left <= len) return Math.max(from, s) + left;
      left -= len;
    }
    return 完;
  };
  const 和 = (a: number, b?: number) => 音节.slice(a, b).reduce((p, q) => p + q, 0);
  const 界们: { 秒: number; 谷: number | null; 依据: string }[] = [{ 秒: 开, 谷: null, 依据: '开口' }];
  let 锚 = 开;
  let 锚截 = 0;
  for (let i = 1; i < 截们.length; i++) {
    const 每音节 = 有声秒(锚, 完) / Math.max(和(锚截), 1);
    const 估 = 往后说(锚, 每音节 * 和(锚截, i));
    if (截们[i - 1]!.标点断) {
      const 宽 = Math.max(0.8, 4 * 每音节);
      const lo = Math.max(锚 + 0.2, 估 - 宽);
      const hi = Math.min(完 - 0.2, 估 + 宽);
      const 谷们: number[] = [];
      for (let j = 1; j < valley.length - 1; j++) {
        if (lo <= t(j) && t(j) <= hi && valley[j]! <= valley[j - 1]! && valley[j]! < valley[j + 1]! && 中位 - valley[j]! >= 10) 谷们.push(j);
      }
      if (谷们.length) {
        // 深的、离估计点近的优先：每离 1 秒折 8 dB（同分取先出现的，同 Python max）
        let j = 谷们[0]!;
        const 分 = (k: number) => 中位 - valley[k]! - 8 * Math.abs(t(k) - 估);
        for (const k of 谷们) if (分(k) > 分(j)) j = k;
        let 起 = t(j);
        for (let k = j + 1; k < env.length; k++) {
          if (t(k) > t(j) && env[k]! > 中位 - 10) {
            起 = t(k);
            break;
          }
        }
        界们.push({ 秒: 起, 谷: t(j), 依据: `停顿（谷底 ${t(j).toFixed(2)} 秒低 ${(中位 - valley[j]!).toFixed(0)} dB，${起.toFixed(2)} 秒重新开口；估计 ${估.toFixed(2)}）` });
        锚 = 起;
        锚截 = i;
        continue;
      }
    }
    界们.push({ 秒: 估, 谷: null, 依据: '按音节比例' + (截们[i - 1]!.标点断 ? '（这个标点后没找到停顿）' : '') });
  }
  return 屏们.slice(1).map((_, k) => {
    const b = 界们[屏首截[k + 1]!]!;
    return [b.谷 !== null ? Math.max(b.谷, b.秒 - 换屏提前秒) : b.秒, b.依据];
  });
};

export type 字幕屏 = { 字: string; 位置: 字幕位置; 起帧: number; 止帧: number; 句: string; 角色: string; 段: string; 依据: string };
export type 排好的句 = 台词落点 & { 有声: [number, number][]; 开: number; 完: number; 开口帧: number };
export type 接着放 = { 落点: 台词落点; 差: number };

// Python round（银行家舍入）：字幕.py 用 int(round(...))
const 舍入 = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
};

/** 排每屏的起止帧（全片帧）；读声音交给 读声音（测试可以注入） */
export const 排字幕 = (落点们: 台词落点[], 总帧数: number, fps: number, 读声音: (文件: string) => Float32Array) => {
  const 句们: 排好的句[] = [];
  const 屏们: 字幕屏[] = [];
  const 换们 = new Map<string, [number, string][]>();
  for (const a of 落点们) {
    if (a.接上段) continue;
    const x = 读声音(a.文件);
    const 有声 = 有声段(x);
    if (!有声.length) throw new Error(`字幕：${a.id} 的配音 ${a.文件} 没有声音`);
    const 开 = 有声[0]![0];
    const 完 = 有声[有声.length - 1]![1];
    const e: 排好的句 = { ...a, 有声, 开, 完, 开口帧: a.文件头帧 + 开 * fps };
    句们.push(e);
    换们.set(a.id + '\u0000' + a.段, 换屏时刻(a.屏们, x, 有声));
  }
  for (const e of [...句们].sort((a, b) => a.开口帧 - b.开口帧)) {
    const 换 = 换们.get(e.id + '\u0000' + e.段)!;
    const 秒们 = [e.开 - 提前秒, ...换.map(([t]) => t), e.完 + 留秒];
    const 依据们 = ['开口', ...换.map(([, d]) => d)];
    const 帧们 = 秒们.map((t) => 舍入(e.文件头帧 + t * fps));
    e.屏们.forEach((p, k) => 屏们.push({ 字: p.字, 位置: e.位置, 起帧: 帧们[k]!, 止帧: 帧们[k + 1]!, 句: e.id, 角色: e.角色, 段: e.段, 依据: 依据们[k]! }));
  }
  for (let i = 0; i + 1 < 屏们.length; i++) if (屏们[i]!.止帧 > 屏们[i + 1]!.起帧) 屏们[i]!.止帧 = 屏们[i + 1]!.起帧;
  for (const p of 屏们) {
    p.起帧 = Math.max(0, p.起帧);
    p.止帧 = Math.min(总帧数, p.止帧);
    if (p.止帧 <= p.起帧) throw new Error(`字幕：「${p.字}」被下一句挤得没有了（${p.句}）`);
  }
  // 接着放的后半截：换到全片帧要和开口那一段对上（开口那段不在这次范围里的不列）
  const 接着放们: 接着放[] = 落点们.flatMap((a) => {
    const 主 = a.接上段 ? 句们.find((e) => e.id === a.id) : undefined;
    return 主 ? [{ 落点: a, 差: a.文件头帧 - 主.文件头帧 }] : [];
  });
  for (const x of 接着放们) if (Math.abs(x.差) > 1.5) throw new Error(`字幕：${x.落点.id} 在 ${x.落点.段} 接着放的后半截和开口那段差 ${x.差.toFixed(1)} 帧`);
  return { 屏们, 句们, 接着放们 };
};

const 时分 = (帧: number, fps: number) => {
  const 秒 = 帧 / fps;
  const m = Math.floor(秒 / 60);
  return `${m}:${(秒 - m * 60).toFixed(3).padStart(6, '0')}`;
};

// 差的格式同 Python f'{差:+.2f}'；先舍到 0.01，免得 −0.00
const 带号 = (x: number) => {
  const r = Math.round(x * 100) / 100 + 0;
  return (r >= 0 ? '+' : '') + r.toFixed(2);
};

export const 字幕表tsv = (屏们: 字幕屏[], fps: number, 接着放们: 接着放[] = []) =>
  [
    '句\t角色\t段\t字\t起帧\t止帧（不含）\t起\t止\t换上的依据',
    ...屏们.map((p) => `${p.句}\t${p.角色}\t${p.段}\t${p.字}\t${p.起帧}\t${p.止帧}\t${时分(p.起帧, fps)}\t${时分(p.止帧, fps)}\t${p.依据}`),
    ...接着放们.map(({ 落点: a, 差 }) => `${a.id}\t${a.角色}\t${a.段}\t（接着放的后半截，和开口那段差 ${带号(差)} 帧）\t\t\t\t\t`),
  ].join('\n') + '\n';

const srt时间 = (帧: number, fps: number) => {
  const ms = 舍入((帧 * 1000) / fps);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
export const srt = (屏们: 字幕屏[], fps: number) => 屏们.map((p, i) => `${i + 1}\n${srt时间(p.起帧, fps)} --> ${srt时间(p.止帧, fps)}\n${p.字}\n\n`).join('');

/** 配音和成片声音做互相关（开口前后 1.5 秒里找），量每句实际开口帧，和字幕用的落点比（字幕.py 的 verify_onsets） */
export const 核对开口 = (句们: 排好的句[], 混音: Float32Array, fps: number, 读声音: (文件: string) => Float32Array) => {
  const 行 = ['句\t段\t字幕用的开口帧\t成片里量出的开口帧\t差（帧）\t相关系数'];
  const 差们: number[] = [];
  const 每帧 = 采样率 / fps;
  for (const e of 句们) {
    const 全 = 读声音(e.文件);
    const a = Math.trunc(e.开 * 采样率);
    const v = 全.subarray(a, a + 2 * 采样率);
    const c0 = Math.round(e.开口帧 * 每帧);
    const ws = c0 - Math.trunc(1.5 * 采样率);
    const we = c0 + Math.trunc(1.5 * 采样率) + v.length;
    if (ws < 0 || we > 混音.length) continue;
    const w = 混音.subarray(ws, we);
    let vn = 0;
    for (const x of v) vn += x * x;
    vn = Math.sqrt(vn);
    const xc = 互相关(w, v);
    let e2 = 0;
    for (let k = 0; k < v.length; k++) e2 += w[k]! * w[k]!;
    let best = -Infinity;
    let bk = 0;
    for (let k = 0; k < xc.length; k++) {
      if (k > 0) e2 += w[k + v.length - 1]! ** 2 - w[k - 1]! ** 2;
      const c = xc[k]! / (Math.sqrt(Math.max(e2, 0)) * vn + 1e-9);
      if (c > best) {
        best = c;
        bk = k;
      }
    }
    const 量 = (ws + bk) / 每帧;
    差们.push(量 - e.开口帧);
    行.push(`${e.id}\t${e.段}\t${e.开口帧.toFixed(1)}\t${量.toFixed(1)}\t${(量 - e.开口帧 >= 0 ? '+' : '') + (量 - e.开口帧).toFixed(2)}\t${best.toFixed(2)}`);
  }
  return { tsv: 行.join('\n') + '\n', 最大差: 差们.length ? Math.max(...差们.map(Math.abs)) : NaN };
};
