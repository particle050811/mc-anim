import { describe, expect, it } from 'vitest';
import { cherryGrove, farHills } from './参数.ts';
import { terrainFogRange, buildSlopeTrees, vanillaFogColor, skyFog, flatBox, fogDensity, heightAt } from './远山.ts';

describe('窗外远山：地形', () => {
  it('樱花林那一圈（定点的树、撒树的方框）整个在平地框里，高都是 0：原来那圈树不悬空、不埋', () => {
    const [x0, y0, x1, y1] = cherryGrove.innerBox;
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const r = cherryGrove.outerRadius;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) expect(heightAt(x, y), `${x},${y}`).toBe(0);
    for (const [x, y] of cherryGrove.fixedPoints) expect(heightAt(x, y)).toBe(0);
    expect(flatBox[2] - flatBox[0]).toBe(2 * (r + farHills.flatMargin));
  });

  it('出了平地框往外起伏：东边 60～200 格里有高有低，没有一格超过 起伏 给的上限', () => {
    const heights = Array.from({ length: 141 }, (_, i) => heightAt(Math.floor(flatBox[2]) + 60 + i, -12));
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
    heights.forEach((h, i) => expect(h).toBeLessThanOrEqual(Math.round(farHills.起伏[0] + farHills.起伏[1] * (61 + i))));
  });

  it('坡上的树：主干最下面那格就落在那一列的草上，叶子不埋进坡里', () => {
    const { logs, leaves, 棵: treeCount } = buildSlopeTrees();
    expect(treeCount).toBeGreaterThan(50);
    const bottomHeights = new Map<string, number>();
    for (const [x, y, z] of logs) bottomHeights.set(`${x},${y}`, Math.min(bottomHeights.get(`${x},${y}`) ?? Infinity, z));
    let landedCount = 0;
    for (const [k, z] of bottomHeights) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(z).toBeGreaterThanOrEqual(heightAt(x, y));
      if (z === heightAt(x, y)) landedCount++;
    }
    expect(landedCount).toBeGreaterThanOrEqual(treeCount);
    for (const [x, y, z] of leaves) expect(z).toBeGreaterThanOrEqual(heightAt(x, y));
  });
});

describe('窗外远山：原版的雾和天', () => {
  it('视距 12 区块：地形雾 172.8 格起、192 格全是雾', () => {
    expect(terrainFogRange(12)).toEqual([172.8, 192]);
    expect(fogDensity(172.8, 172.8, 192)).toBe(0);
    expect(fogDensity(192, 172.8, 192)).toBe(1);
  });

  it('雾色在 cherry_grove 的雾色和天色之间，偏雾色', () => {
    const fog = vanillaFogColor('#78a7ff', '#c0d8ff', 12);
    const [skyRgb, originalFog] = [[0x78, 0xa7, 0xff], [0xc0, 0xd8, 0xff]].map((c) => c.map((v) => v / 255));
    fog.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(Math.max(skyRgb[i]!, originalFog[i]!));
      expect(v).toBeGreaterThanOrEqual(Math.min(skyRgb[i]!, originalFog[i]!));
      expect(Math.abs(v - originalFog[i]!)).toBeLessThanOrEqual(Math.abs(v - skyRgb[i]!));
    });
  });

  it('天：天盘边（仰角 1.79°）以下全是雾色，越往上雾越淡，头顶几乎是天色', () => {
    expect(skyFog(1.7, 12)).toBe(1);
    expect(skyFog(0, 12)).toBe(1);
    let prevValue = 1;
    for (let elevation = 2; elevation <= 90; elevation += 2) {
      const f = skyFog(elevation, 12);
      expect(f).toBeLessThanOrEqual(prevValue);
      prevValue = f;
    }
    expect(skyFog(90, 12)).toBeLessThan(0.03);
  });
});
