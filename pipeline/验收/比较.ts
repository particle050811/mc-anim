// 比两版画面和声音：哈希一样就是没变；不一样时有旧母版就逐像素、逐采样比，没有就只能比块均值。
// 阈值在 verify/阈值.toml。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';

export type 阈值 = { 像素容差: number; 差像素占比: number; 块均值容差: number; 音频残差dBFS: number };

export const 阈值文件 = () => path.join(代码根(), 'verify', '阈值.toml');

export const 读阈值 = (file = 阈值文件()): 阈值 => {
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const 键 = ['像素容差', '差像素占比', '块均值容差', '音频残差dBFS'] as const;
  for (const k of 键) if (typeof t[k] !== 'number') throw new Error(`${file} 要写数字 ${k}`);
  return Object.fromEntries(键.map((k) => [k, t[k]])) as 阈值;
};

/** 逐像素比：超过 像素容差 的像素占多少、最大差多少 */
export const 比像素 = (新: Buffer, 旧: Buffer, 像素容差: number) => {
  if (新.length !== 旧.length) throw new Error('两帧大小不一样');
  let 超 = 0;
  let 最大 = 0;
  for (let i = 0; i < 新.length; i += 3) {
    const d = Math.max(Math.abs(新[i]! - 旧[i]!), Math.abs(新[i + 1]! - 旧[i + 1]!), Math.abs(新[i + 2]! - 旧[i + 2]!));
    if (d > 像素容差) 超++;
    if (d > 最大) 最大 = d;
  }
  return { 差像素占比: 超 / (新.length / 3), 最大差: 最大 };
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

/** 两段 s16le 逐采样相减的 RMS，按满幅算 dBFS；完全一样是 -Infinity */
export class 残差 {
  private 平方和 = 0;
  private 个数 = 0;
  加(新: Buffer, 旧: Buffer) {
    const n = Math.min(新.length, 旧.length) >> 1;
    for (let i = 0; i < n; i++) {
      const d = 新.readInt16LE(i * 2) - 旧.readInt16LE(i * 2);
      this.平方和 += d * d;
    }
    this.个数 += n;
  }
  get dBFS() {
    if (!this.个数 || !this.平方和) return -Infinity;
    return 20 * Math.log10(Math.sqrt(this.平方和 / this.个数) / 32768);
  }
}
