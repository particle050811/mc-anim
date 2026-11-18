// 帧差：PNG 解成 rgb24、逐像素几档占比、最大差，块平均差和 anim verify 用的 computeBlockDiff 是同一个数。
import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { computeBlockDiff } from './比较.ts';
import { frameDiff, frameDiffText, pngToRgb, worseFirst } from './帧差.ts';

const threshold = { block8Threshold: 24, block16Threshold: 10, block64Threshold: 4, glanceThreshold: 6 };
const png = (width: number, height: number, data: Uint8Array | Uint16Array, channels: number, depth: 8 | 16 = 8) => encode({ width, height, data, channels, depth });

describe('帧差', () => {
  it('RGBA、16 位、灰度都换成 8 位 RGB，alpha 不看', () => {
    expect([...pngToRgb(png(1, 1, new Uint8Array([1, 2, 3, 0]), 4)).rgb]).toEqual([1, 2, 3]);
    expect([...pngToRgb(png(1, 1, new Uint16Array([0x0100, 0x0200, 0xff00]), 3, 16)).rgb]).toEqual([1, 2, 255]);
    expect([...pngToRgb(png(1, 1, new Uint8Array([7]), 1)).rgb]).toEqual([7, 7, 7]);
  });

  it('各档占比按「任一通道」数，最大差取三通道最大；块差和 computeBlockDiff 一样', () => {
    const w = 16, h = 16;
    const base = new Uint8Array(w * h * 3).fill(100);
    const changed = Uint8Array.from(base);
    changed[0] = 101; // 像素 0：R 差 1
    changed[3 * 5 + 2] = 110; // 像素 5：B 差 10
    changed[3 * 9 + 1] = 50; // 像素 9：G 差 50
    const d = frameDiff(png(w, h, changed, 3), png(w, h, base, 3), threshold);
    expect(d.over).toEqual({ 0: 3, 8: 2, 32: 1 });
    expect(d.maxDiff).toBe(50);
    expect(d.block).toEqual(computeBlockDiff(Buffer.from(changed), Buffer.from(base), w, h));
    expect(frameDiffText(d)).toMatch(/^差像素 >0 1\.17%（3 像素）、>8 0\.78%（2 像素）、>32 0\.39%（1 像素），最大差 50 级；块平均差 16×16 0\.2、64×64 0\.0、8×8 0\.8（按 verify 的门槛：容差内）$/);
    expect(() => frameDiff(png(w, h, base, 3), png(8, 8, new Uint8Array(8 * 8 * 3), 3), threshold)).toThrow(/尺寸不同/);
  });

  it('最差的排前面：先比 16×16 块差（整片偏 3 级比单个像素差 200 级靠前）', () => {
    const w = 16, h = 16;
    const base = new Uint8Array(w * h * 3);
    const one = Uint8Array.from(base);
    one[0] = 200;
    const many = Uint8Array.from(base).fill(3);
    const spike = frameDiff(png(w, h, one, 3), png(w, h, base, 3), threshold);
    const wash = frameDiff(png(w, h, many, 3), png(w, h, base, 3), threshold);
    expect([spike, wash].sort(worseFirst)).toEqual([wash, spike]);
    const spike2 = frameDiff(png(w, h, Uint8Array.from(one).fill(100, 0, 1), 3), png(w, h, base, 3), threshold);
    expect([spike2, spike].sort(worseFirst)).toEqual([spike, spike2]);
    expect(spike.block[16].差).toBeCloseTo(200 / 256);
    expect(wash.block[16].差).toBe(3);
  });
});
