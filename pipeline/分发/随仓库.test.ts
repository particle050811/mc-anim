import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareBytes, fillBytes, writeRepoBundle, bytesDir, readRepoManifest, type BundleSet } from './随仓库.ts';
import type { LockEntry } from '../资产/资产锁.ts';

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), `anim-${prefix}-`));
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const putFile = (dataRoot: string, storage: 'store' | '私有', content: string): LockEntry => {
  const h = sha(content);
  fs.mkdirSync(path.join(dataRoot, storage, h.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, storage, h.slice(0, 2), h), content);
  return { sha256: h, suffix: '.ogg', size: Buffer.byteLength(content), lib: storage };
};

describe('随仓库', () => {
  const makeBundleSet = (...entries: [string, LockEntry][]): BundleSet => ({ files: new Map(entries.map(([id, e]) => [e.sha256, { entry: e, ids: [id] }])), privateFiles: [], privateLibItems: new Map(), segKeys: ['2-甲'], terrain: [], issues: [] });

  it('随仓库.toml 只认非空的字符串数组', () => {
    expect(readRepoManifest('"段" = ["2", "核对-封面帧"]').segment).toEqual(['2', '核对-封面帧']);
    expect(() => readRepoManifest('"段" = [2]')).toThrow(/章也写成字符串/);
    expect(() => readRepoManifest('')).toThrow(/段/);
  });

  it('vendor：从数据根拷进 字节/、核源 sha；再跑一遍没有改动；多余的、改坏的、放错位置的都报出来并修好', () => {
    const dataRoot = tmp('随仓库数据根');
    const workDir = tmp('随仓库作品');
    const blobA = putFile(dataRoot, 'store', '甲的字节');
    const secondBytes = putFile(dataRoot, 'store', '乙的字节');
    const c = makeBundleSet(['贴图/甲', blobA], ['音效/乙', secondBytes]);
    expect(writeRepoBundle(c, workDir, dataRoot)).toMatchObject({ added: [`${blobA.sha256.slice(0, 2)}/${blobA.sha256}`, `${secondBytes.sha256.slice(0, 2)}/${secondBytes.sha256}`], changed: [], removed: [], fileCount: 2 });
    const firstFile = path.join(bytesDir(workDir), blobA.sha256.slice(0, 2), blobA.sha256);
    expect(fs.readFileSync(firstFile, 'utf8')).toBe('甲的字节');
    expect(fs.statSync(firstFile).mode & 0o200).toBeTruthy();
    expect(compareBytes(c, workDir)).toMatchObject({ added: [], changed: [], removed: [] });

    fs.writeFileSync(firstFile, '改坏了');
    fs.writeFileSync(path.join(bytesDir(workDir), 'readme.txt'), 'x');
    fs.mkdirSync(path.join(bytesDir(workDir), 'ff'));
    fs.writeFileSync(path.join(bytesDir(workDir), 'ff', secondBytes.sha256), '乙的字节');
    const r = compareBytes(c, workDir);
    expect(r.changed).toEqual([`${blobA.sha256.slice(0, 2)}/${blobA.sha256}`]);
    expect(r.removed.sort()).toEqual([`ff/${secondBytes.sha256}`, 'readme.txt'].sort());
    writeRepoBundle(c, workDir, dataRoot);
    expect(compareBytes(c, workDir)).toMatchObject({ added: [], changed: [], removed: [] });
    expect(fs.existsSync(path.join(bytesDir(workDir), 'ff'))).toBe(false);
    expect(fs.readFileSync(firstFile, 'utf8')).toBe('甲的字节');
  });

  it('vendor：数据根里缺字节或字节不对就报错，不写半截', () => {
    const dataRoot = tmp('随仓库数据根');
    const workDir = tmp('随仓库作品');
    const blobA = putFile(dataRoot, 'store', '甲的字节');
    const missingEntry: LockEntry = { sha256: 'c'.repeat(64), suffix: '.png', size: 1, lib: 'store' };
    expect(() => writeRepoBundle(makeBundleSet(['贴图/甲', blobA], ['贴图/缺', missingEntry]), workDir, dataRoot)).toThrow(/贴图\/缺/);
    expect(fs.existsSync(bytesDir(workDir))).toBe(false);
    fs.writeFileSync(path.join(dataRoot, 'store', blobA.sha256.slice(0, 2), blobA.sha256), '被改了');
    expect(() => writeRepoBundle(makeBundleSet(['贴图/甲', blobA]), workDir, dataRoot)).toThrow(/sha256 是/);
  });

  it('seed：字节/ 里数据根没有的核过 sha 补进 store（只读），已有的不动；内容和文件名对不上、布局不对就报错', () => {
    const sourceRoot = tmp('随仓库数据根');
    const workDir = tmp('随仓库作品');
    const blobA = putFile(sourceRoot, 'store', '甲的字节');
    const secondBytes = putFile(sourceRoot, 'store', '乙的字节');
    writeRepoBundle(makeBundleSet(['贴图/甲', blobA], ['音效/乙', secondBytes]), workDir, sourceRoot);

    const dataRoot = tmp('空数据根');
    const storePath = path.join(dataRoot, 'store', secondBytes.sha256.slice(0, 2), secondBytes.sha256);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, '乙的字节');
    const time = fs.statSync(storePath).mtimeMs;
    expect(fillBytes(workDir, dataRoot)).toEqual({ copied: 1, total: 2 });
    const filledPath = path.join(dataRoot, 'store', blobA.sha256.slice(0, 2), blobA.sha256);
    expect(fs.readFileSync(filledPath, 'utf8')).toBe('甲的字节');
    if (process.platform !== 'win32') expect(fs.statSync(filledPath).mode & 0o222).toBe(0);
    expect(fs.statSync(storePath).mtimeMs).toBe(time);
    expect(fs.readdirSync(path.dirname(filledPath))).toEqual([blobA.sha256]);
    expect(fillBytes(workDir, dataRoot)).toEqual({ copied: 0, total: 2 });

    // 换行被 git 改过这类：内容 sha 和文件名对不上
    const emptyRoot = tmp('空数据根');
    fs.writeFileSync(path.join(bytesDir(workDir), blobA.sha256.slice(0, 2), blobA.sha256), '甲的字节\r\n');
    expect(() => fillBytes(workDir, emptyRoot)).toThrow(/和文件名对不上/);
    fs.writeFileSync(path.join(bytesDir(workDir), 'x.txt'), '');
    expect(() => fillBytes(workDir, emptyRoot)).toThrow(/只放/);
    // 没有 字节/ 的作品什么都不做
    expect(fillBytes(tmp('无字节作品'), emptyRoot)).toEqual({ copied: 0, total: 0 });
  });
});
