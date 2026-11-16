import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { preparePrivateMusic, segPrivateMusic, privateMusicDir, missingMarker, silentWav } from './私有配乐.ts';
import type { AssetLock, LockEntry } from './资产锁.ts';

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), `anim-${prefix}-`));
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const putFile = (dataRoot: string, storage: 'store' | '私有', content: string) => {
  const h = sha(content);
  fs.mkdirSync(path.join(dataRoot, storage, h.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, storage, h.slice(0, 2), h), content);
};

describe('私有配乐', () => {
  const id = '配乐/某歌';
  const makeSegment = (durSec: number, inSec = 0) => ({ segment: { sound: [{ sec: 0, asset: id, name: '歌', 长秒: durSec, 入点秒: inSec }, { sec: 0.1, asset: '音效/甲', name: '甲', 长秒: 0.3 }] } });

  it('静音 wav：48 kHz 单声道 16 位，秒数向上取整，数据全零', () => {
    const b = silentWav(1.2);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    expect(b.readUInt32LE(24)).toBe(48000);
    expect(b.readUInt16LE(22)).toBe(1);
    expect(b.readUInt32LE(40)).toBe(2 * 48000 * 2);
    expect(b.length).toBe(44 + 2 * 48000 * 2);
    expect(b.subarray(44).every((x) => x === 0)).toBe(true);
  });

  it('数据根里没有：写一份盖住所有 cue 的静音并报出来；补上字节后换成原样字节；只认私有库里 配乐/ 开头的', () => {
    const dataRoot = tmp('私有配乐');
    const entry: LockEntry = { sha256: sha('歌的字节'), suffix: '.m4a', size: 12, lib: '私有' };
    const assetLock: AssetLock = { [id]: entry, '音效/甲': { sha256: 'a'.repeat(64), suffix: '.ogg', size: 1, lib: 'store' } };
    const targetPath = path.join(privateMusicDir(dataRoot), '配乐', '某歌');

    expect(segPrivateMusic(makeSegment(2).segment, assetLock, dataRoot)).toEqual({ [id]: missingMarker });
    // 两段：2 秒从 0 秒起、1 秒从 2.5 秒起 → 盖到 3.5 秒，多留 1 秒取整 = 5 秒
    const missing = preparePrivateMusic([makeSegment(2), makeSegment(1, 2.5)], assetLock, dataRoot);
    expect(missing).toEqual([{ id, sec: 5, expectedPath: path.join(dataRoot, '私有', entry.sha256.slice(0, 2), entry.sha256) }]);
    expect(fs.readFileSync(targetPath).equals(silentWav(4.5))).toBe(true);
    const mtimeBefore = fs.statSync(targetPath).mtimeMs;
    expect(preparePrivateMusic([makeSegment(2), makeSegment(1, 2.5)], assetLock, dataRoot)).toHaveLength(1);
    expect(fs.statSync(targetPath).mtimeMs).toBe(mtimeBefore);

    putFile(dataRoot, '私有', '歌的字节');
    fs.chmodSync(path.join(dataRoot, '私有', entry.sha256.slice(0, 2), entry.sha256), 0o444);
    expect(segPrivateMusic(makeSegment(2).segment, assetLock, dataRoot)).toEqual({ [id]: entry.sha256 });
    expect(preparePrivateMusic([makeSegment(2)], assetLock, dataRoot)).toEqual([]);
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('歌的字节');
    // 公开的配乐不走这里（照常打进包）
    expect(segPrivateMusic(makeSegment(2).segment, { ...assetLock, [id]: { ...entry, lib: 'store' } }, dataRoot)).toEqual({});
  });
});
