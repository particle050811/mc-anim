// 区段包格式（区段包.ts）：区段、块文件头编了再解回来一样；块里各级区段的索引位置来回对得上；区段 → 体素块按列铺对；粗高度图查得对。
// 一个固定区段编出来的字节（头 36 字节和整段的 sha256）存在 金样/区段包.json：格式一变，已经烘焙好的地形包就读不对了。
// 区段包.ts 引了方块表（数据根里的资产），这里换成空表：这些测试用不到方块。
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: { 贴图: [], 面组: [], 方块: {} } }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: { 群系: {} } }));
const P = await import('./区段包.ts');
const { mulberry32 } = await import('../core/数学.ts');
const { sectionCells, coarsestLevel } = await import('./区段.ts');

/** 固定种子造一个合法的区段：每列若干段、段长加起来正好 nz */
const 造区段 = (种子: number, L = 2, nz = 20): import('./区段包.ts').SectionData => {
  const r = mulberry32(种子);
  const 列数 = P.paddedSectionCols ** 2;
  const runCounts = new Uint16Array(列数);
  const 号: number[] = [];
  const 长: number[] = [];
  for (let c = 0; c < 列数; c++) {
    let 剩 = nz;
    let n = 0;
    while (剩 > 0) {
      const l = Math.min(剩, 1 + Math.floor(r() * 8));
      号.push(Math.floor(r() * 4));
      长.push(l);
      剩 -= l;
      n++;
    }
    runCounts[c] = n;
  }
  return { L, i: -3, j: 7, kBottom: -5, nz, palette: Uint16Array.from([0, P.noBiome, 1, 0, 2, P.noBiome, 3, 2]), runCounts, paletteIndex: Uint16Array.from(号), runLengths: Uint16Array.from(长) };
};
const 平 = (d: import('./区段包.ts').SectionData) => ({ ...d, palette: [...d.palette], runCounts: [...d.runCounts], paletteIndex: [...d.paletteIndex], runLengths: [...d.runLengths] });

describe('区段包', () => {
  it('区段编了再解回来一样（解的时候输入不从 0 偏移也行）', () => {
    for (const 种 of [1, 2, 3]) {
      const d = 造区段(种);
      const 字节 = P.encodeSection(d);
      const 错位 = new Uint8Array(字节.length + 3);
      错位.set(字节, 3);
      expect(平(P.decodeSection(字节))).toEqual(平(d));
      expect(平(P.decodeSection(错位.subarray(3)))).toEqual(平(d));
    }
    expect(() => P.decodeSection(new Uint8Array(40))).toThrow(/版本 1/);
  });
  it('块文件头编了再解回来一样；索引项数是各级一边区段数的平方和', () => {
    let 项 = 0;
    for (let L = 0; L <= coarsestLevel; L++) 项 += (P.tileSizeM / (sectionCells * 2 ** L)) ** 2;
    expect(P.tileEntryCount).toBe(项);
    const 表 = Uint32Array.from({ length: 2 * P.tileEntryCount }, (_, k) => (k * 2654435761) >>> 0);
    const 头 = P.encodeTileHeader(-1, 2, 表);
    expect(头.length).toBe(P.tileHeaderLen);
    expect([...P.decodeTileHeader(头)]).toEqual([...表]);
    expect(P.tileFileName(-1, 2)).toBe('-1.2.块');
  });
  it('区段在块里的位置和按位置取区段互逆（负的块号也对）', () => {
    for (const [ti, tj] of [[0, 0], [-1, 2], [3, -4]]) {
      for (let k = 0; k < P.tileEntryCount; k += 37) {
        const s = P.sectionAtIndex(ti, tj, k);
        expect(P.sectionInTile(s)).toEqual({ ti, tj, slot: k });
      }
    }
    expect(P.sectionInTile({ L: coarsestLevel, i: -1, j: 0 })).toEqual({ ti: -1, tj: 0, slot: P.tileEntryCount - 1 });
  });
  it('区段 → 体素块：每列从上往下按段铺，空气不写，原点按级换成米', () => {
    const d = 造区段(5, 1, 12);
    const 包表 = { 值: Uint16Array.from([0, 11, 12, 13]), 色: (s: number, b: number) => [s, b === P.noBiome ? 0 : b, 0] as [number, number, number] };
    const g = P.sectionToVoxels(d, 包表);
    expect([g.nx, g.ny, g.nz, g.格]).toEqual([P.paddedSectionCols, P.paddedSectionCols, 12, 2]);
    expect(g.原点).toEqual([-3 * sectionCells * 2, 7 * sectionCells * 2, -5 * 2]);
    expect(g.色板.map((p) => p.v)).toEqual([0, 11, 12, 13]);
    // 第 0 列：从顶往下逐段核
    let z = d.nz;
    for (let r = 0; r < d.runCounts[0]!; r++) {
      for (let k = z - d.runLengths[r]!; k < z; k++) expect(g.vox[k * g.nx * g.ny]).toBe(d.paletteIndex[r]);
      z -= d.runLengths[r]!;
    }
    expect(z).toBe(0);
  });
  it('粗高度图：越界、没数据给 −Infinity；有没有区段看核心范围里有没有数据', () => {
    const 高 = new Int16Array([5, -32768, 7, 9, -32768, -32768]);
    const b64 = Buffer.from(高.buffer).toString('base64');
    const 图 = P.decodeCoarseHeight({ 粗高度: { 格: 32, x0: -64, y0: 0, nx: 3, ny: 2, 高: b64 } });
    expect(P.coarseHeightAt(图, -60, 1)).toBe(5);
    expect(P.coarseHeightAt(图, -20, 1)).toBe(-Infinity);
    expect(P.coarseHeightAt(图, 10, 40)).toBe(-Infinity);
    expect(P.coarseHeightAt(图, -40, 40)).toBe(9);
    expect(P.coarseHeightAt(图, 100, 1)).toBe(-Infinity);
    expect(P.hasSection(图, { L: 0, i: -2, j: 0 })).toBe(true);
    expect(P.hasSection(图, { L: 0, i: 5, j: 0 })).toBe(false);
  });
  it('固定区段编出来的字节（金样）', async () => {
    const 字节 = P.encodeSection(造区段(42));
    const 文 = JSON.stringify({
      长: 字节.length,
      头: Buffer.from(字节.subarray(0, 36)).toString('hex'),
      sha256: crypto.createHash('sha256').update(字节).digest('hex'),
      块头sha256: crypto.createHash('sha256').update(P.encodeTileHeader(1, -1, Uint32Array.from({ length: 2 * P.tileEntryCount }, (_, k) => k))).digest('hex'),
      粗高度指纹: P.coarseHeightFingerprint(P.decodeCoarseHeight({ 粗高度: { 格: 32, x0: -64, y0: 0, nx: 2, ny: 1, 高: Buffer.from(new Int16Array([3, -32768]).buffer).toString('base64') } })),
    }, null, 1);
    await expect(文 + '\n').toMatchFileSnapshot('./金样/区段包.json');
  });
});
