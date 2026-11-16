import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LockEntry } from '../资产/资产锁.ts';
import { getAudioMeasure, knownAudioMeasure } from './音频数.ts';

describe('取音频数', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-音频数-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry: LockEntry = { sha256: 'd'.repeat(64), size: 3, lib: 'store', suffix: '.ogg' };

  it('锁里有数用锁的，不量', () => {
    const e = { ...entry, duration: 3, peakDb: -1 } as LockEntry;
    expect(getAudioMeasure('x/y', e, root, () => { throw new Error('不该量'); })).toEqual({ duration: 3, peakDb: -1 });
  });
  it('锁里没有：量一次写缓存，第二次读缓存；字节不在报错', () => {
    expect(() => getAudioMeasure('x/y', entry, root)).toThrow(/字节不在数据根/);
    const bytesPath = path.join(root, 'store', 'dd', 'd'.repeat(64));
    fs.mkdirSync(path.dirname(bytesPath), { recursive: true });
    fs.writeFileSync(bytesPath, 'abc');
    let calls = 0;
    const measure = () => (calls++, { duration: 1.5, peakDb: -2 });
    expect(getAudioMeasure('x/y', entry, root, measure)).toEqual({ duration: 1.5, peakDb: -2 });
    expect(getAudioMeasure('x/y', entry, root, measure)).toEqual({ duration: 1.5, peakDb: -2 });
    expect(calls).toBe(1);
    expect(knownAudioMeasure(entry, root)).toEqual({ duration: 1.5, peakDb: -2 });
    expect(knownAudioMeasure(entry)).toBeUndefined();
    expect(() => getAudioMeasure('x/z', undefined, root)).toThrow(/资产锁里没有/);
  });
});
