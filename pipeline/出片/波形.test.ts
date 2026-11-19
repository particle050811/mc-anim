import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LockEntry } from '../资产/资产锁.ts';
import type { TimelineAudio } from './时间轴.ts';
import { assetPeaks, peakByte, peaksFromPcm, playedCells, timelineWaveforms } from './波形.ts';

const item = (asset: string, inSec: number, durSec: number, extra: Partial<TimelineAudio> = {}): TimelineAudio => ({
  id: `${asset}/${inSec}`, segment: '甲', kind: '音效', name: asset, asset, startSec: 0, durSec, inSec, rate: 1, loop: false,
  gainDb: 0, endGainDb: 0, fadeOutSec: null, group: null, fileDurSec: 10, cutAtSegEnd: false, cutReason: null, ...extra,
});

const roots: string[] = [];
const tempRoot = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), '波形-'));
  roots.push(d);
  return d;
};
afterEach(() => roots.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('时间轴波形', () => {
  it('峰值按 dBFS 映射到 0–255：满幅 255、-60 dB 及以下 0、-30 dB 居中', () => {
    expect(peakByte(1)).toBe(255);
    expect(peakByte(1.5)).toBe(255);
    expect(peakByte(0)).toBe(0);
    expect(peakByte(10 ** (-70 / 20))).toBe(0);
    expect(peakByte(10 ** (-30 / 20))).toBe(128);
  });

  it('每格取各声道 |样本| 的最大值，最后不满一格的也算一格', () => {
    // 双声道、每秒 4 帧、每秒 2 格：一格 2 帧 = 4 个样本
    const pcm = new Float32Array([0.1, -1, 0, 0, 0.001, 0, 0, -0.001, 0.5, 0]);
    expect([...peaksFromPcm(pcm, 2, 4, 2)]).toEqual([255, peakByte(0.001), peakByte(0.5)]);
  });

  it('放到的区间：各截入点到出点的并，按速率伸缩，循环的算整份，夹在文件里', () => {
    expect(playedCells([item('a', 2, 1), item('a', 5.005, 0.5)], 1000)).toEqual([200, 551]);
    expect(playedCells([item('a', 2, 1, { rate: 2 })], 1000)).toEqual([200, 400]);
    expect(playedCells([item('a', 0, 3, { loop: true })], 1000)).toEqual([0, 1000]);
    expect(playedCells([item('a', 9, 5)], 1000)).toEqual([900, 1000]);
    expect(playedCells([item('a', 12, 1)], 1000)).toBeNull();
  });

  it('只写放到的那一段，整份峰值按 sha 缓存；字节不在的记 missing', () => {
    const root = tempRoot();
    const entry = (sha: string): LockEntry => ({ sha256: sha, size: 1, lib: 'store', suffix: '.ogg' });
    const bytes = path.join(root, 'store', 'aa', 'aa11');
    fs.mkdirSync(path.dirname(bytes), { recursive: true });
    fs.writeFileSync(bytes, 'x');
    let decoded = 0;
    const decode = () => (decoded++, Uint8Array.from({ length: 1000 }, (_, i) => i % 256));
    const audio = [item('音效/有', 2, 1), item('音效/有', 3, 0.5), item('音效/缺', 0, 1)];
    const files: Record<string, LockEntry> = { '音效/有': entry('aa11'), '音效/缺': entry('bb22') };
    const r = timelineWaveforms(audio, (a) => files[a.asset], root, decode);
    expect(r.missing).toEqual(['音效/缺']);
    expect(Object.keys(r.waveforms)).toEqual(['音效/有']);
    const w = r.waveforms['音效/有']!;
    expect(w).toMatchObject({ perSec: 100, startSec: 2, floorDb: -60 });
    expect([...Buffer.from(w.peaks, 'base64')]).toEqual(Array.from({ length: 150 }, (_, i) => (200 + i) % 256));
    // 第二次读缓存，不再解码
    expect(assetPeaks(files['音效/有']!, root, decode)!.length).toBe(1000);
    expect(decoded).toBe(1);
  });
});
