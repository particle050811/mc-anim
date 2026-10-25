import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 字节附件名, 地形附件名, 比对发布锁, 读随发布表, type 应发 } from './发布.ts';
import { 附件缺, type 发布锁 } from './发布锁.ts';

const 表 = { 仓库: 'a/b', 标签: 'assets-v1', 段: ['6'] };
const s1 = '1'.repeat(64);
const s2 = '2'.repeat(64);
const 应: 应发 = { 字节: [s1, s2], 地形: [{ 包: '主世界', 版本: 'abc123' }], 段数: 1, 私有: [], 问题: [] };
const 锁 = (o: Partial<发布锁> = {}): 发布锁 => ({
  仓库: 'a/b',
  标签: 'assets-v1',
  附件: [
    { 名: 字节附件名([s1, s2]), sha256: 'x', 大小: 1, 字节: [s1, s2] },
    { 名: 地形附件名('abc123'), sha256: 'y', 大小: 1, 地形: { 包: '主世界', 版本: 'abc123' } },
  ],
  ...o,
});

describe('挂 Release 发字节', () => {
  it('随发布.toml 要仓库、ASCII 标签、非空段', () => {
    expect(读随发布表('"仓库" = "a/b"\n"标签" = "assets-v1"\n"段" = ["6", "核对"]')).toEqual({ 仓库: 'a/b', 标签: 'assets-v1', 段: ['6', '核对'] });
    expect(() => 读随发布表('"仓库" = "a"\n"标签" = "v1"\n"段" = ["6"]')).toThrow();
    expect(() => 读随发布表('"仓库" = "a/b"\n"标签" = "版本一"\n"段" = ["6"]')).toThrow();
    expect(() => 读随发布表('"仓库" = "a/b"\n"标签" = "v1"\n"段" = []')).toThrow();
  });

  it('附件名只用 ASCII，字节附件名跟着内容变', () => {
    expect(字节附件名([s1, s2])).toMatch(/^bytes-[0-9a-f]{12}\.tar$/);
    expect(字节附件名([s1])).not.toBe(字节附件名([s1, s2]));
    expect(地形附件名('abc123')).toBe('terrain-abc123.tar');
  });

  it('发布锁和现算的一致就没问题；少字节、换了地形版本、换了标签都报', () => {
    expect(比对发布锁(锁(), 应, 表)).toEqual([]);
    expect(比对发布锁(undefined, 应, 表)).toEqual(['没有 发布锁.json']);
    expect(比对发布锁(锁(), { ...应, 字节: [s1, s2, '3'.repeat(64)] }, 表).join()).toMatch(/少 1 件字节/);
    expect(比对发布锁(锁(), { ...应, 地形: [{ 包: '主世界', 版本: 'def456' }] }, 表).join()).toMatch(/terrain-def456\.tar/);
    expect(比对发布锁(锁({ 标签: 'assets-v0' }), 应, 表).join()).toMatch(/assets-v0/);
  });

  it('附件缺：数一下数据根还缺的字节、地形包目录在不在', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-发布-'));
    try {
      const [字节, 地形] = 锁().附件 as [发布锁['附件'][number], 发布锁['附件'][number]];
      expect(附件缺(字节, 根)).toBe(2);
      fs.mkdirSync(path.join(根, 'store', '11'), { recursive: true });
      fs.writeFileSync(path.join(根, 'store', '11', s1), '');
      expect(附件缺(字节, 根)).toBe(1);
      expect(附件缺(地形, 根)).toBe(1);
      fs.mkdirSync(path.join(根, 'terrain', '主世界', 'abc123'), { recursive: true });
      expect(附件缺(地形, 根)).toBe(0);
    } finally {
      fs.rmSync(根, { recursive: true, force: true });
    }
  });
});
