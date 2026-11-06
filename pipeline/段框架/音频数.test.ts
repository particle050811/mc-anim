import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { 锁条目 } from '../资产/资产锁.ts';
import { 取音频数, 已知音频数 } from './音频数.ts';

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
