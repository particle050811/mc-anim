import { describe, expect, it } from 'vitest';
import { 樱花林, 远山 } from './参数.ts';
import { 地形雾起止, 坡上的树, 原版雾色, 天雾, 平地框, 雾浓, 高度 } from './远山.ts';

describe('窗外远山：地形', () => {
  it('樱花林那一圈（定点的树、撒树的方框）整个在平地框里，高都是 0：原来那圈树不悬空、不埋', () => {
    const [x0, y0, x1, y1] = 樱花林.内框;
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const r = 樱花林.外半径;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) expect(高度(x, y), `${x},${y}`).toBe(0);
    for (const [x, y] of 樱花林.定点) expect(高度(x, y)).toBe(0);
    expect(平地框[2] - 平地框[0]).toBe(2 * (r + 远山.平地留边));
  });

  it('出了平地框往外起伏：东边 60～200 格里有高有低，没有一格超过 起伏 给的上限', () => {
    const 高们 = Array.from({ length: 141 }, (_, i) => 高度(Math.floor(平地框[2]) + 60 + i, -12));
    expect(Math.max(...高们)).toBeGreaterThan(Math.min(...高们));
    高们.forEach((h, i) => expect(h).toBeLessThanOrEqual(Math.round(远山.起伏[0] + 远山.起伏[1] * (61 + i))));
  });

  it('坡上的树：主干最下面那格就落在那一列的草上，叶子不埋进坡里', () => {
    const { 木, 叶, 棵 } = 坡上的树();
    expect(棵).toBeGreaterThan(50);
    const 底 = new Map<string, number>();
    for (const [x, y, z] of 木) 底.set(`${x},${y}`, Math.min(底.get(`${x},${y}`) ?? Infinity, z));
    let 落地 = 0;
    for (const [k, z] of 底) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(z).toBeGreaterThanOrEqual(高度(x, y));
      if (z === 高度(x, y)) 落地++;
    }
    expect(落地).toBeGreaterThanOrEqual(棵);
    for (const [x, y, z] of 叶) expect(z).toBeGreaterThanOrEqual(高度(x, y));
  });
});

describe('窗外远山：原版的雾和天', () => {
  it('视距 12 区块：地形雾 172.8 格起、192 格全是雾', () => {
    expect(地形雾起止(12)).toEqual([172.8, 192]);
    expect(雾浓(172.8, 172.8, 192)).toBe(0);
    expect(雾浓(192, 172.8, 192)).toBe(1);
  });

  it('雾色在 cherry_grove 的雾色和天色之间，偏雾色', () => {
    const 雾 = 原版雾色('#78a7ff', '#c0d8ff', 12);
    const [天, 原雾] = [[0x78, 0xa7, 0xff], [0xc0, 0xd8, 0xff]].map((c) => c.map((v) => v / 255));
    雾.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(Math.max(天[i]!, 原雾[i]!));
      expect(v).toBeGreaterThanOrEqual(Math.min(天[i]!, 原雾[i]!));
      expect(Math.abs(v - 原雾[i]!)).toBeLessThanOrEqual(Math.abs(v - 天[i]!));
    });
  });

  it('天：天盘边（仰角 1.79°）以下全是雾色，越往上雾越淡，头顶几乎是天色', () => {
    expect(天雾(1.7, 12)).toBe(1);
    expect(天雾(0, 12)).toBe(1);
    let 上一 = 1;
    for (let 仰 = 2; 仰 <= 90; 仰 += 2) {
      const f = 天雾(仰, 12);
      expect(f).toBeLessThanOrEqual(上一);
      上一 = f;
    }
    expect(天雾(90, 12)).toBeLessThan(0.03);
  });
});
