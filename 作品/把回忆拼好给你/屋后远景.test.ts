import { describe, expect, it } from 'vitest';
import { terrainRange, groundHeight, SurroundBlocks, behindHouseRange, flatArea, paved } from './地点/小木屋四周地形.ts';

/** 地点/屋后远景.tsx 的视距、雾止（那边引 three 和方块图集，测试引不进来，照抄） */
const viewDistance = 6, fogEnd = 192;

describe('小木屋四周的地（用户 10-24「而且怎么超平坦背景 合理吗？」）', () => {
  it('屋子四周那块平地是平的、不铺；出了平地有起伏', () => {
    for (let i = flatArea.west; i <= flatArea.east; i += 4)
      for (let j = flatArea.south; j <= flatArea.north; j += 4) {
        expect(Math.abs(groundHeight(i, j))).toBe(0);
        expect(paved(i, j, behindHouseRange)).toBe(false);
      }
    const heights = new Set<number>();
    for (let i = -120; i <= 120; i += 6) for (let j = 40; j <= 180; j += 6) heights.add(groundHeight(i, j));
    expect(heights.size).toBeGreaterThan(3);
  });

  it('屋后远景那一扇盖住 N = 10 整屏取景两边沿的视线一直到雾全淡掉（中心左右挪 3 格也够）', () => {
    const r = behindHouseRange;
    // 半宽 8 格（1280 页面像素 ÷ N 10 的 每格 160 × 2 ÷ 2）在 视距 处，往远处按比例张开；雾按离眼睛（y = −视距）的水平距离算
    const slope = 8 / viewDistance;
    for (let d = 1; d <= fogEnd; d += 1) {
      const y = -viewDistance + d / Math.hypot(1, slope);
      const halfWidth = (d * slope) / Math.hypot(1, slope) + 3;
      expect(r.fanWidth + (y - r.fanCenter[1]) * r.fanSpread).toBeGreaterThanOrEqual(halfWidth);
      expect(Math.hypot(halfWidth, y - r.fanCenter[1])).toBeLessThanOrEqual(r.radius);
    }
  });

  it('第 6、7 句那一扇和门口屋后那一扇是同一片地：两边都铺到的格，地面一样高（只比地面以下有没有方块：门口那一扇不长樱花林，树干底下不变泥土）', () => {
    const posKey = (b: { 位: readonly number[] }) => b.位.join(',');
    const readRange = (r: typeof terrainRange) => {
      const surroundBlocks = SurroundBlocks(r);
      return new Set(
        [...surroundBlocks.plains, ...surroundBlocks.cherryGrove]
          .filter((b) => b.位[1]! >= 30 && b.位[1]! <= 50 && Math.abs(b.位[0]!) <= 20 && b.位[2]! < groundHeight(b.位[0]!, b.位[1]!))
          .map(posKey),
      );
    };
    const terrainSet = readRange(terrainRange), backViewKeys = readRange(behindHouseRange);
    expect(backViewKeys.size).toBeGreaterThan(500);
    expect([...backViewKeys].filter((k) => !terrainSet.has(k))).toEqual([]);
  });

  it('门口那一扇（第 8～11 句）没有樱花林：用户 10-25「背景从什么都没有到长成一片樱花林」，第 13 句才一棵棵冒；第 6、7 句那一扇照旧有', () => {
    const backViewBlocks = SurroundBlocks(behindHouseRange);
    expect(backViewBlocks.cherryGrove).toEqual([]);
    expect(backViewBlocks.plains.filter((b) => /cherry|pink_petals/.test(b.状态))).toEqual([]);
    const terrainBlocks = SurroundBlocks(terrainRange);
    expect(terrainBlocks.cherryGrove.some((b) => b.状态.startsWith('minecraft:cherry_leaves'))).toBe(true);
  });

  it('同一份种子铺出来的一样（每个渲染页面各铺一遍，帧和帧不能差）', () => {
    const a = SurroundBlocks(behindHouseRange), b = SurroundBlocks(behindHouseRange);
    expect(a.plains.length).toBe(b.plains.length);
    expect(a.plains.slice(0, 50)).toEqual(b.plains.slice(0, 50));
  });
});
