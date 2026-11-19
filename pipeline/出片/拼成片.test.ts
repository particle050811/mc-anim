// anim film 的拼接（拼成片.ts）：两段现造的成片切片（60 帧输出）直接拷流接成一条，查总帧数、拼接表、manifest、
// 声音按段长按样本截、拉到 −16 LUFS，--share 另出 1080p60 AV1。渲染那步（渲段.ts）mock 掉，切片和声音用 ffmpeg 现造。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import type { RunRecord } from '../运行记录/记录.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-拼成片测试-'));
process.env.ANIM_DATA = dataRoot;

const fake = vi.hoisted(() => ({ segments: [] as unknown[], outputs: [] as unknown[], audit: vi.fn() }));
vi.mock('../验收/动作体检命令.ts', () => ({ verifyWorkMotion: fake.audit }));
vi.mock('./渲段.ts', () => ({ renderSegments: async () => fake.outputs }));
vi.mock('./时间轴文件.ts', () => ({ buildFilmTimeline: async () => { throw new Error('测试里不算时间轴'); } }));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<object>()), loadAllSegments: async () => fake.segments }));
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试' }));

const { assembleFilm } = await import('./拼成片.ts');
const { videoInfo } = await import('../渲/探测.ts');
const { codeRoot } = await import('../环境/路径.ts');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const hasAv1 = hasFfmpeg && /libsvtav1/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout);

const makeSeg = (segKey: string, durSec: number): SegInfo =>
  ({
    key: segKey,
    章: 0,
    serial: null,
    segmentName: segKey,
    segmentFile: path.join(codeRoot(), '作品', '测试', '段', segKey, '段.ts'),
    segment: { scene: '测试', sec: durSec, width: 320, height: 180, terrain: [] },
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
  const makeFingerprint = (k: string) => ({ segment: segKey, fingerprint: k.repeat(64).slice(0, 64), items: {} });
  return { segment: makeSeg(segKey, outputFrames / 60), pictureFingerprint: makeFingerprint('a'), soundFingerprint: makeFingerprint('b'), 画面: pictureMp4, sound: soundFile, outputFrames, outputStartFrame, soundStartSec: outputStartFrame / 60, soundEndSec: (outputStartFrame + outputFrames) / 60 };
};

const makeRunRecord = () => ({ log: vi.fn(), artifacts: [] as string[], stage: [] }) as unknown as RunRecord;

describe.skipIf(!hasFfmpeg)('拼成片', () => {
  beforeAll(() => {
    // 2 秒 + 1.55 秒，60 帧输出的窗是 [0, 120)、[120, 213)
    fake.outputs = [makeOutput('甲', 120, 0, 440), makeOutput('乙', 93, 120, 660)];
    fake.segments = (fake.outputs as { segment: SegInfo }[]).map((r) => r.segment);
  });
  afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

  it('两段拷流接成一条：总帧数是各段输出帧之和，拼接表、manifest 记全片起帧（B 站时间轴按它切段），声音按段长截、拉到 −16 LUFS', async () => {
    const mainCut = fake.segments as SegInfo[];
    fake.segments = [{ ...makeSeg('核对-试看', 1), 章: '核对' }, ...mainCut];
    const { dir, film: filmPath, manifest } = await assembleFilm(mainCut, { level: '预览', name: '两段', bounds: ['甲', '乙'], runRecord: makeRunRecord() });
    expect(fake.audit).toHaveBeenCalledOnce();
    fake.segments = mainCut;
    expect(videoInfo(filmPath).frameCount).toBe(213);
    expect(manifest.totalFrameCount).toBe(213);
    expect(manifest.segment.map((s) => [s.key, s.frameCount, s.filmStartFrame])).toEqual([
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
    expect(Math.abs(manifest.loudness.filmLufs - -16)).toBeLessThan(0.5);
    expect(manifest.loudness.truePeakDbtp).toBeLessThanOrEqual(-1);
    expect(fs.existsSync(path.join(dir, '全片-未拉响度.flac'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '_工作'))).toBe(false);
    expect(manifest.shareVersion).toBeNull();
  });

  it.skipIf(!hasAv1)('--share：另出 1080p60 AV1、2750 kbps，文件名带 -分享版1080p60，真峰值不超 −1 dBTP', async () => {
    const { dir, manifest } = await assembleFilm(fake.segments as SegInfo[], { level: '预览', name: '分享', bounds: [], shareVersion: true, runRecord: makeRunRecord() });
    expect(manifest.file.shareVersion).toBe('分享-分享版1080p60.mp4');
    const f = path.join(dir, manifest.file.shareVersion!);
    expect(videoInfo(f)).toMatchObject({ width: 1920, height: 1080 });
    expect(manifest.shareVersion?.videoKbps).toBe(2750);
    expect(manifest.shareVersion?.truePeakDbtp).toBeLessThanOrEqual(-1);
  });
});
