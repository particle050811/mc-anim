// 去重：同大小先比内容、硬链接本来就共享、账本记住克隆过的；克隆本身只在 Mac 上测。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 克隆替换, 可省, 执行去重, 找重复, 读账, 写账, 能克隆, 文件sha, type 去重文件 } from './去重.ts';

let 根 = '';
beforeEach(() => {
  根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-去重样例-')));
});
afterEach(() => fs.rmSync(根, { recursive: true, force: true }));

const 造 = (名: string, 内容: string | Buffer, 几天前 = 0): 去重文件 => {
  const f = path.join(根, 名);
  fs.writeFileSync(f, 内容);
  const t = Date.now() - 几天前 * 86_400_000;
  fs.utimesSync(f, new Date(t), new Date(t));
  const st = fs.statSync(f);
  return { 路径: f, 大小: st.size, 改于: st.mtimeMs };
};
const 文件 = (f: string): 去重文件 => {
  const st = fs.statSync(f);
  return { 路径: f, 大小: st.size, 改于: st.mtimeMs };
};
const 键 = (p: string) => path.relative(根, p);

describe('去重', () => {
  it('大小相同、内容不同的不算重复；内容相同的挑最早的当源', async () => {
    const a = 造('a.mkv', 'x'.repeat(1000), 3);
    const b = 造('b.mkv', 'x'.repeat(1000), 1);
    const c = 造('c.mkv', 'y'.repeat(1000), 2);
    const d = 造('d.mkv', 'x'.repeat(999), 2);
    const 账 = 读账(path.join(根, '没有.json'));
    const 组 = await 找重复([a, b, c, d], 账, 键);
    expect(组).toHaveLength(1);
    expect(组[0]).toMatchObject({ 源: a.路径, 待克隆: [b.路径], 省: 1000 });
    expect(可省(组)).toBe(1000);
    // d 大小不同，没算 sha
    expect(Object.keys(账.文件).sort()).toEqual(['a.mkv', 'b.mkv', 'c.mkv']);
    expect(账.文件['a.mkv']!.sha).toBe(await 文件sha(a.路径));
  });

  it('硬链接本来就共享：同一 inode 不算重复；别的 inode 有计划外的硬链接就不动', async () => {
    const a = 造('a.mkv', 'x'.repeat(1000), 3);
    fs.linkSync(a.路径, path.join(根, 'a2.mkv'));
    const 账 = 读账('');
    expect(await 找重复([a, 文件(path.join(根, 'a2.mkv'))], 账, 键)).toEqual([]);
    const b = 造('b.mkv', 'x'.repeat(1000), 1);
    fs.linkSync(b.路径, path.join(根, '别处的b.mkv'));
    // b 还有一个名字不在这批里：换掉 b.mkv 也腾不出空间
    const 组 = await 找重复([a, 文件(path.join(根, 'a2.mkv')), b], 账, 键);
    expect(可省(组)).toBe(0);
    // 那个名字这次也要删（只看不删时扣掉）：就算得上
    const 另删 = new Map([[`${fs.statSync(b.路径).dev}-${fs.statSync(b.路径).ino}`, 1]]);
    expect(可省(await 找重复([a, 文件(path.join(根, 'a2.mkv')), b], 账, 键, { 另删 }))).toBe(1000);
  });

  it('账本对得上的不重算 sha；改过的重算', async () => {
    const a = 造('a.mkv', 'x'.repeat(10), 3);
    const b = 造('b.mkv', 'z'.repeat(10), 3);
    const 账 = 读账('');
    await 找重复([a, b], 账, 键);
    账.文件['a.mkv']!.sha = '假的'; // 对得上就照账本用
    const 组 = await 找重复([a, b], 账, 键);
    expect(组).toEqual([]);
    expect(账.文件['a.mkv']!.sha).toBe('假的');
    fs.writeFileSync(a.路径, 'z'.repeat(10));
    const 组2 = await 找重复([文件(a.路径), b], 账, 键);
    expect(组2).toHaveLength(1);
    const f = path.join(根, '账.json');
    写账(f, 账);
    expect(读账(f)).toEqual(账);
    fs.writeFileSync(f, '坏了');
    expect(读账(f)).toEqual({ 版本: 1, 文件: {} });
  });

  it.runIf(能克隆())('Mac：克隆后内容、修改时间不变，账本记克隆自，重跑不再算省', async () => {
    const a = 造('a.mkv', Buffer.alloc(1 << 16, 7), 3);
    const b = 造('b.mkv', Buffer.alloc(1 << 16, 7), 1);
    const 账 = 读账('');
    const 组 = await 找重复([a, b], 账, 键);
    const 前 = fs.statSync(b.路径);
    const r = 执行去重(组, 账, 键);
    expect(r).toEqual({ 克隆数: 1, 省: 1 << 16, 失败: [] });
    const 后 = fs.statSync(b.路径);
    expect(后.mtimeMs).toBe(前.mtimeMs);
    expect(后.ino).not.toBe(前.ino);
    expect(fs.readFileSync(b.路径).equals(fs.readFileSync(a.路径))).toBe(true);
    expect(账.文件['b.mkv']!.克隆自).toBe('a.mkv');
    const 再 = await 找重复([a, 文件(b.路径)], 账, 键);
    expect(可省(再)).toBe(0);
    expect(再[0]!.已共享).toEqual([b.路径]);
    // 克隆出来的是独立文件：改源不影响它
    fs.writeFileSync(a.路径, 'x');
    expect(fs.statSync(b.路径).size).toBe(1 << 16);
  });

  it.runIf(能克隆())('克隆失败不留临时文件', () => {
    const a = 造('a.mkv', 'x');
    expect(() => 克隆替换(path.join(根, '没有.mkv'), a.路径)).toThrow();
    expect(fs.readdirSync(根)).toEqual(['a.mkv']);
  });
});
