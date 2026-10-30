import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 带音频元数据, 解析ebur128 } from './音频量.ts';

// ffmpeg 7 的 ebur128 汇总（entity.warden.roar.1.ogg）
const 汇总 = `[Parsed_ebur128_0 @ 0x1] t: 3.299979   TARGET:-23 LUFS    M: -71.0 S: -16.6     I: -15.5 LUFS       LRA:  20.0 LU  SPK:  -0.3 dBFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -15.5 LUFS
    Threshold: -26.5 LUFS

  Loudness range:
    LRA:        20.0 LU
    Threshold: -36.6 LUFS
    LRA low:   -36.6 LUFS
    LRA high:  -16.6 LUFS

  Sample peak:
    Peak:       -0.3 dBFS
size=N/A time=00:00:03.31 bitrate=N/A speed= 377x`;

const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

describe('音频元数据', () => {
  it('解析 ebur128 汇总：积分响度、采样峰值取 Summary 里的，时长取 ffprobe 的', () => {
    expect(解析ebur128(汇总, '3.312646\n')).toEqual({ 时长: 3.312646, 峰值: -0.3, 响度: -15.5 });
    expect(解析ebur128(汇总)).toEqual({ 峰值: -0.3, 响度: -15.5 });
  });

  it('静音：峰值 -inf 不写，响度照写', () => {
    const 静 = 'Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n  Sample peak:\n    Peak:        -inf dBFS\n';
    expect(解析ebur128(静, 'N/A')).toEqual({ 响度: -70 });
  });

  it('不是音频的条目原样返回；量不出只警告、不抛', () => {
    const 条 = { sha256: 'a'.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' };
    expect(带音频元数据(条, '/没有/图.png')).toBe(条);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '音频量-'));
    const 坏 = path.join(d, '坏.ogg');
    fs.writeFileSync(坏, '不是 ogg');
    expect(带音频元数据({ ...条, 后缀: '.ogg' }, 坏)).toEqual({ ...条, 后缀: '.ogg' });
  });

  // lavfi 的 sine 默认振幅 1/8（-18 dBFS），再乘 0.5 是 -24.08 dBFS；用 flac 不用 wav：Homebrew ffmpeg 9.0.2 把 wav 误探成 mpegts
  it.skipIf(!有ffmpeg)('真量一段 1 秒正弦：时长 1 秒，峰值约 -24 dBFS', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '音频量-'));
    const f = path.join(d, '正弦.flac');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1:sample_rate=48000', '-af', 'volume=0.5', f]);
    const r = 带音频元数据({ sha256: 'b'.repeat(64), 大小: 1, 库: 'store', 后缀: '.flac' }, f);
    expect(r.时长).toBeCloseTo(1, 2);
    expect(r.峰值).toBeCloseTo(-24.08, 0);
    expect(r.响度).toBeLessThan(r.峰值!);
  });
});
