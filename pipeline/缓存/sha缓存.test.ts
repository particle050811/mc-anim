// sha 缓存：大小、修改时间不变就不重算；存时合并别的进程写的、去掉不在的文件；找重复第二遍全走缓存。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 找重复, 文件sha } from './去重.ts';
import { sha缓存 } from './sha缓存.ts';

let 根 = '';
beforeEach(() => {
  根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-sha缓存-')));
});
afterEach(() => fs.rmSync(根, { recursive: true, force: true }));

const 写 = (名: string, 内容: string, 改于 = Date.parse('2026-10-01T00:00:00Z')) => {
  const f = path.join(根, ...名.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 内容);
  fs.utimesSync(f, new Date(改于), new Date(改于));
  return f;
};
const 缓存文件 = () => path.join(根, 'cache', 'sha缓存.json');

describe('sha缓存', () => {
  it('第二次取同一文件不重算；大小或修改时间变了就重算', async () => {
    const a = 写('cache/母版/x/a.mkv', 'aaaa');
    const c = new sha缓存(缓存文件(), 根);
    expect(await c.算(a)).toBe(await 文件sha(a));
    c.存();
    const c2 = new sha缓存(缓存文件(), 根);
    expect(await c2.算(a)).toBe(await 文件sha(a));
    expect(c2.统计).toMatchObject({ 命中: 1, 现算: 0 });
    写('cache/母版/x/a.mkv', 'bbbb', Date.parse('2026-10-02T00:00:00Z'));
    expect(c2.取(a)).toBeUndefined();
    expect(await c2.算(a)).toBe(await 文件sha(a));
    expect(c2.统计.现算).toBe(1);
  });

  it('键是相对根的 / 路径；存时合并磁盘上别人新写的、去掉文件已经不在的', async () => {
    const a = 写('cache/母版/x/a.mkv', 'aaaa');
    const b = 写('cache/母版/x/b.mkv', 'bbbb');
    const 甲 = new sha缓存(缓存文件(), 根);
    const 乙 = new sha缓存(缓存文件(), 根);
    await 甲.算(a);
    await 乙.算(b);
    甲.存();
    乙.存();
    const j = JSON.parse(fs.readFileSync(缓存文件(), 'utf8')) as { 文件: Record<string, unknown> };
    expect(Object.keys(j.文件).sort()).toEqual(['cache/母版/x/a.mkv', 'cache/母版/x/b.mkv']);
    fs.rmSync(a);
    new sha缓存(缓存文件(), 根).存();
    expect(Object.keys((JSON.parse(fs.readFileSync(缓存文件(), 'utf8')) as { 文件: object }).文件)).toEqual(['cache/母版/x/b.mkv']);
  });

  it('缓存文件坏了就从头算', async () => {
    写('cache/sha缓存.json', '{坏');
    const a = 写('cache/母版/x/a.mkv', 'aaaa');
    const c = new sha缓存(缓存文件(), 根);
    expect(await c.算(a)).toBe(await 文件sha(a));
    expect(c.统计.现算).toBe(1);
  });

  it('找重复：只看不删（账本不存）时第二遍全走 sha 缓存', async () => {
    const 文件们 = ['a', 'b', 'c'].map((n) => {
      const p = 写(`cache/母版/x/${n}.mkv`, 'same');
      return { 路径: p, 大小: 4, 改于: fs.statSync(p).mtimeMs };
    });
    const 键 = (p: string) => path.relative(根, p);
    const c1 = new sha缓存(缓存文件(), 根);
    const 组1 = await 找重复(文件们, { 版本: 1, 文件: {} }, 键, { sha缓存: c1 });
    c1.存();
    expect(c1.统计.现算).toBe(3);
    const c2 = new sha缓存(缓存文件(), 根);
    const 组2 = await 找重复(文件们, { 版本: 1, 文件: {} }, 键, { sha缓存: c2 });
    expect(c2.统计).toMatchObject({ 命中: 3, 现算: 0 });
    expect(组2).toEqual(组1);
  });
});
