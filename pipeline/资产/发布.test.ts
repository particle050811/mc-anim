import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 字节附件名, 地形附件名, 拉发布, 比对发布锁, 读随发布表, type 应发 } from './发布.ts';
import { 附件缺, type 发布锁 } from './发布锁.ts';

const 表 = { 仓库: 'a/b', 标签: 'assets-v1', 段: ['6'] };
const s1 = '1'.repeat(64);
const s2 = '2'.repeat(64);
const 应: 应发 = { 字节: [s1, s2], 私有库字节: [], 地形: [{ 包: '主世界', 版本: 'abc123' }], 段数: 1, 私有: [], 问题: [] };
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
    // 没有 私有/ 库字节时名字和以前一样，旧发布锁照用
    expect(字节附件名([s1, s2], [])).toBe(字节附件名([s1, s2]));
    expect(字节附件名([s1], [s2])).not.toBe(字节附件名([s1, s2]));
  });

  it('发布锁和现算的一致就没问题；少字节、换了地形版本、换了标签都报', () => {
    expect(比对发布锁(锁(), 应, 表)).toEqual([]);
    expect(比对发布锁(undefined, 应, 表)).toEqual(['没有 发布锁.json']);
    expect(比对发布锁(锁(), { ...应, 字节: [s1, s2, '3'.repeat(64)] }, 表).join()).toMatch(/少 1 件字节/);
    expect(比对发布锁(锁(), { ...应, 地形: [{ 包: '主世界', 版本: 'def456' }] }, 表).join()).toMatch(/terrain-def456\.tar/);
    expect(比对发布锁(锁({ 标签: 'assets-v0' }), 应, 表).join()).toMatch(/assets-v0/);
    expect(比对发布锁(锁(), { ...应, 私有库字节: ['3'.repeat(64)] }, 表).join()).toMatch(/少 1 件私有\/ 库的字节/);
  });

  it('附件缺：数一下数据根还缺的字节、地形包目录在不在', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-发布-'));
    try {
      const [字节, 地形] = 锁().附件 as [发布锁['附件'][number], 发布锁['附件'][number]];
      expect(附件缺(字节, 根)).toBe(2);
      fs.mkdirSync(path.join(根, 'store', '11'), { recursive: true });
      fs.writeFileSync(path.join(根, 'store', '11', s1), '');
      expect(附件缺(字节, 根)).toBe(1);
      const 带私有 = { ...字节, 私有库字节: ['3'.repeat(64)] };
      expect(附件缺(带私有, 根)).toBe(2);
      fs.mkdirSync(path.join(根, '私有', '33'), { recursive: true });
      fs.writeFileSync(path.join(根, '私有', '33', '3'.repeat(64)), '');
      expect(附件缺(带私有, 根)).toBe(1);
      expect(附件缺(地形, 根)).toBe(1);
      fs.mkdirSync(path.join(根, 'terrain', '主世界', 'abc123'), { recursive: true });
      expect(附件缺(地形, 根)).toBe(0);
    } finally {
      fs.rmSync(根, { recursive: true, force: true });
    }
  });
  it('pull：发布锁比 Release 新（附件 404）马上报清楚，不重试几分钟，也不写进数据根', async () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), '发布-'));
    const 请求: string[] = [];
    const 服 = http.createServer((q, r) => {
      请求.push(`${q.method} ${q.url}`);
      r.statusCode = 404;
      r.end();
    });
    await new Promise<void>((好) => 服.listen(0, '127.0.0.1', 好));
    const 口 = (服.address() as { port: number }).port;
    const 原 = process.env.NO_PROXY;
    process.env.NO_PROXY = '127.0.0.1';
    try {
      await expect(拉发布(锁({ 附件: [锁().附件[1]!] }), 根, `http://127.0.0.1:${口}`)).rejects.toThrow(/Release assets-v1 上没有 terrain-abc123\.tar.*anim assets pack --上传/);
      expect(请求).toEqual(['HEAD /a/b/releases/download/assets-v1/terrain-abc123.tar']);
      expect(fs.existsSync(path.join(根, 'terrain'))).toBe(false);
    } finally {
      if (原 === undefined) delete process.env.NO_PROXY;
      else process.env.NO_PROXY = 原;
      服.close();
      fs.rmSync(根, { recursive: true, force: true });
    }
  });
  it('pull：同一个 tar 里 store/ 和 私有/ 库的字节各放回各自的库', async () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), '发布-'));
    const 源 = fs.mkdtempSync(path.join(os.tmpdir(), '发布源-'));
    const 写 = (库: string, 内容: string) => {
      const s = crypto.createHash('sha256').update(内容).digest('hex');
      fs.mkdirSync(path.join(源, 库, s.slice(0, 2)), { recursive: true });
      fs.writeFileSync(path.join(源, 库, s.slice(0, 2), s), 内容);
      return s;
    };
    const 公 = 写('store', '公开的');
    const 私 = 写('私有', '以前私有的歌');
    const tar = path.join(源, 'x.tar');
    execFileSync('tar', ['-cf', tar, '-C', 源, `store/${公.slice(0, 2)}/${公}`, `私有/${私.slice(0, 2)}/${私}`]);
    const 字节 = fs.readFileSync(tar);
    const 名 = 字节附件名([公], [私]);
    const 服 = http.createServer((q, r) => {
      r.setHeader('Content-Length', 字节.length);
      r.end(q.method === 'HEAD' ? undefined : 字节);
    });
    await new Promise<void>((好) => 服.listen(0, '127.0.0.1', 好));
    const 口 = (服.address() as { port: number }).port;
    const 原 = process.env.NO_PROXY;
    process.env.NO_PROXY = '127.0.0.1';
    try {
      const sha256 = crypto.createHash('sha256').update(字节).digest('hex');
      await 拉发布({ 仓库: 'a/b', 标签: 'assets-v1', 附件: [{ 名, sha256, 大小: 字节.length, 字节: [公], 私有库字节: [私] }] }, 根, `http://127.0.0.1:${口}`);
      expect(fs.readFileSync(path.join(根, 'store', 公.slice(0, 2), 公), 'utf8')).toBe('公开的');
      expect(fs.readFileSync(path.join(根, '私有', 私.slice(0, 2), 私), 'utf8')).toBe('以前私有的歌');
      expect(fs.existsSync(path.join(根, 'store', 私.slice(0, 2), 私))).toBe(false);
    } finally {
      if (原 === undefined) delete process.env.NO_PROXY;
      else process.env.NO_PROXY = 原;
      服.close();
      fs.rmSync(根, { recursive: true, force: true });
      fs.rmSync(源, { recursive: true, force: true });
    }
  });
});
