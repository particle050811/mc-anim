import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { 锁条目 } from '../资产/资产锁.ts';
import { 取音频数, 已知音频数, 解析量音 } from './音频数.ts';

// ffmpeg -af ebur128=peak=sample 末尾的 Summary（中间逐帧的行里也有 I:，只认 Summary 之后的）
const stderr = `[Parsed_ebur128_0 @ 0x1] t: 0.1  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -18.37 LUFS
    Threshold: -28.4 LUFS

  Loudness range:
    LRA:         2.1 LU

  Sample peak:
    Peak:       -3.456 dBFS
`;

describe('解析量音', () => {
  it('取 Summary 的响度、峰值（两位小数），时长六位', () => {
    expect(解析量音(stderr, '1.6250114\n')).toEqual({ 时长: 1.625011, 峰值: -3.46, 响度: -18.37 });
  });
  it('静音：峰值、响度是 -inf 就不给；时长不对报错', () => {
    expect(解析量音('Summary:\n I: -inf LUFS\n Peak: -inf dBFS\n', '2')).toEqual({ 时长: 2 });
    expect(() => 解析量音(stderr, 'N/A')).toThrow(/时长/);
  });
});

describe('取音频数', () => {
  let 根: string;
  beforeEach(() => {
    根 = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-音频数-'));
  });
  afterEach(() => fs.rmSync(根, { recursive: true, force: true }));
  const 条目: 锁条目 = { sha256: 'd'.repeat(64), 大小: 3, 库: 'store', 后缀: '.ogg' };

  it('锁里有数用锁的，不量', () => {
    const e = { ...条目, 时长: 3, 峰值: -1 } as 锁条目;
    expect(取音频数('x/y', e, 根, () => { throw new Error('不该量'); })).toEqual({ 时长: 3, 峰值: -1 });
  });
  it('锁里没有：量一次写缓存，第二次读缓存；字节不在报错', () => {
    expect(() => 取音频数('x/y', 条目, 根)).toThrow(/字节不在数据根/);
    const 字节 = path.join(根, 'store', 'dd', 'd'.repeat(64));
    fs.mkdirSync(path.dirname(字节), { recursive: true });
    fs.writeFileSync(字节, 'abc');
    let 次 = 0;
    const 量 = () => (次++, { 时长: 1.5, 峰值: -2 });
    expect(取音频数('x/y', 条目, 根, 量)).toEqual({ 时长: 1.5, 峰值: -2 });
    expect(取音频数('x/y', 条目, 根, 量)).toEqual({ 时长: 1.5, 峰值: -2 });
    expect(次).toBe(1);
    expect(已知音频数(条目, 根)).toEqual({ 时长: 1.5, 峰值: -2 });
    expect(已知音频数(条目)).toBeUndefined();
    expect(() => 取音频数('x/z', undefined, 根)).toThrow(/资产锁里没有/);
  });
});
