// 比两版画面和声音（阈值在 verify/阈值.toml，用户 10-21 定：成片不要差太多就行，不要求逐像素、逐样本相同）。
// 画面：哈希一样就是没变；有旧帧就逐像素数「差 > 差像素门槛」的像素占比，没有旧帧只能比块均值。
// 声音：sha 一样就是没变；不一样时比整段响度（LUFS）和起音落点（台词、音效开始的时刻）。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 配置 } from '../环境/配置.ts';
import { 试跑, 低优先级 } from '../环境/子进程.ts';
import { 代码根 } from '../环境/路径.ts';

export type 阈值 = { 差像素门槛: number; 差像素占比: number; 块均值容差: number; 响度容差LU: number; 起音容差帧: number };

export const 阈值文件 = () => path.join(代码根(), 'verify', '阈值.toml');

export const 读阈值 = (file = 阈值文件()): 阈值 => {
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const 键 = ['差像素门槛', '差像素占比', '块均值容差', '响度容差LU', '起音容差帧'] as const;
  for (const k of 键) if (typeof t[k] !== 'number') throw new Error(`${file} 要写数字 ${k}`);
  return Object.fromEntries(键.map((k) => [k, t[k]])) as 阈值;
};

/** 逐像素比：任一通道差超过 门槛 的像素占多少、最大差多少 */
export const 比像素 = (新: Buffer, 旧: Buffer, 门槛: number) => {
  if (新.length !== 旧.length) throw new Error('两帧大小不一样');
  let 超 = 0;
  let 最大 = 0;
  for (let i = 0; i < 新.length; i += 3) {
    const d = Math.max(Math.abs(新[i]! - 旧[i]!), Math.abs(新[i + 1]! - 旧[i + 1]!), Math.abs(新[i + 2]! - 旧[i + 2]!));
    if (d > 门槛) 超++;
    if (d > 最大) 最大 = d;
  }
  return { 差像素占比: 超 / (新.length / 3), 最大差: 最大 };
};

/** 并排图：旧 | 新 | 差（差超过门槛的像素标红，其余压暗成灰） */
export const 并排 = (新: Buffer, 旧: Buffer, 宽: number, 高: number, 门槛: number): Buffer => {
  const out = Buffer.alloc(宽 * 3 * 高 * 3);
  for (let y = 0; y < 高; y++) {
    for (let x = 0; x < 宽; x++) {
      const i = (y * 宽 + x) * 3;
      const o = (y * 宽 * 3 + x) * 3;
      旧.copy(out, o, i, i + 3);
      新.copy(out, o + 宽 * 3, i, i + 3);
      const d = Math.max(Math.abs(新[i]! - 旧[i]!), Math.abs(新[i + 1]! - 旧[i + 1]!), Math.abs(新[i + 2]! - 旧[i + 2]!));
      const 灰 = Math.round((新[i]! + 新[i + 1]! + 新[i + 2]!) / 9);
      const p = o + 宽 * 6;
      if (d > 门槛) [out[p], out[p + 1], out[p + 2]] = [255, 0, 0];
      else out[p] = out[p + 1] = out[p + 2] = 灰;
    }
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
