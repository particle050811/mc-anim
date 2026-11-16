// 逐格预测压缩：TS 写的编码半边和 WASM 的解码半边要逐条对应，所以这里都走真的 WASM。
// 固定区段的字节存在 金样/区段编码.json：一变，已发布的地形包就读不对了（要升格式版本、全部重转）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSection as decodeReference } from '../../../engine/voxel/区段解码.ts';
import { defaultModel, modelBytes } from '../../../engine/voxel/区段模型.ts';
import { learnModel } from './模型.ts';
import { wasmBase64 } from '../../../engine/voxel/区段解码器.生成.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { VoxelLib } from '../体素库.ts';
import { decoderSource, decoderGeneratedFile, decoderSourceStale } from '../区段解码器.ts';
import { toColumnMajor, encodeSection as encodeReference, encodeVerified, tableLayout } from './区段编码.ts';
import { decodeSectionFormat2 as decodeFormat2Section } from './格式2解码.ts';
import { decodeSectionFormat3 } from './格式3解码.ts';
import { encodeFormat1Section, decodeFormat1Section } from './读区段.ts';

const sectionModel = defaultModel();
const decodeSection = (raw: Uint8Array, id: { L: number; i: number; j: number }) => decodeReference(raw, id, sectionModel);
const voxelLib = { sectionDecoder: { decodeSection: decodeReference } } as unknown as VoxelLib;
const encodeSection = (d: Parameters<typeof encodeReference>[0]) => encodeReference(d, sectionModel);
const side = 66, columnCount = side * side;
const legacySide = 34; // 格式 1～3 的区段每边 34 列，转码时读

const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

/** 噪声区段：每列若干段，相邻段可能同号（规范化之后才合并，不合并也要解得对） */
const makeNoiseSection = (seed: number, L = 2, nz = 20, paletteSize = 4, edge = side): SectionData => {
  const r = rng(seed);
  const runCounts = new Uint16Array(edge * edge);
  const ids: number[] = [], runLengths: number[] = [];
  for (let c = 0; c < edge * edge; c++) {
    let remain = nz, n = 0;
    while (remain > 0) {
      const l = Math.min(remain, 1 + Math.floor(r() * 8));
      ids.push(Math.floor(r() * paletteSize));
      runLengths.push(l);
      remain -= l;
      n++;
    }
    runCounts[c] = n;
  }
  const palette = new Uint16Array(2 * paletteSize);
  for (let i = 0; i < paletteSize; i++) palette.set([i, i % 3 ? i : 65535], 2 * i);
  return { L, i: -3, j: 7, kBottom: -5, nz, palette, runCounts, paletteIndex: Uint16Array.from(ids), runLengths: Uint16Array.from(runLengths) };
};

/** 像真地形：一片地表，下面石头，上面空气，高度缓变；整列相同、跳过都走得到 */
const terrainSectionData = (L: number, nz: number, edge = side): SectionData => {
  const runCounts = new Uint16Array(edge * edge).fill(3);
  const ids: number[] = [], runLengths: number[] = [];
  for (let c = 0; c < edge * edge; c++) {
    const height = Math.min(nz - 2, 2 + (((c % edge) >> 3) + ((c / edge) >> 4)));
    ids.push(0, 2, 1);
    runLengths.push(nz - height - 1, 1, height);
  }
  return { L, i: 0, j: 0, kBottom: 0, nz, palette: Uint16Array.from([0, 65535, 1, 65535, 2, 7]), runCounts, paletteIndex: Uint16Array.from(ids), runLengths: Uint16Array.from(runLengths) };
};

const sameCells = (a: SectionData, b: SectionData) => {
  expect([b.L, b.i, b.j, b.kBottom, b.nz]).toEqual([a.L, a.i, a.j, a.kBottom, a.nz]);
  expect([...b.palette]).toEqual([...a.palette]);
  expect(Buffer.compare(Buffer.from(toColumnMajor(a).buffer), Buffer.from(toColumnMajor(b).buffer))).toBe(0);
};

describe('逐格预测压缩', () => {
  it('编了解回来逐格一样：各级、各种高度、各种色板大小（色板号的位数边界）', () => {
    for (const [L, nz, P] of [[0, 1, 2], [0, 40, 3], [1, 17, 4], [2, 64, 5], [3, 9, 16], [6, 300, 17], [0, 20, 257]] as const) {
      const d = makeNoiseSection(L + nz, L, nz, P);
      sameCells(d, decodeSection(encodeVerified(voxelLib, d, sectionModel), d));
    }
    for (const L of [0, 2, 6]) {
      const d = terrainSectionData(L, 64);
      const packed = encodeVerified(voxelLib, d, sectionModel);
      sameCells(d, decodeSection(packed, d));
      expect(packed.length).toBeLessThan(600); // 整列相同、跳过确实在起作用
    }
  });
  it('解出来的行程是规范的：一列的段正好盖满 nz，相邻段不同号，四个数组同一块缓冲', () => {
    const d = makeNoiseSection(7);
    const x = decodeSection(encodeSection(d), d);
    let r = 0;
    for (let c = 0; c < columnCount; c++) {
      let sum = 0;
      for (let e = r + x.runCounts[c]!; r < e; r++) {
        sum += x.runLengths[r]!;
        if (sum < d.nz && r + 1 < e) expect(x.paletteIndex[r + 1]).not.toBe(x.paletteIndex[r]);
      }
      expect(sum).toBe(d.nz);
    }
    expect(new Set([x.palette.buffer, x.runCounts.buffer, x.paletteIndex.buffer, x.runLengths.buffer]).size).toBe(1);
  });
  it('nz 0、只有空气的区段；一个区段连解两次（实例内存复用）、输入不从 0 偏移也行', () => {
    const emptySection: SectionData = { L: 0, i: 1, j: 2, kBottom: 3, nz: 0, palette: Uint16Array.from([0, 65535]), runCounts: new Uint16Array(columnCount), paletteIndex: new Uint16Array(0), runLengths: new Uint16Array(0) };
    sameCells(emptySection, decodeSection(encodeSection(emptySection), emptySection));
    const airSection: SectionData = { ...emptySection, nz: 50, runCounts: new Uint16Array(columnCount).fill(1), paletteIndex: new Uint16Array(columnCount), runLengths: new Uint16Array(columnCount).fill(50) };
    sameCells(airSection, decodeSection(encodeSection(airSection), airSection));
    const d = makeNoiseSection(3), bytes = encodeSection(d);
    const misaligned = new Uint8Array(bytes.length + 3);
    misaligned.set(bytes, 3);
    sameCells(d, decodeSection(misaligned.subarray(3), d));
    sameCells(d, decodeSection(bytes, d));
  });
  it('压缩结果和先解过别的、大的区段无关（内存里的残留不影响）', () => {
    const small = makeNoiseSection(9, 0, 8, 3), bytes = encodeSection(small);
    const a = toColumnMajor(decodeSection(bytes, small));
    const noiseSection = makeNoiseSection(10, 0, 500, 200);
    decodeSection(encodeSection(noiseSection), noiseSection);
    expect(toColumnMajor(decodeSection(bytes, small))).toEqual(a);
  });
  it('截断、多字节：报错，不静默出错', () => {
    const d = makeNoiseSection(5), bytes = encodeSection(d);
    expect(() => decodeSection(bytes.subarray(0, bytes.length - 20), d)).toThrow(/编码流坏了/);
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes);
    expect(() => decodeSection(padded, d)).toThrow(/编码流坏了/);
    expect(() => decodeSection(new Uint8Array(5), d)).toThrow(/读不出/);
  });
  it('放不进格式的区段：报错', () => {
    expect(() => encodeSection({ ...makeNoiseSection(1), kBottom: 40000 })).toThrow(/放不进/);
  });
  it('格式 1 的区段（转码的来源）解得对', () => {
    const d = makeNoiseSection(11, 2, 20, 4, legacySide);
    const x = decodeFormat1Section(encodeFormat1Section(d));
    expect([x.L, x.i, x.j, x.kBottom, x.nz]).toEqual([d.L, d.i, d.j, d.kBottom, d.nz]);
    expect([...x.paletteIndex]).toEqual([...d.paletteIndex]);
  });
  it('固定区段的字节、WASM 和模型表（金样）；生成文件和源码对得上', async () => {
    const a = encodeSection(makeNoiseSection(42)), b = encodeSection(terrainSectionData(1, 64));
    const json = JSON.stringify(
      {
        noise: { length: a.length, sha256: crypto.createHash('sha256').update(a).digest('hex') },
        terrain: { length: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') },
        wasm: crypto.createHash('sha256').update(Buffer.from(wasmBase64, 'base64')).digest('hex'),
        modelTable: crypto.createHash('sha256').update(modelBytes(sectionModel)).digest('hex'),
      },
      null,
      1,
    );
    await expect(json + '\n').toMatchFileSnapshot('./金样/区段编码.json');
    expect(sectionModel.init.length).toBe(tableLayout.grandTotal);
    expect(decoderSourceStale(fs.readFileSync(decoderGeneratedFile(), 'utf8'), fs.readFileSync(decoderSource(), 'utf8'))).toBe(false);
  });
});

  it('训练表确定、未见状态回退，多模型交替解码无状态串扰', () => {
    const d = terrainSectionData(0, 64), a = learnModel(() => [d]), b = learnModel(() => [makeNoiseSection(1)]);
    expect(modelBytes(a)).toEqual(modelBytes(learnModel(() => [d])));
    expect(a.map[65535]).toBe(31);
    for (const m of [a, b, a]) for (const x of [d, makeNoiseSection(3), makeNoiseSection(7, 6, 1, 1)]) sameCells(x, decodeReference(encodeReference(x, m), x, m));
  });

it('格式 2 冻结字节、格式 3 冻结解码器仍能由转码工具读（34 列）', () => {
  const { base64 } = JSON.parse(fs.readFileSync(new URL('./金样/格式2区段.json', import.meta.url), 'utf8'));
  const d = terrainSectionData(1, 64, legacySide), x = decodeFormat2Section(Buffer.from(base64, 'base64'), d), m = learnModel(() => [x]);
  sameCells(d, x);
  sameCells(d, decodeSectionFormat3(encodeReference(x, m), d, m));
  const n = makeNoiseSection(12, 0, 30, 9, legacySide);
  sameCells(n, decodeSectionFormat3(encodeReference(n, m), n, m));
});
