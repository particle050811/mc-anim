// 区段包格式（区段包.ts）：块文件头编了再解回来一样，别的格式版本报清楚；块里各级区段的索引位置来回对得上；区段 → 体素块按列铺对；粗高度图查得对。
// 块文件头的字节存在 金样/区段包.json：格式一变，已经烘焙好的地形包就读不对了。区段本身的编解码和金样在 pipeline/世界/烘焙/区段编码.test.ts（engine 不引 pipeline）。
// 区段包.ts 引了方块表（数据根里的资产），这里换成空表：这些测试用不到方块。
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: { 贴图: [], 面组: [], 方块: {} } }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: { 群系: {} } }));
const P = await import('./区段包.ts');
const { mulberry32 } = await import('../core/数学.ts');
const { sectionCells, coarsestLevel } = await import('./区段.ts');

/** 固定种子造一个合法的区段：每列若干段、段长加起来正好 nz */
const makeSection = (seed: number, L = 2, nz = 20): import('./区段包.ts').SectionData => {
  const r = mulberry32(seed);
  const columnCount = P.paddedSectionCols ** 2;
  const runCounts = new Uint16Array(columnCount);
  const ids: number[] = [];
  const runLengths: number[] = [];
  for (let c = 0; c < columnCount; c++) {
    let remain = nz;
    let n = 0;
    while (remain > 0) {
      const l = Math.min(remain, 1 + Math.floor(r() * 8));
      ids.push(Math.floor(r() * 4));
      runLengths.push(l);
      remain -= l;
      n++;
    }
    runCounts[c] = n;
  }
  return { L, i: -3, j: 7, kBottom: -5, nz, palette: Uint16Array.from([0, P.noBiome, 1, 0, 2, P.noBiome, 3, 2]), runCounts, paletteIndex: Uint16Array.from(ids), runLengths: Uint16Array.from(runLengths) };
};

describe('区段包', () => {
  it('块文件头是别的格式版本：报清楚（旧包要 anim assets pull 或转码），不当成能读', () => {
    const tileHeader = P.encodeTileHeader(0, 0, new Uint32Array(2 * P.tileEntryCount));
    new DataView(tileHeader.buffer).setUint32(4, 1, true);
    expect(() => P.decodeTileHeader(tileHeader)).toThrow(/格式 1.*anim assets pull/);
    expect(() => P.decodeTileHeader(new Uint8Array(P.tileHeaderLen))).toThrow(/不是块文件/);
  });
  it('块文件头编了再解回来一样；索引项数是各级一边区段数的平方和', () => {
    let itemTotal = 0;
    for (let L = 0; L <= coarsestLevel; L++) itemTotal += (P.tileSizeM / (sectionCells * 2 ** L)) ** 2;
    expect(P.tileEntryCount).toBe(itemTotal);
    const tileEntryTable = Uint32Array.from({ length: 2 * P.tileEntryCount }, (_, k) => (k * 2654435761) >>> 0);
    const tileHeader = P.encodeTileHeader(-1, 2, tileEntryTable);
    expect(tileHeader.length).toBe(P.tileHeaderLen);
    expect([...P.decodeTileHeader(tileHeader)]).toEqual([...tileEntryTable]);
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
    const d = makeSection(5, 1, 12);
    const packTable = { value: Uint16Array.from([0, 11, 12, 13]), 色: (s: number, b: number) => [s, b === P.noBiome ? 0 : b, 0] as [number, number, number] };
    const g = P.sectionToVoxels(d, packTable);
    expect([g.nx, g.ny, g.nz, g.cell]).toEqual([P.paddedSectionCols, P.paddedSectionCols, 12, 2]);
    expect(g.origin).toEqual([-3 * sectionCells * 2, 7 * sectionCells * 2, -5 * 2]);
    expect(g.palette.map((p) => p.v)).toEqual([0, 11, 12, 13]);
    // 第 0 列：从顶往下逐段核
    let z = d.nz;
    for (let r = 0; r < d.runCounts[0]!; r++) {
      for (let k = z - d.runLengths[r]!; k < z; k++) expect(g.vox[k * g.nx * g.ny]).toBe(d.paletteIndex[r]);
      z -= d.runLengths[r]!;
    }
    expect(z).toBe(0);
  });
  it('粗高度图：越界、没数据给 −Infinity；有没有区段看核心范围里有没有数据', () => {
    const heights = new Int16Array([5, -32768, 7, 9, -32768, -32768]);
    const b64 = Buffer.from(heights.buffer).toString('base64');
    const coarseHeight = P.decodeCoarseHeight({ coarseHeight: { cell: 32, x0: -64, y0: 0, nx: 3, ny: 2, height: b64 } });
    expect(P.coarseHeightAt(coarseHeight, -60, 1)).toBe(5);
    expect(P.coarseHeightAt(coarseHeight, -20, 1)).toBe(-Infinity);
    expect(P.coarseHeightAt(coarseHeight, 10, 40)).toBe(-Infinity);
    expect(P.coarseHeightAt(coarseHeight, -40, 40)).toBe(9);
    expect(P.coarseHeightAt(coarseHeight, 100, 1)).toBe(-Infinity);
    expect(P.hasSection(coarseHeight, { L: 0, i: -1, j: 0 })).toBe(true);
    expect(P.hasSection(coarseHeight, { L: 0, i: -3, j: 0 })).toBe(false);
    expect(P.hasSection(coarseHeight, { L: 0, i: 5, j: 0 })).toBe(false);
  });
  it('能不能细分的位图（splittable）：范围里按位查，范围外、没列的级都不能；包里没有这一项 = 不限', () => {
    expect(P.decodeSplittable({})).toBeUndefined();
    // 第 2 级 3 × 2 个区段（i −1～1、j 4～5），能分的是 (−1, 4)、(1, 4)、(0, 5)：位 0、2、4
    const canSplit = P.decodeSplittable({ splittable: [null, null, { i0: -1, j0: 4, ni: 3, nj: 2, bits: Buffer.from([0b10101]).toString('base64') }] })!;
    const yes = [[-1, 4], [1, 4], [0, 5]], no = [[0, 4], [-1, 5], [1, 5], [-2, 4], [2, 4], [0, 3], [0, 6]];
    for (const [i, j] of yes) expect(canSplit(2, i!, j!)).toBe(true);
    for (const [i, j] of no) expect(canSplit(2, i!, j!)).toBe(false);
    expect(canSplit(1, 0, 5)).toBe(false);
    expect(canSplit(3, 0, 5)).toBe(false);
    // 位图跨字节：第 9 位
    const wide = P.decodeSplittable({ splittable: [null, { i0: 0, j0: 0, ni: 16, nj: 1, bits: Buffer.from([0, 0b10]).toString('base64') }] })!;
    expect(Array.from({ length: 16 }, (_, i) => wide(1, i, 0))).toEqual(Array.from({ length: 16 }, (_, i) => i === 9));
  });
  it('块文件头的字节（金样）', async () => {
    const json = JSON.stringify({
      chunkHeaderSha256: crypto.createHash('sha256').update(P.encodeTileHeader(1, -1, Uint32Array.from({ length: 2 * P.tileEntryCount }, (_, k) => k))).digest('hex'),
      coarseHeightFingerprint: P.coarseHeightFingerprint(P.decodeCoarseHeight({ coarseHeight: { cell: 32, x0: -64, y0: 0, nx: 2, ny: 1, height: Buffer.from(new Int16Array([3, -32768]).buffer).toString('base64') } })),
    }, null, 1);
    await expect(json + '\n').toMatchFileSnapshot('./金样/区段包.json');
  });
});
