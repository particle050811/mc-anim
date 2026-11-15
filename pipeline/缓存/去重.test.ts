// 去重：同大小先比内容、硬链接本来就共享、账本记住克隆过的；克隆本身只在 Mac 上测。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloneReplace, savableBytes, executeDedup, findDuplicates, readLedger, writeLedger, canClone, fileSha, type DedupFile } from './去重.ts';

let root = '';
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-去重样例-')));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const makeFile = (relPath: string, content: string | Buffer, daysAgo = 0): DedupFile => {
  const f = path.join(root, relPath);
  fs.writeFileSync(f, content);
  const t = Date.now() - daysAgo * 86_400_000;
  fs.utimesSync(f, new Date(t), new Date(t));
  const st = fs.statSync(f);
  return { 路径: f, 大小: st.size, 改于: st.mtimeMs };
};
const fileFromPath = (f: string): DedupFile => {
  const st = fs.statSync(f);
  return { 路径: f, 大小: st.size, 改于: st.mtimeMs };
};
const fileKey = (p: string) => path.relative(root, p);

describe('去重', () => {
  it('大小相同、内容不同的不算重复；内容相同的挑最早的当源', async () => {
    const a = makeFile('a.mkv', 'x'.repeat(1000), 3);
    const b = makeFile('b.mkv', 'x'.repeat(1000), 1);
    const c = makeFile('c.mkv', 'y'.repeat(1000), 2);
    const d = makeFile('d.mkv', 'x'.repeat(999), 2);
    const ledger = readLedger(path.join(root, '没有.json'));
    const dupGroups = await findDuplicates([a, b, c, d], ledger, fileKey);
    expect(dupGroups).toHaveLength(1);
    expect(dupGroups[0]).toMatchObject({ 源: a.路径, toClone: [b.路径], 省: 1000 });
    expect(savableBytes(dupGroups)).toBe(1000);
    // d 大小不同，没算 sha
    expect(Object.keys(ledger.文件).sort()).toEqual(['a.mkv', 'b.mkv', 'c.mkv']);
    expect(ledger.文件['a.mkv']!.sha).toBe(await fileSha(a.路径));
  });

  it('硬链接本来就共享：同一 inode 不算重复；别的 inode 有计划外的硬链接就不动', async () => {
    const a = makeFile('a.mkv', 'x'.repeat(1000), 3);
    fs.linkSync(a.路径, path.join(root, 'a2.mkv'));
    const ledger = readLedger('');
    expect(await findDuplicates([a, fileFromPath(path.join(root, 'a2.mkv'))], ledger, fileKey)).toEqual([]);
    const b = makeFile('b.mkv', 'x'.repeat(1000), 1);
    fs.linkSync(b.路径, path.join(root, '别处的b.mkv'));
    // b 还有一个名字不在这批里：换掉 b.mkv 也腾不出空间
    const dupGroups = await findDuplicates([a, fileFromPath(path.join(root, 'a2.mkv')), b], ledger, fileKey);
    expect(savableBytes(dupGroups)).toBe(0);
    // 那个名字这次也要删（只看不删时扣掉）：就算得上
    const extraDeletes = new Map([[`${fs.statSync(b.路径).dev}-${fs.statSync(b.路径).ino}`, 1]]);
    expect(savableBytes(await findDuplicates([a, fileFromPath(path.join(root, 'a2.mkv')), b], ledger, fileKey, { extraDeletes }))).toBe(1000);
  });

  it('账本对得上的不重算 sha；改过的重算', async () => {
    const a = makeFile('a.mkv', 'x'.repeat(10), 3);
    const b = makeFile('b.mkv', 'z'.repeat(10), 3);
    const ledger = readLedger('');
    await findDuplicates([a, b], ledger, fileKey);
    ledger.文件['a.mkv']!.sha = '假的'; // 对得上就照账本用
    const dupGroups = await findDuplicates([a, b], ledger, fileKey);
    expect(dupGroups).toEqual([]);
    expect(ledger.文件['a.mkv']!.sha).toBe('假的');
    fs.writeFileSync(a.路径, 'z'.repeat(10));
    const secondGroups = await findDuplicates([fileFromPath(a.路径), b], ledger, fileKey);
    expect(secondGroups).toHaveLength(1);
    const f = path.join(root, '账.json');
    writeLedger(f, ledger);
    expect(readLedger(f)).toEqual(ledger);
    fs.writeFileSync(f, '坏了');
    expect(readLedger(f)).toEqual({ 版本: 1, 文件: {} });
  });

  it.runIf(canClone())('Mac：克隆后内容、修改时间不变，账本记克隆自，重跑不再算省', async () => {
    const a = makeFile('a.mkv', Buffer.alloc(1 << 16, 7), 3);
    const b = makeFile('b.mkv', Buffer.alloc(1 << 16, 7), 1);
    const ledger = readLedger('');
    const dupGroups = await findDuplicates([a, b], ledger, fileKey);
    const before = fs.statSync(b.路径);
    const r = executeDedup(dupGroups, ledger, fileKey);
    expect(r).toEqual({ cloneCount: 1, 省: 1 << 16, failed: [] });
    const statAfter = fs.statSync(b.路径);
    expect(statAfter.mtimeMs).toBe(before.mtimeMs);
    expect(statAfter.ino).not.toBe(before.ino);
    expect(fs.readFileSync(b.路径).equals(fs.readFileSync(a.路径))).toBe(true);
    expect(ledger.文件['b.mkv']!.克隆自).toBe('a.mkv');
    const rescan = await findDuplicates([a, fileFromPath(b.路径)], ledger, fileKey);
    expect(savableBytes(rescan)).toBe(0);
    expect(rescan[0]!.alreadyShared).toEqual([b.路径]);
    // 克隆出来的是独立文件：改源不影响它
    fs.writeFileSync(a.路径, 'x');
    expect(fs.statSync(b.路径).size).toBe(1 << 16);
  });

  it.runIf(canClone())('克隆失败不留临时文件', () => {
    const a = makeFile('a.mkv', 'x');
    expect(() => cloneReplace(path.join(root, '没有.mkv'), a.路径)).toThrow();
    expect(fs.readdirSync(root)).toEqual(['a.mkv']);
  });
});
