// 比两版画面和声音（阈值在 verify/阈值.toml，用户 10-21 定：成片不要差太多就行，不要求逐像素、逐样本相同）。
// 画面（用户 11-02 定换比法，预览 1102-1143-verify比法）：哈希一样就是没变；不一样时比小块的平均颜色挪了多少（块差），压缩只让单个像素乱跳、几乎不动小块平均，
//   真改了东西一整块的平均会跟着变。没有旧帧只能比 16×9 块均值。
// 两边的像素都由 YUV 按固定公式换成 RGB（换算），不用 ffmpeg 的 swscale：H.264、FFV1 解出来的 YUV 各版本逐位一样，swscale 换出来的 RGB 不一样
//   （brew ffmpeg 9.0.2 和 Remotion 的 7.1 整帧差 1～1.4 级，64×64 块差到 2.7，档位才 4）。
// 声音：sha 一样就是没变；不一样时比整段响度（LUFS）和起音落点（台词、音效开始的时刻）。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 配置 } from '../环境/配置.ts';
import { 试跑, 低优先级 } from '../环境/子进程.ts';
import { 代码根 } from '../环境/路径.ts';

export type 阈值 = { 块8门槛: number; 块16门槛: number; 块64门槛: number; 看一眼门槛: number; 块均值容差: number; 响度容差LU: number; 起音容差帧: number };

export const 阈值文件 = () => path.join(代码根(), 'verify', '阈值.toml');

export const 读阈值 = (file = 阈值文件()): 阈值 => {
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const 键 = ['块8门槛', '块16门槛', '块64门槛', '看一眼门槛', '块均值容差', '响度容差LU', '起音容差帧'] as const;
  for (const k of 键) if (typeof t[k] !== 'number') throw new Error(`${file} 要写数字 ${k}`);
  return Object.fromEntries(键.map((k) => [k, t[k]])) as 阈值;
};

// ---------- YUV → RGB ----------

/**
 * 换算的名字，写进认可记录（"换算"）。BT.601 有限范围（这批母版 color_space 没标、color_range tv，swscale 默认也按 601 换），
 * 系数 Q16 定点、四舍五入、截到 0～255；色度 2×2 共用一个样本（最近邻，和 swscale 不缩放时一样）。改公式就要换名字
 */
export const 换算 = 'yuv420p bt601 tv q16 色度最近邻 v1';
const 系Y = 76309; // 255/219
const 系RV = 104597; // 1.596027
const 系GU = 25675; // 0.391762
const 系GV = 53279; // 0.812968
const 系BU = 132201; // 2.017232

/** yuv420p 一帧（Y 宽×高，U、V 各 宽/2×高/2）→ rgb24 */
export const 转rgb = (yuv: Buffer, 宽: number, 高: number): Buffer => {
  if (宽 % 2 || 高 % 2) throw new Error(`yuv420p 的宽高要是偶数：${宽}×${高}`);
  if (yuv.length !== (宽 * 高 * 3) / 2) throw new Error(`yuv420p 一帧应是 ${(宽 * 高 * 3) / 2} 字节，给的是 ${yuv.length}`);
  const out = Buffer.allocUnsafe(宽 * 高 * 3);
  const 半宽 = 宽 / 2;
  const U起 = 宽 * 高;
  const V起 = U起 + 半宽 * (高 / 2);
  const 夹 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < 高; y++) {
    const 色行 = (y >> 1) * 半宽;
    let o = y * 宽 * 3;
    for (let x = 0; x < 宽; x++) {
      const c = 系Y * (yuv[y * 宽 + x]! - 16) + 32768;
      const u = yuv[U起 + 色行 + (x >> 1)]! - 128;
      const v = yuv[V起 + 色行 + (x >> 1)]! - 128;
      out[o++] = 夹((c + 系RV * v) >> 16);
      out[o++] = 夹((c - 系GU * u - 系GV * v) >> 16);
      out[o++] = 夹((c + 系BU * u) >> 16);
    }
  }
  return out;
};

// ---------- 块差 ----------

/** 比的窗口边长（像素）。窗口左上角落在 4 像素网格上、整个在画面内，步长 4 像素 */
export const 块边 = [8, 16, 64] as const;
export type 块边 = (typeof 块边)[number];
export type 块差 = Record<块边, { 差: number; x: number; y: number }>;

/**
 * d = 新 − 旧（逐通道、带符号）；每个窗口里各通道 d 的平均取绝对值、三通道取最大，L_w 是全帧所有窗口里最大的那个（级，0–255）和它的左上角。
 * 先按 4×4 格求和、再用积分图，一帧一次算完所有窗口（参考实现：数据根 archive/verify比法-1102/脚本/库.py 的 指标()）。画面比窗口小就是 0
 */
export const 算块差 = (新: Buffer, 旧: Buffer, 宽: number, 高: number): 块差 => {
  if (新.length !== 旧.length || 新.length !== 宽 * 高 * 3) throw new Error('两帧大小不一样');
  const 格宽 = Math.floor(宽 / 4);
  const 格高 = Math.floor(高 / 4);
  // 积分图：(格高+1)×(格宽+1)×3，第 0 行、第 0 列是 0；和最大 255×像素数，double 精确
  const 行长 = (格宽 + 1) * 3;
  const 积 = new Float64Array((格高 + 1) * 行长);
  const 格 = new Int32Array(格宽 * 3);
  for (let gy = 0; gy < 格高; gy++) {
    格.fill(0);
    for (let y = gy * 4; y < gy * 4 + 4; y++) {
      let i = y * 宽 * 3;
      for (let gx = 0; gx < 格宽; gx++) {
        for (let k = 0; k < 4; k++, i += 3) {
          格[gx * 3] += 新[i]! - 旧[i]!;
          格[gx * 3 + 1] += 新[i + 1]! - 旧[i + 1]!;
          格[gx * 3 + 2] += 新[i + 2]! - 旧[i + 2]!;
        }
      }
    }
    const 上 = gy * 行长;
    const 本 = (gy + 1) * 行长;
    let r = 0, g = 0, b = 0;
    for (let gx = 0; gx < 格宽; gx++) {
      r += 格[gx * 3]!;
      g += 格[gx * 3 + 1]!;
      b += 格[gx * 3 + 2]!;
      const j = (gx + 1) * 3;
      积[本 + j] = 积[上 + j]! + r;
      积[本 + j + 1] = 积[上 + j + 1]! + g;
      积[本 + j + 2] = 积[上 + j + 2]! + b;
    }
  }
  const r = {} as 块差;
  for (const w of 块边) {
    const k = w / 4;
    let 最大 = 0, 位x = 0, 位y = 0;
    for (let i = 0; i + k <= 格高; i++) {
      for (let j = 0; j + k <= 格宽; j++) {
        for (let c = 0; c < 3; c++) {
          const s = 积[(i + k) * 行长 + (j + k) * 3 + c]! - 积[i * 行长 + (j + k) * 3 + c]! - 积[(i + k) * 行长 + j * 3 + c]! + 积[i * 行长 + j * 3 + c]!;
          const m = Math.abs(s) / (w * w);
          if (m > 最大) [最大, 位x, 位y] = [m, j * 4, i * 4];
        }
      }
    }
    r[w] = { 差: 最大, x: 位x, y: 位y };
  }
  return r;
};

export type 块差结论 = '变了' | '看一眼' | '容差内';

/** 16×16 > 块16门槛、64×64 > 块64门槛、8×8 > 块8门槛 任一条就是变了；16×16 在 (看一眼门槛, 块16门槛] 不判失败、出并排图给人看 */
export const 判块差 = (d: 块差, 阈: Pick<阈值, '块8门槛' | '块16门槛' | '块64门槛' | '看一眼门槛'>): 块差结论 =>
  d[16].差 > 阈.块16门槛 || d[64].差 > 阈.块64门槛 || d[8].差 > 阈.块8门槛 ? '变了' : d[16].差 > 阈.看一眼门槛 ? '看一眼' : '容差内';

/** 哪个窗口最该看：超门槛最多的那一档（都没超就是 16×16） */
export const 要看的块 = (d: 块差, 阈: Pick<阈值, '块8门槛' | '块16门槛' | '块64门槛'>): 块边 => {
  const 比 = { 8: d[8].差 / 阈.块8门槛, 16: d[16].差 / 阈.块16门槛, 64: d[64].差 / 阈.块64门槛 };
  return (块边.filter((w) => 比[w] > 1).sort((a, b) => 比[b] - 比[a])[0] ?? 16) as 块边;
};

export const 块差说明 = (d: 块差, 阈: Pick<阈值, '块8门槛' | '块16门槛' | '块64门槛'>) =>
  `块平均差 16×16 ${d[16].差.toFixed(1)}（门槛 ${阈.块16门槛}）、64×64 ${d[64].差.toFixed(1)}（${阈.块64门槛}）、8×8 ${d[8].差.toFixed(1)}（${阈.块8门槛}），最大的 16×16 块在 (${d[16].x}, ${d[16].y})`;

// ---------- 并排图 ----------

const 放大 = 6;
const 框色 = [255, 0, 0] as const;

/**
 * 并排图：上排 旧 | 新 | 差×4（各通道差的最大绝对值乘 4，灰度），三格都在 块 那个窗口外画红框；
 * 下排是三格在这个窗口附近的裁切放大 6 倍。宽 3×宽、高 2×高
 */
export const 并排 = (新: Buffer, 旧: Buffer, 宽: number, 高: number, 块: { x: number; y: number; 边: number }): Buffer => {
  const W = 宽 * 3;
  const out = Buffer.alloc(W * 高 * 2 * 3);
  const 差 = Buffer.allocUnsafe(宽 * 高 * 3);
  for (let i = 0; i < 宽 * 高 * 3; i += 3) {
    const d = Math.max(Math.abs(新[i]! - 旧[i]!), Math.abs(新[i + 1]! - 旧[i + 1]!), Math.abs(新[i + 2]! - 旧[i + 2]!));
    差[i] = 差[i + 1] = 差[i + 2] = Math.min(255, d * 4);
  }
  const 格们 = [旧, 新, 差];
  for (const [n, src] of 格们.entries()) for (let y = 0; y < 高; y++) src.copy(out, (y * W + n * 宽) * 3, y * 宽 * 3, (y + 1) * 宽 * 3);
  // 裁切：以窗口中心为中心、宽/放大 × 高/放大，夹在画面里
  const 裁宽 = Math.max(1, Math.floor(宽 / 放大));
  const 裁高 = Math.max(1, Math.floor(高 / 放大));
  const cx = Math.min(Math.max(0, 块.x + 块.边 / 2 - 裁宽 / 2), 宽 - 裁宽) | 0;
  const cy = Math.min(Math.max(0, 块.y + 块.边 / 2 - 裁高 / 2), 高 - 裁高) | 0;
  for (const [n, src] of 格们.entries()) {
    for (let y = 0; y < 裁高 * 放大; y++) {
      const sy = cy + Math.floor(y / 放大);
      for (let x = 0; x < 裁宽 * 放大; x++) {
        const s = (sy * 宽 + cx + Math.floor(x / 放大)) * 3;
        const o = ((高 + y) * W + n * 宽 + x) * 3;
        out[o] = src[s]!;
        out[o + 1] = src[s + 1]!;
        out[o + 2] = src[s + 2]!;
      }
    }
  }
  // 红框：上排画在窗口外一圈（留 2 像素空，线宽 2），下排按放大后的坐标画
  const 点 = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= 高 * 2) return;
    const o = (y * W + x) * 3;
    [out[o], out[o + 1], out[o + 2]] = 框色;
  };
  const 框 = (x0: number, y0: number, x1: number, y1: number, 夹x0: number, 夹x1: number, 夹y0: number, 夹y1: number) => {
    for (let t = 0; t < 2; t++) {
      for (let x = x0 - t; x <= x1 + t; x++) for (const y of [y0 - t, y1 + t]) if (x >= 夹x0 && x < 夹x1 && y >= 夹y0 && y < 夹y1) 点(x, y);
      for (let y = y0 - t; y <= y1 + t; y++) for (const x of [x0 - t, x1 + t]) if (x >= 夹x0 && x < 夹x1 && y >= 夹y0 && y < 夹y1) 点(x, y);
    }
  };
  for (let n = 0; n < 3; n++) {
    框(n * 宽 + 块.x - 3, 块.y - 3, n * 宽 + 块.x + 块.边 + 2, 块.y + 块.边 + 2, n * 宽, (n + 1) * 宽, 0, 高);
    const bx = n * 宽 + (块.x - cx) * 放大;
    const by = 高 + (块.y - cy) * 放大;
    框(bx - 1, by - 1, bx + 块.边 * 放大, by + 块.边 * 放大, n * 宽, n * 宽 + 裁宽 * 放大, 高, 高 + 裁高 * 放大);
  }
  return out;
};

/** 两份块均值每个通道的最大差 */
export const 比块均值 = (新: readonly string[], 旧: readonly string[]) => {
  if (新.length !== 旧.length) return Infinity;
  let 最大 = 0;
  新.forEach((行, i) => {
    const a = Buffer.from(行, 'hex');
    const b = Buffer.from(旧[i]!, 'hex');
    if (a.length !== b.length) 最大 = Infinity;
    else for (let j = 0; j < a.length; j++) 最大 = Math.max(最大, Math.abs(a[j]! - b[j]!));
  });
  return 最大;
};

/** 整段积分响度（EBU R128，LUFS）；ffmpeg 的 ebur128 滤镜，静音是 -70 */
export const 响度 = (file: string): number => {
  const cmd = 低优先级([配置('ffmpeg'), '-hide_banner', '-nostats', '-nostdin', '-i', file, '-map', '0:a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const r = 试跑(cmd); // ebur128 的汇总写在 stderr
  if (r.退出码 !== 0) throw new Error(`读 ${file} 的响度失败（退出码 ${r.退出码}）：\n${r.stderr.slice(-500)}`);
  const out = r.stderr;
  const m = [...out.matchAll(/^\s*I:\s+(-?[\d.]+|-inf) LUFS/gm)].at(-1);
  if (!m) throw new Error(`读不出 ${file} 的响度：\n${out.slice(-500)}`);
  return m[1] === '-inf' ? -70 : Number(m[1]);
};

// ---------- 起音 ----------
// 5 ms 一格的 RMS 包络（双声道取平均，dBFS）；某格比前 50 ms 里最低的那格跳起 ≥ 记录门槛 dB、且本格不低于 -45 dBFS，记一个起音（60 ms 内不重记）。
// 强度 = 跳起的 dB。比的时候，一边 ≥ 强起音 的起音，另一边在容差内要有起音（≥ 记录门槛 即可），免得刚好压在门槛上的被当成多了或少了。
export const 格秒 = 0.005;
const 格样本 = 48000 * 格秒;
const 回看格 = 10;
const 不重记格 = 12;
export const 记录门槛 = 6;
export const 强起音 = 10;
const 最低 = -45;

export type 起音 = { 秒: number; 强: number };

/** 边读 s16le 双声道 48 kHz 的 PCM 边算包络 */
export class 包络 {
  private 和 = 0;
  private 个 = 0;
  private 余 = Buffer.alloc(0);
  readonly dB: number[] = [];
  加(pcm: Buffer) {
    const b = this.余.length ? Buffer.concat([this.余, pcm]) : pcm;
    const n = b.length - (b.length % 4);
    for (let i = 0; i < n; i += 4) {
      const v = (b.readInt16LE(i) + b.readInt16LE(i + 2)) / 2 / 32768;
      this.和 += v * v;
      if (++this.个 === 格样本) this.收格();
    }
    this.余 = Buffer.from(b.subarray(n));
  }
  private 收格() {
    this.dB.push(this.和 > 0 ? 10 * Math.log10(this.和 / this.个) : -120);
    this.和 = 0;
    this.个 = 0;
  }
  完() {
    if (this.个) this.收格();
    return this.dB;
  }
}

export const 找起音 = (dB: readonly number[]): 起音[] => {
  const r: 起音[] = [];
  let 上次 = -Infinity;
  for (let i = 1; i < dB.length; i++) {
    if (dB[i]! < 最低 || i - 上次 < 不重记格) continue;
    let 低 = Infinity;
    for (let j = Math.max(0, i - 回看格); j < i; j++) 低 = Math.min(低, dB[j]!);
    const 跳 = dB[i]! - 低;
    if (跳 >= 记录门槛) {
      r.push({ 秒: Math.round(i * 格秒 * 1000) / 1000, 强: Math.round(跳 * 10) / 10 });
      上次 = i;
    }
  }
  return r;
};

/** 一边的强起音在另一边容差内找不到起音的，列出来（秒） */
export const 比起音 = (新: readonly 起音[], 旧: readonly 起音[], 容差秒: number) => {
  const 找不到 = (甲: readonly 起音[], 乙: readonly 起音[]) => 甲.filter((a) => a.强 >= 强起音 && !乙.some((b) => Math.abs(b.秒 - a.秒) <= 容差秒 + 1e-9)).map((a) => a.秒);
  return { 旧有新没有: 找不到(旧, 新), 新有旧没有: 找不到(新, 旧) };
};

/** 认可记录里起音写成「秒@强度」 */
export const 起音串 = (x: 起音) => `${x.秒.toFixed(3)}@${x.强.toFixed(1)}`;
export const 解起音串 = (s: string): 起音 => {
  const m = /^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) throw new Error(`起音要写成「秒@强度」：${s}`);
  return { 秒: Number(m[1]), 强: Number(m[2]) };
};
