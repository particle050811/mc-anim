// anim film 的拼接（拼成片.ts）：两段现造的成片切片（60 帧输出）直接拷流接成一条，查总帧数、拼接表、manifest、
// 声音按段长按样本截、拉到 −16 LUFS，--分享版 另出 1080p60 AV1。渲染那步（渲/渲段.ts）mock 掉，切片和声音用 ffmpeg 现造。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import type { RunRecord } from '../运行记录/记录.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-拼成片测试-'));
process.env.ANIM_DATA = dataRoot;

const fake = vi.hoisted(() => ({ segments: [] as unknown[], outputs: [] as unknown[] }));
vi.mock('../渲/渲段.ts', () => ({ renderSegments: async () => fake.outputs }));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<object>()), allSegments: async () => fake.segments }));
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试' }));

const { assembleFilm } = await import('./拼成片.ts');
const { videoInfo } = await import('../渲/探测.ts');
const { codeRoot } = await import('../环境/路径.ts');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const hasAv1 = hasFfmpeg && /libsvtav1/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout);

const makeSeg = (segKey: string, durSec: number): SegInfo =>
  ({
    键: segKey,
    章: 0,
    编号: null,
    segmentName: segKey,
    段文件: path.join(codeRoot(), '作品', '测试', '段', segKey, '段.ts'),
    段: { 场: '测试', 秒: durSec, 宽: 320, 高: 180, 地形: [] },
  }) as unknown as SegInfo;

const runFfmpeg = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

/** 一段成片切片：60 帧 输出帧数 帧（和 渲/设置.ts 同一套 x264 参数），声音从全片第 输出起帧 帧起、比段长多 0.5 秒（要按样本截掉） */
const makeOutput = (segKey: string, outputFrames: number, outputStartFrame: number, frequency: number) => {
  const d = path.join(dataRoot, '切片', segKey);
  fs.mkdirSync(d, { recursive: true });
  const pictureMp4 = path.join(d, '画面.mp4');
  const soundFile = path.join(d, '声音.wav');
  runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60', '-frames:v', String(outputFrames), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', pictureMp4]);
  runFfmpeg(['-f', 'lavfi', '-t', String(outputFrames / 60 + 0.5), '-i', `sine=frequency=${frequency}:sample_rate=48000`, '-ac', '2', '-c:a', 'pcm_s16le', soundFile]);
  const makeFingerprint = (k: string) => ({ 段: segKey, 指纹: k.repeat(64).slice(0, 64), 项: {} });
  return { 段: makeSeg(segKey, outputFrames / 60), 画面指纹: makeFingerprint('a'), 声音指纹: makeFingerprint('b'), 画面: pictureMp4, 声音: soundFile, outputFrames, outputStartFrame, soundStartSec: outputStartFrame / 60, soundEndSec: (outputStartFrame + outputFrames) / 60 };
};

const makeRunRecord = () => ({ log: vi.fn(), 产物: [] as string[], 阶段: [] }) as unknown as RunRecord;

describe.skipIf(!hasFfmpeg)('拼成片', () => {
  beforeAll(() => {
    // 2 秒 + 1.55 秒，60 帧输出的窗是 [0, 120)、[120, 213)
    fake.outputs = [makeOutput('甲', 120, 0, 440), makeOutput('乙', 93, 120, 660)];
    fake.segments = (fake.outputs as { 段: SegInfo }[]).map((r) => r.段);
  });
  afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

  it('两段拷流接成一条：总帧数是各段输出帧之和，拼接表、manifest 记全片起帧（B 站时间轴按它切段），声音按段长截、拉到 −16 LUFS', async () => {
    const { dir, 成片: filmPath, manifest } = await assembleFilm(fake.segments as SegInfo[], { 级别: '预览', 名: '两段', 范围: ['甲', '乙'], runRecord: makeRunRecord() });
    expect(videoInfo(filmPath).帧数).toBe(213);
    expect(manifest.总帧数).toBe(213);
    expect(manifest.段.map((s) => [s.键, s.帧数, s.全片起帧])).toEqual([
      ['甲', 120, 0],
      ['乙', 93, 120],
    ]);
    const tsvTable = fs.readFileSync(path.join(dir, '拼接表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(tsvTable.map((r) => [r[1], r[4], r[5]])).toEqual([
      ['甲', '120', '0'],
      ['乙', '93', '120'],
    ]);
    const audioDuration = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', filmPath], { encoding: 'utf8' }).stdout.trim());
    expect(Math.abs(audioDuration - 213 / 60)).toBeLessThan(0.03);
    expect(Math.abs(manifest.响度.成片LUFS - -16)).toBeLessThan(0.5);
    expect(manifest.响度.真峰值dBTP).toBeLessThanOrEqual(-1);
    expect(fs.existsSync(path.join(dir, '全片-未拉响度.flac'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '_工作'))).toBe(false);
    expect(manifest.分享版).toBeNull();
  });

  it.skipIf(!hasAv1)('--分享版：另出 1080p60 AV1、2750 kbps，文件名带 -分享版1080p60，真峰值不超 −1 dBTP', async () => {
    const { dir, manifest } = await assembleFilm(fake.segments as SegInfo[], { 级别: '预览', 名: '分享', 范围: [], 分享版: true, runRecord: makeRunRecord() });
    expect(manifest.文件.分享版).toBe('分享-分享版1080p60.mp4');
    const f = path.join(dir, manifest.文件.分享版!);
    expect(videoInfo(f)).toMatchObject({ 宽: 1920, 高: 1080 });
    expect(manifest.分享版?.视频kbps).toBe(2750);
    expect(manifest.分享版?.真峰值dBTP).toBeLessThanOrEqual(-1);
  });
});
