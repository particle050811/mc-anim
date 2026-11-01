// 逐格预测压缩：TS 写的编码半边和 WASM 的解码半边要逐条对应，所以这里都走真的 WASM。
// 固定区段的字节存在 金样/区段编码.json：一变，已发布的地形包就读不对了（要升格式版本、全部重转）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { 解区段 as 解原 } from '../../../engine/voxel/区段解码.ts';
import { 默认模型, 模型字节 } from '../../../engine/voxel/区段模型.ts';
import { 学模型 } from './模型.ts';
import { wasmBase64 } from '../../../engine/voxel/区段解码器.生成.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { 体素库 } from '../体素库.ts';
import { 解码器源码, 解码器生成文件, 解码器源码过期 } from '../区段解码器.ts';
import { 到列优先, 压区段 as 压原, 压并核对, 表布局 } from './区段编码.ts';
import { 解区段 as 解格式2区段 } from './格式2解码.ts';
import { 编格式1区段, 解格式1区段 } from './读区段.ts';

const 模型 = 默认模型();
const 解区段 = (raw: Uint8Array, id: { L: number; i: number; j: number }) => 解原(raw, id, 模型);
const 库 = { 区段解码: { 解区段: 解原 } } as unknown as 体素库;
const 压区段 = (d: Parameters<typeof 压原>[0]) => 压原(d, 模型);
const 列数 = 34 * 34;

const 随机 = (种: number) => () => (种 = (种 * 1664525 + 1013904223) >>> 0) / 2 ** 32;

/** 噪声区段：每列若干段，相邻段可能同号（规范化之后才合并，不合并也要解得对） */
const 噪声 = (种: number, L = 2, nz = 20, 色板项 = 4): SectionData => {
  const r = 随机(种);
  const runCounts = new Uint16Array(列数);
  const 号: number[] = [], 长: number[] = [];
  for (let c = 0; c < 列数; c++) {
    let 剩 = nz, n = 0;
    while (剩 > 0) {
      const l = Math.min(剩, 1 + Math.floor(r() * 8));
      号.push(Math.floor(r() * 色板项));
      长.push(l);
      剩 -= l;
      n++;
    }
    runCounts[c] = n;
  }
  const palette = new Uint16Array(2 * 色板项);
  for (let i = 0; i < 色板项; i++) palette.set([i, i % 3 ? i : 65535], 2 * i);
  return { L, i: -3, j: 7, kBottom: -5, nz, palette, runCounts, paletteIndex: Uint16Array.from(号), runLengths: Uint16Array.from(长) };
};

/** 像真地形：一片地表，下面石头，上面空气，高度缓变；整列相同、跳过都走得到 */
const 地形 = (L: number, nz: number): SectionData => {
  const runCounts = new Uint16Array(列数).fill(3);
  const 号: number[] = [], 长: number[] = [];
  for (let c = 0; c < 列数; c++) {
    const 高 = Math.min(nz - 2, 2 + (((c % 34) >> 3) + ((c / 34) >> 4)));
    号.push(0, 2, 1);
    长.push(nz - 高 - 1, 1, 高);
  }
  return { L, i: 0, j: 0, kBottom: 0, nz, palette: Uint16Array.from([0, 65535, 1, 65535, 2, 7]), runCounts, paletteIndex: Uint16Array.from(号), runLengths: Uint16Array.from(长) };
};

const 同格 = (a: SectionData, b: SectionData) => {
  expect([b.L, b.i, b.j, b.kBottom, b.nz]).toEqual([a.L, a.i, a.j, a.kBottom, a.nz]);
  expect([...b.palette]).toEqual([...a.palette]);
  expect(Buffer.compare(Buffer.from(到列优先(a).buffer), Buffer.from(到列优先(b).buffer))).toBe(0);
};

describe('逐格预测压缩', () => {
  it('编了解回来逐格一样：各级、各种高度、各种色板大小（色板号的位数边界）', () => {
    for (const [L, nz, P] of [[0, 1, 2], [0, 40, 3], [1, 17, 4], [2, 64, 5], [3, 9, 16], [6, 300, 17], [0, 20, 257]] as const) {
      const d = 噪声(L + nz, L, nz, P);
      同格(d, 解区段(压并核对(库, d, 模型), d));
    }
    for (const L of [0, 2, 6]) {
      const d = 地形(L, 64);
      const 压 = 压并核对(库, d, 模型);
      同格(d, 解区段(压, d));
      expect(压.length).toBeLessThan(600); // 整列相同、跳过确实在起作用
    }
  });
  it('解出来的行程是规范的：一列的段正好盖满 nz，相邻段不同号，四个数组同一块缓冲', () => {
    const d = 噪声(7);
    const x = 解区段(压区段(d), d);
    let r = 0;
    for (let c = 0; c < 列数; c++) {
      let 和 = 0;
      for (let e = r + x.runCounts[c]!; r < e; r++) {
        和 += x.runLengths[r]!;
        if (和 < d.nz && r + 1 < e) expect(x.paletteIndex[r + 1]).not.toBe(x.paletteIndex[r]);
      }
      expect(和).toBe(d.nz);
    }
    expect(new Set([x.palette.buffer, x.runCounts.buffer, x.paletteIndex.buffer, x.runLengths.buffer]).size).toBe(1);
  });
  it('nz 0、只有空气的区段；一个区段连解两次（实例内存复用）、输入不从 0 偏移也行', () => {
    const 空: SectionData = { L: 0, i: 1, j: 2, kBottom: 3, nz: 0, palette: Uint16Array.from([0, 65535]), runCounts: new Uint16Array(列数), paletteIndex: new Uint16Array(0), runLengths: new Uint16Array(0) };
    同格(空, 解区段(压区段(空), 空));
    const 气: SectionData = { ...空, nz: 50, runCounts: new Uint16Array(列数).fill(1), paletteIndex: new Uint16Array(列数), runLengths: new Uint16Array(列数).fill(50) };
    同格(气, 解区段(压区段(气), 气));
    const d = 噪声(3), 字节 = 压区段(d);
    const 错位 = new Uint8Array(字节.length + 3);
    错位.set(字节, 3);
    同格(d, 解区段(错位.subarray(3), d));
    同格(d, 解区段(字节, d));
  });
  it('压缩结果和先解过别的、大的区段无关（内存里的残留不影响）', () => {
    const 小 = 噪声(9, 0, 8, 3), 字节 = 压区段(小);
    const a = 到列优先(解区段(字节, 小));
    const 大 = 噪声(10, 0, 500, 200);
    解区段(压区段(大), 大);
    expect(到列优先(解区段(字节, 小))).toEqual(a);
  });
  it('截断、多字节：报错，不静默出错', () => {
    const d = 噪声(5), 字节 = 压区段(d);
    expect(() => 解区段(字节.subarray(0, 字节.length - 20), d)).toThrow(/编码流坏了/);
    const 多 = new Uint8Array(字节.length + 1);
    多.set(字节);
    expect(() => 解区段(多, d)).toThrow(/编码流坏了/);
    expect(() => 解区段(new Uint8Array(5), d)).toThrow(/读不出/);
  });
  it('放不进格式的区段：报错', () => {
    expect(() => 压区段({ ...噪声(1), kBottom: 40000 })).toThrow(/放不进/);
  });
  it('格式 1 的区段（转码的来源）解得对', () => {
    const d = 噪声(11);
    const x = 解格式1区段(编格式1区段(d));
    expect([x.L, x.i, x.j, x.kBottom, x.nz]).toEqual([d.L, d.i, d.j, d.kBottom, d.nz]);
    expect([...x.paletteIndex]).toEqual([...d.paletteIndex]);
  });
  it('固定区段的字节、WASM 和模型表（金样）；生成文件和源码对得上', async () => {
    const a = 压区段(噪声(42)), b = 压区段(地形(1, 64));
    const 文 = JSON.stringify(
      {
        噪声: { 长: a.length, sha256: crypto.createHash('sha256').update(a).digest('hex') },
        地形: { 长: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') },
        wasm: crypto.createHash('sha256').update(Buffer.from(wasmBase64, 'base64')).digest('hex'),
        模型表: crypto.createHash('sha256').update(模型字节(模型)).digest('hex'),
      },
      null,
      1,
    );
    await expect(文 + '\n').toMatchFileSnapshot('./金样/区段编码.json');
    expect(模型.init.length).toBe(表布局.总);
    expect(解码器源码过期(fs.readFileSync(解码器生成文件(), 'utf8'), fs.readFileSync(解码器源码(), 'utf8'))).toBe(false);
  });
});

  it('训练表确定、未见状态回退，多模型交替解码无状态串扰', () => {
    const d = 地形(0, 64), a = 学模型(() => [d]), b = 学模型(() => [噪声(1)]);
    expect(模型字节(a)).toEqual(模型字节(学模型(() => [d])));
    expect(a.map[65535]).toBe(31);
    for (const m of [a, b, a]) for (const x of [d, 噪声(3), 噪声(7, 6, 1, 1)]) 同格(x, 解原(压原(x, m), x, m));
  });

it('格式 2 冻结字节仍能由转码工具读，格式 3 编解码逐格相同', () => {
  const { base64 } = JSON.parse(fs.readFileSync(new URL('./金样/格式2区段.json', import.meta.url), 'utf8'));
  const d = 地形(1, 64), x = 解格式2区段(Buffer.from(base64, 'base64'), d), m = 学模型(() => [x]);
  同格(d, x);
  同格(d, 解原(压原(x, m), d, m));
});
