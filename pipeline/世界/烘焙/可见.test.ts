// 可见变换的小例子（不读包）：用户 11-14 点名要防的误伤各造一个最小的。整包的格、网格核对在转码时跑（可见核对.ts），端到端在 烘焙.test.ts。
import { describe, expect, it } from 'vitest';
import { 埋格换石, 填封闭腔, 邻圈归一, 核心边换石, 做安全项, 成区段, 成格子, 窗边 as 边, type 格子 } from './可见.ts';
import { 到列优先 } from './区段编码.ts';
import { 封闭 } from './可见核对.ts';

const 列数 = 边 * 边, nz = 40, 顶 = 30; // 实心到 k = 29，上面是空气
const 空 = 0, 石 = 1, 土 = 2, 水 = 3;
const 造 = (): 格子 => {
  const cm = new Uint16Array(列数 * nz);
  for (let c = 0; c < 列数; c++) cm.fill(土, c * nz, c * nz + 顶);
  return { id: { L: 0, i: 0, j: 0 }, kBottom: 0, nz, cm, 色板: [0, 65535, 1, 65535, 2, 65535, 3, 65535], 满: Uint8Array.of(0, 1, 1, 0), 石 };
};
const at = (x: number, y: number, k: number) => (y * 边 + x) * nz + k;
const 挖 = (g: 格子, x0: number, y0: number, k0: number, x1: number, y1: number, k1: number, v = 空) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let k = k0; k <= k1; k++) g.cm[at(x, y, k)] = v; };
const 洞 = (g: 格子, v = 空) => 挖(g, 15, 15, 10, 17, 17, 12, v); // 3×3×3 的腔，顶上还有 17 格土

describe('封腔填实', () => {
  it('封死的腔填，水腔一样；填的格经 封闭 复核', () => {
    const g = 造(); 洞(g);
    const 原 = { ...g, cm: g.cm.slice() }, 填 = 填封闭腔(g);
    expect(填.length).toBe(27);
    expect(封闭(原, 填)).toBe(0);
    const w = 造(); 洞(w, 水);
    expect(填封闭腔(w).length).toBe(27);
  });
  it('腔经一条 1 格的洞横着再拐上去通到地面：不填', () => {
    const g = 造(); 洞(g); 挖(g, 18, 16, 11, 25, 16, 11); 挖(g, 25, 16, 12, 25, 16, 顶 - 1);
    expect(填封闭腔(g).length).toBe(0);
  });
  it('崖下的凹洞，口只有 1 格高：不填；洞壁和崖壁不换', () => {
    const g = 造(); 洞(g); 挖(g, 20, 0, 12, 边 - 1, 边 - 1, 顶 - 1); 挖(g, 18, 16, 12, 19, 16, 12);
    expect(填封闭腔(g).length).toBe(0);
    埋格换石(g);
    for (const [x, y, k] of [[14, 16, 11], [16, 16, 9], [16, 16, 13], [19, 10, 20], [19, 16, 13], [22, 10, 11]]) expect(g.cm[at(x!, y!, k!)], `贴着露天的 ${x},${y},${k}`).toBe(土);
    expect(g.cm[at(10, 10, 5)]).toBe(石); // 四面都埋着的照换
  });
  it('只经 1 格的洞横着通到核心的边（第 1 列）：窗口外不知道，当连通不填；差一格没到边就填', () => {
    const g = 造(); 洞(g); 挖(g, 1, 16, 11, 14, 16, 11);
    expect(填封闭腔(g).length).toBe(0);
    const h = 造(); 洞(h); 挖(h, 2, 16, 11, 14, 16, 11);
    expect(填封闭腔(h).length).toBe(27 + 13);
  });
  it('水连着水也算连通：腔里的水经水道通到地面的湖，不填', () => {
    const g = 造(); 洞(g, 水); 挖(g, 16, 16, 13, 16, 16, 顶 - 1, 水);
    expect(填封闭腔(g).length).toBe(0);
  });
});

describe('埋格换石', () => {
  it('不动核心的边和邻圈、最上一层、贴着腔的格，换完不透明性不变', () => {
    const g = 造(); 洞(g);
    const 前 = g.cm.slice();
    expect(埋格换石(g)).toBeGreaterThan(0);
    for (let i = 0; i < g.cm.length; i++) {
      const c = Math.floor(i / nz), k = i % nz, x = c % 边, y = (c - x) / 边;
      expect(g.满[g.cm[i]!]).toBe(g.满[前[i]!]);
      if (x < 2 || y < 2 || x > 边 - 3 || y > 边 - 3 || k >= 顶 - 1) expect(g.cm[i]).toBe(前[i]);
    }
    for (const [x, y, k] of [[14, 15, 10], [18, 17, 12], [16, 16, 13], [16, 16, 9]]) expect(g.cm[at(x!, y!, k!)]).toBe(土);
    expect(g.cm[at(14, 14, 9)]).toBe(石); // 只沿棱、角挨着腔的不算贴着
  });
});

describe('邻圈、核心边', () => {
  it('邻圈：被埋的整格换，露在地表的那层不换；不挡面的归空，水不动；核心一格不动', () => {
    const g = 造(); 挖(g, 0, 5, 顶, 0, 5, 顶, 水); 挖(g, 0, 6, 顶, 0, 6, 顶, 4);
    g.色板.push(4, 65535); g.满 = Uint8Array.of(0, 1, 1, 0, 0);
    const 前 = g.cm.slice();
    邻圈归一(g, Uint8Array.of(0, 0, 0, 0, 1));
    expect(g.cm[at(0, 9, 顶 - 1)]).toBe(土);
    expect(g.cm[at(0, 9, 顶 - 2)]).toBe(石);
    expect(g.cm[at(0, 5, 顶)]).toBe(水);
    expect(g.cm[at(0, 6, 顶)]).toBe(空);
    for (let i = 0; i < g.cm.length; i++) { const c = Math.floor(i / nz), x = c % 边, y = (c - x) / 边; if (x > 0 && y > 0 && x < 边 - 1 && y < 边 - 1) expect(g.cm[i]).toBe(前[i]); }
  });
  it('核心边：被埋的换；最上一层、贴着露天邻圈格的不换；没有邻段的一侧、粗格挡不住的不换', () => {
    const g = 造(); 挖(g, 0, 10, 20, 0, 10, 顶 - 1); // 邻圈上一道缝，露出核心边 (1, 10) 的侧面
    const 改 = 核心边换石(g, [true, true, true, false], (_x, y, _k, 侧) => !(侧 === 1 && y === 25));
    expect(改.length).toBeGreaterThan(0);
    expect(g.cm[at(1, 20, 5)]).toBe(石);
    expect(g.cm[at(1, 20, 顶 - 1)]).toBe(土);
    expect(g.cm[at(1, 10, 25)]).toBe(土);
    expect(g.cm[at(1, 10, 19)]).toBe(石);
    expect(g.cm[at(1, 25, 5)]).toBe(土); // 粗格挡不住
    expect(g.cm[at(20, 1, 5)]).toBe(土); // −y 一侧在包的边上
    expect(g.cm[at(1, 1, 5)]).toBe(土); // 角上的格两侧都要有邻段
    expect(g.cm[at(5, 5, 5)]).toBe(土); // 核心里面的不归它管
  });
  it('粗级不动核心边', () => {
    const g = { ...造(), id: { L: 1, i: 0, j: 0 } };
    const { 记 } = 做安全项(g, Uint8Array.of(0, 1, 1, 4), [true, true, true, true]);
    expect(记.核心边.length).toBe(0);
  });
});

describe('格子 ↔ 区段', () => {
  it('没改的格子原样回来；改了的色板按出现先后重排、丢掉没用的', () => {
    const g = 造(); 洞(g);
    const d = 成区段(g);
    expect(d.palette[0]).toBe(0);
    const back = 成格子(d, Uint8Array.of(0, 1, 1, 0), 1);
    expect(到列优先(成区段(back))).toEqual(到列优先(d));
    expect(成区段(back).palette).toEqual(d.palette);
    const { g: 改 } = 做安全项(back, Uint8Array.of(0, 1, 1, 4), [true, true, true, true]);
    const d2 = 成区段(改);
    // 土在最上面先出现，石头（填充）在后
    expect(Array.from(d2.palette)).toEqual([0, 65535, 2, 65535, 1, 65535]);
  });
});
