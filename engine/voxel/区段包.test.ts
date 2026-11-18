// 区段包格式（区段包.ts）：块文件编了再解回来一样（铺满、稀疏、最粗级不是 6 的），别的格式版本报清楚；区段 → 体素块按列铺对；粗图编解来回一样、查得对。
// 块文件、粗图的字节存在 金样/区段包.json：格式一变，已经烘焙好的地形包就读不对了。区段本身的编解码和金样在 pipeline/世界/烘焙/区段编码.test.ts（engine 不引 pipeline）。
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

const P = await import('./区段包.ts');
const { mulberry32 } = await import('../core/数学.ts');
const { sectionCells, sectionKey } = await import('./区段.ts');
type SectionId = import('./区段.ts').SectionId;

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

/** 一块里的区段：给每个造几个字节（内容带上区段号，解回来能认） */
const tileOf = (ti: number, tj: number, C: number, pick: (L: number, local: number) => boolean) => {
  const out: { id: SectionId; bytes: Uint8Array }[] = [];
  for (let L = C; L >= 0; L--) // 倒着给：编码要自己排好
    for (let k = 0; k < 4 ** (C - L); k++) if (pick(L, k)) {
      const id = P.sectionAtLocal(ti, tj, C, L, k);
      out.push({ id, bytes: new TextEncoder().encode(sectionKey(id).repeat(1 + (k % 3))) });
    }
  return out;
};
const decodeAll = (parts: Uint8Array[]) => {
  const file = Buffer.concat(parts);
  const index = P.decodeTileHeader(file);
  return { file, index, sections: [...P.tileSections(index)].map((s) => ({ key: sectionKey(s.id), text: new TextDecoder().decode(file.subarray(s.off, s.off + s.len)) })) };
};
const expectRoundTrip = (ti: number, tj: number, C: number, given: ReturnType<typeof tileOf>) => {
  const { file, index, sections } = decodeAll(P.encodeTile(ti, tj, C, given));
  const sorted = [...given].sort((a, b) => a.id.L - b.id.L || P.sectionInTile(a.id, C).local - P.sectionInTile(b.id, C).local);
  expect(sections).toEqual(sorted.map((g) => ({ key: sectionKey(g.id), text: new TextDecoder().decode(g.bytes) })));
  expect([index.ti, index.tj, index.coarsestLevel]).toEqual([ti, tj, C]);
  expect(index.offset[index.offset.length - 1]! + index.length[index.length.length - 1]!).toBe(file.length);
  for (const g of given) expect(P.findInTile(index, g.id)).not.toBeNull();
  return index;
};

describe('区段包', () => {
  it('块文件头是别的格式版本：报清楚（旧包要 anim assets pull 或转码），不当成能读', () => {
    const [head] = P.encodeTile(0, 0, 6, []);
    new DataView(head!.buffer).setUint32(4, 4, true);
    expect(() => P.decodeTileHeader(head!)).toThrow(/格式 4.*anim assets pull/);
    expect(() => P.decodeTileHeader(new Uint8Array(P.tilePrefixLen))).toThrow(/不是块文件/);
  });
  it('格式 5 块文件来回一样：各级全有、位图、列表、没有混着；铺满的块头是格式 4 的一半', () => {
    // 第 0 级稀疏（列表）、第 1 级一半（位图）、第 2 级全有、第 3 级没有、往上全有
    const given = tileOf(-1, 2, 6, (L, k) => (L === 0 ? k % 97 === 5 : L === 1 ? k % 2 === 0 : L !== 3));
    const index = expectRoundTrip(-1, 2, 6, given);
    expect(P.findInTile(index, P.sectionAtLocal(-1, 2, 6, 3, 0))).toBeNull();
    expect(P.findInTile(index, P.sectionAtLocal(-1, 2, 6, 0, 6))).toBeNull();
    expect(() => P.findInTile(index, { L: 6, i: 0, j: 2 })).toThrow(/不在块/);
    const full = P.encodeTile(0, 0, 6, tileOf(0, 0, 6, () => true))[0]!;
    expect(full.length).toBe(24 + 7 + 5461 * 4); // 格式 4 是 16 + 5461 × 8
    expect(() => P.encodeTile(-1, 2, 6, [...given, given[0]!])).toThrow(/重复/);
    expect(() => P.encodeTile(0, 0, 6, given)).toThrow(/不在块/);
  });
  it('稀疏的块（只有最粗一级一个区段）头只有 35 字节；块头截短、头长对不上报损坏', () => {
    const parts = P.encodeTile(3, -4, 6, tileOf(3, -4, 6, (L) => L === 6));
    expect(parts[0]!.length).toBe(35);
    expectRoundTrip(3, -4, 6, tileOf(3, -4, 6, (L) => L === 6));
    expect(() => P.decodeTileHeader(parts[0]!.subarray(0, 30))).toThrow(/损坏/);
    const bad = Uint8Array.from(parts[0]!);
    new DataView(bad.buffer).setUint32(16, 36, true);
    expect(() => P.decodeTileHeader(Buffer.concat([bad, new Uint8Array(8)]))).toThrow(/损坏/);
  });
  it('最粗级 8：块边长 16384 米，区段在块里的位置来回对得上（负的块号也对），块文件来回一样', () => {
    expect(P.tileSizeOf(8)).toBe(16384);
    for (const [ti, tj] of [[0, 0], [-1, 2], [3, -4]] as const)
      for (let L = 0; L <= 8; L++)
        for (let k = 0; k < 4 ** (8 - L); k += 4 ** (8 - L) > 64 ? 997 : 1) expect(P.sectionInTile(P.sectionAtLocal(ti, tj, 8, L, k), 8)).toEqual({ ti, tj, local: k });
    expect(P.sectionInTile({ L: 8, i: -1, j: 0 }, 8)).toEqual({ ti: -1, tj: 0, local: 0 });
    expect(P.sectionInTile({ L: 0, i: -1, j: 0 }, 8)).toEqual({ ti: -1, tj: 0, local: 255 });
    expect(() => P.sectionInTile({ L: 9, i: 0, j: 0 }, 8)).toThrow(/不在 0～8/);
    const index = expectRoundTrip(-2, 1, 8, tileOf(-2, 1, 8, (L, k) => L >= 7 || (L === 2 && k % 5 === 0) || (L === 0 && k === 65535)));
    expect(index.levelStart.length).toBe(10);
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
  it('粗图：编了再解回来一样（行内差分按 16 位回绕）；越界、没数据给 −Infinity；有没有区段看核心范围里有没有数据', () => {
    const heights = new Int16Array([5, -32768, 7, 32767, -32768, -32768]);
    const enc = P.encodePackMaps({ coarse: { cell: 32, x0: -64, y0: 0, nx: 3, ny: 2, height: heights } });
    expect(enc.coarseHeight).toEqual({ cell: 32, x0: -64, y0: 0, nx: 3, ny: 2, at: [0, 12] });
    expect(enc.splittable).toBeUndefined();
    const { coarse: coarseHeight, splittable } = P.decodePackMaps(enc, enc.bytes);
    expect([...coarseHeight.height]).toEqual([...heights]);
    expect(splittable).toBeUndefined();
    expect(P.coarseHeightAt(coarseHeight, -60, 1)).toBe(5);
    expect(P.coarseHeightAt(coarseHeight, -20, 1)).toBe(-Infinity);
    expect(P.coarseHeightAt(coarseHeight, 10, 40)).toBe(-Infinity);
    expect(P.coarseHeightAt(coarseHeight, -40, 40)).toBe(32767);
    expect(P.coarseHeightAt(coarseHeight, 100, 1)).toBe(-Infinity);
    expect(P.hasSection(coarseHeight, { L: 0, i: -1, j: 0 })).toBe(true);
    expect(P.hasSection(coarseHeight, { L: 0, i: -3, j: 0 })).toBe(false);
    expect(P.hasSection(coarseHeight, { L: 0, i: 5, j: 0 })).toBe(false);
    expect(() => P.decodePackMaps(enc, enc.bytes.subarray(0, 10))).toThrow(/只有 10 字节/);
  });
  it('能不能细分的位图（splittable）：存进粗图来回一样；范围里按位查，范围外、没列的级都不能；包里没有这一项 = 不限', () => {
    expect(P.decodeSplittable(undefined)).toBeUndefined();
    // 第 2 级 3 × 2 个区段（i −1～1、j 4～5），能分的是 (−1, 4)、(1, 4)、(0, 5)：位 0、2、4；第 1 级 16 × 1，第 9 位（跨字节）
    const enc = P.encodePackMaps({ coarse: { cell: 64, x0: 0, y0: 0, nx: 1, ny: 1, height: new Int16Array([1]) }, splittable: [null, { i0: 0, j0: 0, ni: 16, nj: 1, bits: Uint8Array.from([0, 0b10]) }, { i0: -1, j0: 4, ni: 3, nj: 2, bits: Uint8Array.from([0b10101]) }] });
    expect(enc.splittable).toEqual([null, { i0: 0, j0: 0, ni: 16, nj: 1, at: [2, 2] }, { i0: -1, j0: 4, ni: 3, nj: 2, at: [4, 1] }]);
    const canSplit = P.decodeSplittable(P.decodePackMaps(enc, enc.bytes).splittable)!;
    const yes = [[-1, 4], [1, 4], [0, 5]], no = [[0, 4], [-1, 5], [1, 5], [-2, 4], [2, 4], [0, 3], [0, 6]];
    for (const [i, j] of yes) expect(canSplit(2, i!, j!)).toBe(true);
    for (const [i, j] of no) expect(canSplit(2, i!, j!)).toBe(false);
    expect(canSplit(3, 0, 5)).toBe(false);
    expect(Array.from({ length: 16 }, (_, i) => canSplit(1, i, 0))).toEqual(Array.from({ length: 16 }, (_, i) => i === 9));
  });
  it('块文件、粗图的字节（金样）', async () => {
    const sha = (b: Uint8Array | Uint8Array[]) => crypto.createHash('sha256').update(Buffer.concat(Array.isArray(b) ? b : [b])).digest('hex');
    const maps = P.encodePackMaps({ coarse: { cell: 32, x0: -64, y0: 0, nx: 2, ny: 1, height: new Int16Array([3, -32768]) }, splittable: [null, { i0: -1, j0: 2, ni: 3, nj: 1, bits: Uint8Array.from([0b101]) }] });
    const json = JSON.stringify({
      tileSha256: sha(P.encodeTile(1, -1, 6, tileOf(1, -1, 6, (L, k) => (L === 0 ? k % 97 === 5 : L === 1 ? k % 2 === 0 : L !== 3)))),
      sparseTileSha256: sha(P.encodeTile(1, -1, 6, tileOf(1, -1, 6, (L) => L === 6))),
      coarsest8TileSha256: sha(P.encodeTile(1, -1, 8, tileOf(1, -1, 8, (L, k) => L >= 7 || (L === 2 && k % 5 === 0)))),
      packMapsSha256: sha(maps.bytes),
      coarseHeightFingerprint: P.coarseHeightFingerprint(P.decodePackMaps(maps, maps.bytes).coarse),
    }, null, 1);
    await expect(json + '\n').toMatchFileSnapshot('./金样/区段包.json');
  });
});
