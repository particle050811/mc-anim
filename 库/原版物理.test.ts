// 原版下落正本：和 6-3-2 的 fallTime、2-末地 的 原版下落、2-第一晚 的 下落 和 按刻取 对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 取函数 } from '../pipeline/检查/副本识别.ts';
import { 原版运动, 下落一刻, 下落表, 下落高度, 按刻取, 物品下落, 落地刻 } from './原版物理.ts';

const 根 = path.resolve(import.meta.dirname, '..');
const 副本 = (文件: string, 名: string, 额外?: Record<string, unknown>) =>
  取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名, { 允许循环: true, 额外 }) as (...a: never[]) => unknown;
const 落差们 = [0.3, 1, 2.5, 5, 23, 80];

describe('原版下落正本', () => {
  it('前几刻：0、0、−0.0784、−0.233632……（先挪再改速度）；站着的竖直速度是 −0.0784', () => {
    expect(原版运动.站着竖直速度).toBeCloseTo(-0.0784, 12);
    let s = { 高: 0, 速: 0 };
    const 高们 = [0];
    for (let i = 0; i < 4; i++) 高们.push((s = 下落一刻(s.高, s.速)).高);
    expect(高们.map((x) => +x.toFixed(6))).toEqual([0, 0, -0.0784, -0.233632, -0.464159]);
    expect(下落高度(2)).toBeCloseTo(-0.0784, 12);
    expect(下落高度(2.5)).toBeCloseTo((-0.0784 - 0.233632) / 2, 9);
    expect(下落高度(-1)).toBe(0);
  });
  it('终端速度约 3.92 格/刻；物品重力减半', () => {
    const 速 = 下落高度(400) - 下落高度(399);
    expect(速).toBeCloseTo(-3.92, 2);
    expect(下落高度(400, { 重力: 原版运动.物品重力 }) - 下落高度(399, { 重力: 原版运动.物品重力 })).toBeCloseTo(-1.96, 2);
  });
  it('物品、下落方块先加重力再挪：第一刻就掉 0.04，往后 −0.04 − 0.0792……', () => {
    let s = { 高: 0, 速: 0 };
    const 高们 = [0];
    for (let i = 0; i < 3; i++) 高们.push((s = 下落一刻(s.高, s.速, 原版运动.物品重力, 原版运动.竖直阻力, true)).高);
    expect(高们.map((x) => +x.toFixed(6))).toEqual([0, -0.04, -0.1192, -0.236816]);
    expect(下落高度(2, 物品下落)).toBeCloseTo(-0.1192, 12);
    expect(下落高度(1.5, { ...物品下落, 初速: 0.2 })).toBeCloseTo(0.16 + 0.5 * (0.16 * 0.98 - 0.04), 12);
    expect(下落表(1, 物品下落).at(-1)).toBe(-1);
    expect(下落高度(落地刻(3, 物品下落), 物品下落)).toBeCloseTo(-3, 9);
  });
  it('下落表 末项正好 −落差，落地刻 落在表的最后一段里', () => {
    for (const h of 落差们) {
      const 表 = 下落表(h);
      expect(表.at(-1)).toBe(-h);
      const k = 落地刻(h);
      expect(k).toBeGreaterThan(表.length - 3);
      expect(k).toBeLessThanOrEqual(表.length - 1);
      expect(下落高度(k)).toBeCloseTo(-h, 9);
    }
    expect(下落表(0)).toEqual([0]);
    expect(落地刻(0)).toBe(0);
  });
  it('按刻取：刻间线性、两头停住', () => {
    expect(按刻取([0, -1, -3], 1.5)).toBe(-2);
    expect(按刻取([0, -1, -3], -2)).toBe(0);
    expect(按刻取([0, -1, -3], 9)).toBe(-3);
    expect(() => 按刻取([], 0)).toThrow();
  });
});

describe('原版下落正本和旧副本对得上', () => {
  it('6-3-2 的 fallTime（秒）= 落地刻 / 20', () => {
    const fallTime = 副本('作品/应力转动/地点/边城/6-3-2/编排.ts', 'fallTime') as (h: number) => number;
    for (const h of 落差们) expect(fallTime(h)).toBeCloseTo(落地刻(h) / 20, 12);
  });
  it('2-末地 的 原版下落（掉了多少格）= −下落高度', () => {
    const 旧 = 副本('作品/把回忆拼好给你/场/2-末地/编排.ts', '原版下落') as (k: number) => number;
    for (const k of [-1, 0, 0.5, 1, 2.25, 7, 19.9, 60]) expect(旧(k)).toBeCloseTo(-下落高度(k), 12);
  });
  it('2-第一晚 的 下落（默认从站着的速度开始）和 按刻取', () => {
    const 旧 = 副本('作品/把回忆拼好给你/段/2-第一晚/编排.ts', '下落', { 站着vy: 原版运动.站着竖直速度 }) as (h: number, v?: number) => number[];
    for (const h of 落差们) {
      expect(旧(h)).toEqual(下落表(h, { 初速: 原版运动.站着竖直速度 }));
      expect(旧(h, 0)).toEqual(下落表(h));
    }
    const 旧取 = 副本('作品/把回忆拼好给你/段/2-第一晚/编排.ts', '按刻取') as (表: number[], k: number) => number;
    const 表 = 下落表(5);
    for (const k of [-1, 0, 0.5, 3.3, 7, 100]) expect(旧取(表, k)).toBeCloseTo(按刻取(表, k), 12);
  });
});
