// jars.toml 的「根 = 数据」「也认」和 anim extract --download：数据根、游戏目录都是临时目录，下载换成假的（不连网）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// 配置读得懒，下面动态 import 之前设好就行
const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-下载测试-')));
process.env.ANIM_DATA = path.join(tempDir, '数据');
process.env.ANIM_GAME = path.join(tempDir, '游戏');
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const { parseManifest, splitPosition } = await import('./清单.ts');
const { jarRecordPath, jarPath } = await import('./提取.ts');
const { download, downloadList, canDownload } = await import('./下载.ts');

const mappingContent = '# 映射文件头\nnet.minecraft.A -> a:\n';
const sha = (algorithm: string, s: string) => crypto.createHash(algorithm).update(s).digest('hex');

const jars = (sha256 = sha('sha256', mappingContent)) => `
[["Mojang"."映射"]]
"id" = "映射甲"
"根" = "数据"
"到" = "cache/映射/甲.txt"
"也认" = ["游戏:缓存/甲.txt"]
"下载" = "https://example.invalid/甲.txt"
"sha256" = "${sha256}"
"sha1" = "${sha('sha1', mappingContent)}"
[["模组"]]
"id" = "模组乙"
"到" = "mods/乙.jar"
"下载" = "https://example.invalid/乙.jar"
"sha256" = "${'0'.repeat(64)}"
`;

describe('jars.toml 的根和也认', () => {
  it('根只认 游戏、mc资源、数据；也认 写成 <根>:<路径>，不写根按游戏', () => {
    expect(splitPosition('游戏:缓存/a.txt')).toEqual(['游戏', '缓存/a.txt']);
    expect(splitPosition('缓存/a.txt')).toEqual(['游戏', '缓存/a.txt']);
    expect(() => splitPosition('别处:a.txt')).toThrow(/根只认/);
    expect(() => parseManifest('', '[["模组"]]\n"id" = "x"\n"根" = "别处"\n"到" = "a"\n')).toThrow(/根只认/);
  });

  it('「到」在就用它；不在找也认的位置；都没有返回「到」', () => {
    const q = parseManifest('', jars());
    const mappingPath = path.join(tempDir, '数据', 'cache', '映射', '甲.txt');
    const inGame = path.join(tempDir, '游戏', '缓存', '甲.txt');
    expect(jarRecordPath(q.jars.get('映射甲')!)).toBe(mappingPath);
    expect(jarPath(q, '映射甲')).toBe(mappingPath);
    fs.mkdirSync(path.dirname(inGame), { recursive: true });
    fs.writeFileSync(inGame, mappingContent);
    expect(jarPath(q, '映射甲')).toBe(inGame);
    fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
    fs.writeFileSync(mappingPath, mappingContent);
    expect(jarPath(q, '映射甲')).toBe(mappingPath);
    fs.rmSync(mappingPath);
    fs.rmSync(inGame);
    expect(jarPath(q, '模组乙')).toBe(path.join(tempDir, '游戏', 'mods', '乙.jar'));
  });
});

describe('anim extract --download', () => {
  it('不点名只选 根 = 数据、写了下载和 sha256 的；点名能下的以外报错', () => {
    const q = parseManifest('', jars());
    expect([...q.jars.values()].filter(canDownload).map((j) => j.id)).toEqual(['映射甲']);
    expect(downloadList(q, [], jarRecordPath).map((x) => x.id)).toEqual(['映射甲']);
    expect(() => downloadList(q, ['模组乙'], jarRecordPath)).toThrow(/模组乙 不能自动下/);
    expect(() => downloadList(q, ['没有'], jarRecordPath)).toThrow(/jars.toml 里没有 没有/);
  });

  it('sha 对上才改名落盘；对不上不留文件；已有且对的跳过；已有但不对的不覆盖', () => {
    const fakeDownload = (content: string) => (_: string, destPath: string) => fs.writeFileSync(destPath, content);
    const badDownloads = downloadList(parseManifest('', jars('f'.repeat(64))), [], jarRecordPath);
    const [badResult] = download(badDownloads, fakeDownload(mappingContent));
    expect(badResult).toMatchObject({ state: '失败', note: expect.stringMatching(/下到的 sha256/) });
    expect(fs.readdirSync(path.dirname(badResult!.dest))).toEqual([]);

    const downloadItems = downloadList(parseManifest('', jars()), [], jarRecordPath);
    expect(download(downloadItems, fakeDownload(mappingContent))[0]).toMatchObject({ state: '下好' });
    expect(fs.readFileSync(downloadItems[0]!.dest, 'utf8')).toBe(mappingContent);
    expect(download(downloadItems, () => { throw new Error('不该再下'); })[0]).toMatchObject({ state: '已有' });

    fs.writeFileSync(downloadItems[0]!.dest, '被改过');
    expect(download(downloadItems, fakeDownload(mappingContent))[0]).toMatchObject({ state: '失败', note: expect.stringMatching(/没覆盖/) });
    expect(fs.readFileSync(downloadItems[0]!.dest, 'utf8')).toBe('被改过');
  });

  it('下载出错（网断）记失败、不留临时文件', () => {
    fs.rmSync(path.join(tempDir, '数据', 'cache', '映射'), { recursive: true, force: true });
    const downloadItems = downloadList(parseManifest('', jars()), [], jarRecordPath);
    const [r] = download(downloadItems, (_, destPath) => {
      fs.writeFileSync(destPath, '半截');
      throw new Error('curl: (6) Could not resolve host');
    });
    expect(r).toMatchObject({ state: '失败', note: expect.stringMatching(/Could not resolve/) });
    expect(fs.readdirSync(path.dirname(downloadItems[0]!.dest))).toEqual([]);
  });
});
