import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesAttachmentName, terrainAttachmentName, pullRelease, compareReleaseLock, readReleaseManifest, type ExpectedRelease } from './发布.ts';
import { missingAttachmentCount, type ReleaseLock } from './发布锁.ts';

const releaseTable = { repo: 'a/b', label: 'assets-v1', segment: ['6'] };
const s1 = '1'.repeat(64);
const s2 = '2'.repeat(64);
const expected: ExpectedRelease = { bytes: [s1, s2], privateLibBytes: [], terrain: [{ pack: '主世界', version: 'abc123' }], 段数: 1, privateFiles: [], issues: [] };
const releaseLock = (o: Partial<ReleaseLock> = {}): ReleaseLock => ({
  repo: 'a/b',
  label: 'assets-v1',
  attachments: [
    { name: bytesAttachmentName([s1, s2]), sha256: 'x', size: 1, bytes: [s1, s2] },
    { name: terrainAttachmentName('abc123'), sha256: 'y', size: 1, terrain: { pack: '主世界', version: 'abc123' } },
  ],
  ...o,
});

describe('挂 Release 发字节', () => {
  it('随发布.toml 要仓库、ASCII 标签、非空段', () => {
    expect(readReleaseManifest('"仓库" = "a/b"\n"标签" = "assets-v1"\n"段" = ["6", "核对"]')).toEqual({ repo: 'a/b', label: 'assets-v1', segment: ['6', '核对'] });
    expect(() => readReleaseManifest('"仓库" = "a"\n"标签" = "v1"\n"段" = ["6"]')).toThrow();
    expect(() => readReleaseManifest('"仓库" = "a/b"\n"标签" = "版本一"\n"段" = ["6"]')).toThrow();
    expect(() => readReleaseManifest('"仓库" = "a/b"\n"标签" = "v1"\n"段" = []')).toThrow();
  });

  it('附件名只用 ASCII，字节附件名跟着内容变', () => {
    expect(bytesAttachmentName([s1, s2])).toMatch(/^bytes-[0-9a-f]{12}\.tar$/);
    expect(bytesAttachmentName([s1])).not.toBe(bytesAttachmentName([s1, s2]));
    expect(terrainAttachmentName('abc123')).toBe('terrain-abc123.tar');
    // 没有 私有/ 库字节时名字和以前一样，旧发布锁照用
    expect(bytesAttachmentName([s1, s2], [])).toBe(bytesAttachmentName([s1, s2]));
    expect(bytesAttachmentName([s1], [s2])).not.toBe(bytesAttachmentName([s1, s2]));
  });

  it('发布锁和现算的一致就没问题；少字节、换了地形版本、换了标签都报', () => {
    expect(compareReleaseLock(releaseLock(), expected, releaseTable)).toEqual([]);
    expect(compareReleaseLock(undefined, expected, releaseTable)).toEqual(['没有 发布锁.json']);
    expect(compareReleaseLock(releaseLock(), { ...expected, bytes: [s1, s2, '3'.repeat(64)] }, releaseTable).join()).toMatch(/少 1 件字节/);
    expect(compareReleaseLock(releaseLock(), { ...expected, terrain: [{ pack: '主世界', version: 'def456' }] }, releaseTable).join()).toMatch(/terrain-def456\.tar/);
    expect(compareReleaseLock(releaseLock({ label: 'assets-v0' }), expected, releaseTable).join()).toMatch(/assets-v0/);
    expect(compareReleaseLock(releaseLock(), { ...expected, privateLibBytes: ['3'.repeat(64)] }, releaseTable).join()).toMatch(/少 1 件私有\/ 库的字节/);
  });

  it('附件缺：数一下数据根还缺的字节、地形包目录在不在', () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-发布-'));
    try {
      const [bytesEntry, terrainAttach] = releaseLock().attachments as [ReleaseLock['attachments'][number], ReleaseLock['attachments'][number]];
      expect(missingAttachmentCount(bytesEntry, dataRoot)).toBe(2);
      fs.mkdirSync(path.join(dataRoot, 'store', '11'), { recursive: true });
      fs.writeFileSync(path.join(dataRoot, 'store', '11', s1), '');
      expect(missingAttachmentCount(bytesEntry, dataRoot)).toBe(1);
      const withPrivate = { ...bytesEntry, privateLibBytes: ['3'.repeat(64)] };
      expect(missingAttachmentCount(withPrivate, dataRoot)).toBe(2);
      fs.mkdirSync(path.join(dataRoot, '私有', '33'), { recursive: true });
      fs.writeFileSync(path.join(dataRoot, '私有', '33', '3'.repeat(64)), '');
      expect(missingAttachmentCount(withPrivate, dataRoot)).toBe(1);
      expect(missingAttachmentCount(terrainAttach, dataRoot)).toBe(1);
      fs.mkdirSync(path.join(dataRoot, 'terrain', '主世界', 'abc123'), { recursive: true });
      expect(missingAttachmentCount(terrainAttach, dataRoot)).toBe(0);
    } finally {
      fs.rmSync(dataRoot, { recursive: true, force: true });
    }
  });
  it('pull：发布锁比 Release 新（附件 404）马上报清楚，不重试几分钟，也不写进数据根', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), '发布-'));
    const requestLog: string[] = [];
    const server = http.createServer((q, r) => {
      requestLog.push(`${q.method} ${q.url}`);
      r.statusCode = 404;
      r.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const savedNoProxy = process.env.NO_PROXY;
    process.env.NO_PROXY = '127.0.0.1';
    try {
      await expect(pullRelease(releaseLock({ attachments: [releaseLock().attachments[1]!] }), dataRoot, `http://127.0.0.1:${port}`)).rejects.toThrow(/Release assets-v1 上没有 terrain-abc123\.tar.*anim assets pack --upload/);
      expect(requestLog).toEqual(['HEAD /a/b/releases/download/assets-v1/terrain-abc123.tar']);
      expect(fs.existsSync(path.join(dataRoot, 'terrain'))).toBe(false);
    } finally {
      if (savedNoProxy === undefined) delete process.env.NO_PROXY;
      else process.env.NO_PROXY = savedNoProxy;
      server.close();
      fs.rmSync(dataRoot, { recursive: true, force: true });
    }
  });
  it('pull：同一个 tar 里 store/ 和 私有/ 库的字节各放回各自的库', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), '发布-'));
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), '发布源-'));
    const writeFile = (storage: string, content: string) => {
      const s = crypto.createHash('sha256').update(content).digest('hex');
      fs.mkdirSync(path.join(sourceDir, storage, s.slice(0, 2)), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, storage, s.slice(0, 2), s), content);
      return s;
    };
    const publicRecord = writeFile('store', '公开的');
    const privateSha = writeFile('私有', '以前私有的歌');
    const tar = path.join(sourceDir, 'x.tar');
    execFileSync('tar', ['-cf', tar, '-C', sourceDir, `store/${publicRecord.slice(0, 2)}/${publicRecord}`, `私有/${privateSha.slice(0, 2)}/${privateSha}`]);
    const tarBytes = fs.readFileSync(tar);
    const attachName = bytesAttachmentName([publicRecord], [privateSha]);
    const server = http.createServer((q, r) => {
      r.setHeader('Content-Length', tarBytes.length);
      r.end(q.method === 'HEAD' ? undefined : tarBytes);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const savedNoProxy = process.env.NO_PROXY;
    process.env.NO_PROXY = '127.0.0.1';
    try {
      const sha256 = crypto.createHash('sha256').update(tarBytes).digest('hex');
      await pullRelease({ repo: 'a/b', label: 'assets-v1', attachments: [{ name: attachName, sha256, size: tarBytes.length, bytes: [publicRecord], privateLibBytes: [privateSha] }] }, dataRoot, `http://127.0.0.1:${port}`);
      expect(fs.readFileSync(path.join(dataRoot, 'store', publicRecord.slice(0, 2), publicRecord), 'utf8')).toBe('公开的');
      expect(fs.readFileSync(path.join(dataRoot, '私有', privateSha.slice(0, 2), privateSha), 'utf8')).toBe('以前私有的歌');
      expect(fs.existsSync(path.join(dataRoot, 'store', privateSha.slice(0, 2), privateSha))).toBe(false);
    } finally {
      if (savedNoProxy === undefined) delete process.env.NO_PROXY;
      else process.env.NO_PROXY = savedNoProxy;
      server.close();
      fs.rmSync(dataRoot, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
