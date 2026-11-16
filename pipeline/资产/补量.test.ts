import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { measureAudioFile } from '../段框架/音频数.ts';
import { bytesPath, writeAssetLock, readAssetLock, type AssetLock, type LockEntry } from './资产锁.ts';
import { mergeMissing, lacksAudioMetadata, fillAudioMetadata } from './补量.ts';
import { measureAudio } from './音频量.ts';

const lockEntry = (c: string, suffix = '.ogg', storage: LockEntry['lib'] = 'store'): LockEntry => ({ sha256: c.repeat(64), size: 3, lib: storage, suffix: suffix });
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

describe('assets measure 补音频元数据', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), '补量-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const putBytes = (e: LockEntry) => {
    const f = bytesPath(e, root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x');
  };

  it('只挑没量过（没有时长）的音频条目；不是音频的、量过的（含静音缺峰值的）不动', () => {
    expect(lacksAudioMetadata(lockEntry('a', '.png'))).toBe(false);
    expect(lacksAudioMetadata({ ...lockEntry('a'), duration: 1, peakDb: -1, loudness: -20 })).toBe(false);
    expect(lacksAudioMetadata({ ...lockEntry('a', '.OGG'), duration: 1, loudness: -20 })).toBe(false);
    expect(lacksAudioMetadata(lockEntry('a', '.OGG'))).toBe(true);
    expect(lacksAudioMetadata({ ...lockEntry('a'), peakDb: -1, loudness: -20 })).toBe(true);
  });

  it('量过一遍还缺峰值的静音条目，再跑不重量、只查也不算能补', () => {
    const assetLock: AssetLock = { '音效/静音': { ...lockEntry('c', '.wav'), duration: 0.5, loudness: -70 } };
    putBytes(assetLock['音效/静音']!);
    const r = fillAudioMetadata(assetLock, { dataRoot: root, measure: () => { throw new Error('不该重量'); } });
    expect(r.missing).toEqual([]);
    expect(r.patched).toEqual([]);
    expect(r.assetLock).toEqual(assetLock);
  });

  it('只并进原来没有的字段，已有的数不被新量的盖掉', () => {
    expect(mergeMissing({ ...lockEntry('a'), duration: 2 }, { duration: 2.5, peakDb: -3, loudness: -18 })).toEqual({ ...lockEntry('a'), duration: 2, peakDb: -3, loudness: -18 });
  });

  it('补缺的、跳过没字节的、报量不出和量完仍缺的；sha、大小、库、后缀不变，原锁对象不改', () => {
    const assetLock: AssetLock = {
      '音效/有': lockEntry('a'),
      '配乐/私有没字节': lockEntry('b', '.flac', '私有'),
      '音效/静音': lockEntry('c', '.wav'),
      '音效/坏': lockEntry('d'),
      '贴图/图': lockEntry('e', '.png'),
      '音效/齐': { ...lockEntry('f'), duration: 1, peakDb: -1, loudness: -20 },
    };
    for (const id of ['音效/有', '音效/静音', '音效/坏', '贴图/图']) putBytes(assetLock[id]!);
    const snapshot = structuredClone(assetLock);
    const measuredNames: string[] = [];
    const r = fillAudioMetadata(assetLock, {
      dataRoot: root,
      measure: (f) => {
        measuredNames.push(path.basename(f));
        if (f.endsWith('d'.repeat(64))) throw new Error('ffmpeg 量不了\n细节');
        return f.endsWith('c'.repeat(64)) ? { duration: 0.5, loudness: -70 } : { duration: 1.5, peakDb: -2.25, loudness: -19.5 };
      },
    });
    expect(assetLock).toEqual(snapshot);
    expect(r.audio).toBe(5);
    expect(r.missing).toEqual(['配乐/私有没字节', '音效/坏', '音效/有', '音效/静音']);
    expect(r.noBytes).toEqual(['配乐/私有没字节']);
    expect(r.unmeasured).toEqual([{ id: '音效/坏', cause: 'ffmpeg 量不了' }]);
    expect(r.patched).toEqual(['音效/有', '音效/静音']);
    expect(r.stillMissing).toEqual([{ id: '音效/静音', missingFields: ['peakDb'] }]);
    expect(measuredNames).toHaveLength(3);
    expect(r.assetLock['音效/有']).toEqual({ ...lockEntry('a'), duration: 1.5, peakDb: -2.25, loudness: -19.5 });
    for (const id of Object.keys(assetLock)) {
      const { sha256, size: byteSize, lib: storage, suffix: suffix } = r.assetLock[id]!;
      expect({ sha256, size: byteSize, lib: storage, suffix: suffix }).toEqual({ sha256: assetLock[id]!.sha256, size: assetLock[id]!.size, lib: assetLock[id]!.lib, suffix: assetLock[id]!.suffix });
    }
    expect(r.assetLock['配乐/私有没字节']).toBe(assetLock['配乐/私有没字节']);
    expect(r.assetLock['贴图/图']).toBe(assetLock['贴图/图']);
  });

  it('只查：不量、不改，照样报缺和没字节', () => {
    const assetLock: AssetLock = { '音效/有': lockEntry('a'), '音效/没': lockEntry('b') };
    putBytes(assetLock['音效/有']!);
    const r = fillAudioMetadata(assetLock, { dataRoot: root, checkOnly: true, measure: () => { throw new Error('只查不该量'); } });
    expect(r.missing).toEqual(['音效/有', '音效/没']);
    expect(r.noBytes).toEqual(['音效/没']);
    expect(r.patched).toEqual([]);
    expect(r.assetLock).toEqual(assetLock);
  });

  it('补完写回的锁：除了加的字段逐字节和原来一样（键序照旧排）', () => {
    const f = path.join(root, '资产锁');
    const assetLock: AssetLock = { 'z/后': { ...lockEntry('a', '.png') }, '音效/有': lockEntry('b') };
    writeAssetLock(assetLock, f);
    putBytes(assetLock['音效/有']!);
    const r = fillAudioMetadata(readAssetLock(f), { dataRoot: root, measure: () => ({ duration: 1, peakDb: -1, loudness: -20 }) });
    writeAssetLock(r.assetLock, f);
    const lock = readAssetLock(f);
    expect(Object.keys(lock)).toEqual(['z/后', '音效/有'].sort());
    expect(Object.keys(lock['音效/有']!)).toEqual(['loudness', 'suffix', 'size', 'peakDb', 'lib', 'duration', 'sha256'].sort());
  });

  // 和 anim cues 现量（段框架/音频数.ts）是同一个量法：锁里补的数和 放() 现量的逐位一样
  it.skipIf(!hasFfmpeg)('真量：默认量法、cue 现量、量音频数 三者结果一样', () => {
    const e = lockEntry('9', '.flac');
    const f = bytesPath(e, root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tempPath = path.join(root, '正弦.flac');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.8:sample_rate=48000', tempPath]);
    fs.renameSync(tempPath, f);
    const r = fillAudioMetadata({ '音效/正弦': e }, { dataRoot: root });
    const sineLockEntry = r.assetLock['音效/正弦']!;
    expect(sineLockEntry.duration).toBeCloseTo(0.8, 2);
    expect({ duration: sineLockEntry.duration, peakDb: sineLockEntry.peakDb, loudness: sineLockEntry.loudness }).toEqual(measureAudioFile(f));
    expect(measureAudioFile(f)).toEqual(measureAudio(f));
  });
});
