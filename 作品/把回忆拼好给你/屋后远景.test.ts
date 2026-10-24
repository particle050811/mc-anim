import { describe, expect, it } from 'vitest';
import { 地形范围, 地面高, 四周方块, 屋后远景范围, 平地, 铺 } from './地点/小木屋四周地形.ts';

/** 地点/屋后远景.tsx 的视距、雾止（那边引 three 和方块图集，测试引不进来，照抄） */
const 视距 = 6, 雾止 = 192;

describe('小木屋四周的地（用户 10-24「而且怎么超平坦背景 合理吗？」）', () => {
  it('屋子四周那块平地是平的、不铺；出了平地有起伏', () => {
    for (let i = 平地.西; i <= 平地.东; i += 4)
      for (let j = 平地.南; j <= 平地.北; j += 4) {
        expect(Math.abs(地面高(i, j))).toBe(0);
        expect(铺(i, j, 屋后远景范围)).toBe(false);
      }
    const 高们 = new Set<number>();
    for (let i = -120; i <= 120; i += 6) for (let j = 40; j <= 180; j += 6) 高们.add(地面高(i, j));
    expect(高们.size).toBeGreaterThan(3);
  });

  it('屋后远景那一扇盖住 N = 10 整屏取景两边沿的视线一直到雾全淡掉（中心左右挪 3 格也够）', () => {
    const r = 屋后远景范围;
    // 半宽 8 格（1280 页面像素 ÷ N 10 的 每格 160 × 2 ÷ 2）在 视距 处，往远处按比例张开；雾按离眼睛（y = −视距）的水平距离算
    const 张 = 8 / 视距;
    for (let d = 1; d <= 雾止; d += 1) {
      const y = -视距 + d / Math.hypot(1, 张);
      const 半宽 = (d * 张) / Math.hypot(1, 张) + 3;
      expect(r.扇宽 + (y - r.扇心[1]) * r.扇张).toBeGreaterThanOrEqual(半宽);
      expect(Math.hypot(半宽, y - r.扇心[1])).toBeLessThanOrEqual(r.半径);
    }
  });

  it('第 6、7 句那一扇和门口屋后那一扇是同一片地：两边都铺到的格，方块一样', () => {
    const 键 = (b: { 状态: string; 位: readonly number[] }) => `${b.位.join(',')}=${b.状态}`;
    const 取 = (r: typeof 地形范围) => {
      const 块 = 四周方块(r);
      return new Set([...块.平原, ...块.樱花林].filter((b) => b.位[1]! >= 30 && b.位[1]! <= 50 && Math.abs(b.位[0]!) <= 20).map(键));
    };
    const 七 = 取(地形范围), 八 = 取(屋后远景范围);
    expect(八.size).toBeGreaterThan(500);
    expect([...八].filter((k) => !七.has(k))).toEqual([]);
  });

  it('同一份种子铺出来的一样（每个渲染页面各铺一遍，帧和帧不能差）', () => {
    const a = 四周方块(屋后远景范围), b = 四周方块(屋后远景范围);
    expect(a.平原.length).toBe(b.平原.length);
    expect(a.樱花林.length).toBe(b.樱花林.length);
    expect(a.樱花林.slice(0, 50)).toEqual(b.樱花林.slice(0, 50));
  });
});
