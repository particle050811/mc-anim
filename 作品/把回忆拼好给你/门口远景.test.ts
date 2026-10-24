import { describe, expect, it } from 'vitest';
import { 远景树们, 远景地面高, 远景方块, 门口远景 } from './地点/门口远景地形.ts';

/** 地点/门口远景.tsx 的视距、雾止（那边引 three 和方块图集，测试引不进来，照抄） */
const 视距 = 6, 雾止 = 192;

describe('门口远景的地形（用户 10-24「而且怎么超平坦背景 合理吗？」）', () => {
  it('屋后 平到 格以内是平的（透视里藏在屋前那条草地后面），往后有起伏', () => {
    const 远 = 门口远景;
    for (let i = -40; i <= 40; i += 4) for (let j = 0; j < 远.平到; j += 3) expect(远景地面高(i, j)).toBe(0);
    const 高们 = new Set<number>();
    for (let i = -120; i <= 120; i += 6) for (let j = 60; j <= 180; j += 6) 高们.add(远景地面高(i, j));
    expect(高们.size).toBeGreaterThan(3);
  });

  it('樱花树都在林里、离屋子至少 林近 格；橡树都在范围里', () => {
    const { 林, 范围 } = 门口远景;
    for (const t of 远景树们()) {
      expect(t.i).toBeGreaterThanOrEqual(范围.西);
      expect(t.i).toBeLessThanOrEqual(范围.东);
      expect(t.j).toBeLessThanOrEqual(范围.北);
      if (t.种 === '樱') expect(t.j).toBeGreaterThanOrEqual(林.林近);
    }
  });

  it('范围盖住 N = 10 整屏取景两边沿的视线一直到雾全淡掉（中心左右挪 3 格也够）', () => {
    const { 范围 } = 门口远景;
    // 半宽 8 格（1280 页面像素 ÷ N 10 的 每格 160 × 2 ÷ 2）在 视距 处，往远处按比例张开；雾按离眼睛（y = −视距）的水平距离算
    const 张 = 8 / 视距;
    const 深 = 雾止 / Math.hypot(1, 张);
    expect(深 * 张 + 3).toBeLessThanOrEqual(范围.东);
    expect(-深 * 张 - 3).toBeGreaterThanOrEqual(范围.西);
    expect(雾止 - 视距).toBeLessThanOrEqual(范围.北);
  });

  it('同一份种子铺出来的一样（每个渲染页面各铺一遍，帧和帧不能差）', () => {
    const a = 远景方块(), b = 远景方块();
    expect(a.平原.length).toBe(b.平原.length);
    expect(a.樱花林.length).toBe(b.樱花林.length);
    expect(a.樱花林.slice(0, 50)).toEqual(b.樱花林.slice(0, 50));
  });
});
