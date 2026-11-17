// 试看出片（试看.ts + 拼成片.ts 的试看分支）：设了 REMOTION_ANIM_TRIAL 的 anim film 不写切片缓存、不派生不改段签、不删旧切片、不出到 交付/，
// 片子进 run/草稿/<UTC>-工作-试看-<名>/；参数原样转给页面、不给地形用量的段名；--frames 只出一截。Remotion 那步 mock 成 ffmpeg 现造。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import type { RunRecord } from '../运行记录/记录.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-试看出片测试-'));
process.env.ANIM_DATA = dataRoot;
const trialJson = '{"台阶并色":{"off":true}}';

const fake = vi.hoisted(() => ({ segments: [] as unknown[], renderCalls: [] as Record<string, unknown>[] }));
const guard = vi.hoisted(() => ({ renderSegments: vi.fn(), deriveSegStamp: vi.fn(), deleteOld: vi.fn(), writeFingerprint: vi.fn(), markUsed: vi.fn(), startWholeMeasure: vi.fn() }));
const runFfmpeg = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

// 正式出片路上会碰切片、段签的函数：试看一个都不许调
vi.mock('./渲段.ts', () => ({ renderSegments: guard.renderSegments }));
vi.mock('../验收/段签.ts', () => ({ deriveSegStamp: guard.deriveSegStamp }));
vi.mock('../缓存/钉.ts', () => ({ deleteOld: guard.deleteOld, hasOldToDelete: () => false }));
vi.mock('../渲/母版.ts', async (actual) => ({ ...(await actual<object>()), writeFingerprint: guard.writeFingerprint, markUsed: guard.markUsed }));
vi.mock('../渲/地形用量.ts', async (actual) => ({ ...(await actual<object>()), startWholeMeasure: guard.startWholeMeasure }));
// 渲染：不开浏览器，renderMedia 照给的帧范围用 ffmpeg 造画面和声音
vi.mock('../渲/渲.ts', () => ({
  openSession: async (_level: unknown, fn: (h: unknown) => Promise<unknown>) => fn({ serveUrl: '包', browser: {}, params: {}, compositions: [] }),
  findComposition: (_h: unknown, s: SegInfo) => ({ id: s.key, durationInFrames: Math.round(s.segment.sec * 60), fps: 60 }),
  missingLocalTerrain: () => null,
  measureRender: async (_label: unknown, _records: unknown, _t0: unknown, fn: (hooks: object) => Promise<unknown>) => {
    await fn({ logLevel: 'verbose', onProgress: () => {} });
    return { stopTimer: () => {}, writeOut: async () => ({}) };
  },
}));
vi.mock('../渲/渲染器.ts', () => ({
  renderMedia: async (o: { outputLocation: string; separateAudioTo: string; frameRange: [number, number] | null; composition: { durationInFrames: number } }) => {
    fake.renderCalls.push(o);
    const n = o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : o.composition.durationInFrames;
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60', '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', o.outputLocation]);
    runFfmpeg(['-f', 'lavfi', '-t', String(n / 60), '-i', 'sine=frequency=440:sample_rate=48000', '-ac', '2', '-c:a', 'pcm_s16le', o.separateAudioTo]);
  },
}));
vi.mock('../渲/段产物.ts', async (actual) => ({ ...(await actual<object>()), segPictureParams: (_all: unknown, segs: unknown[]) => segs.map(() => ({ inputProps: {}, audioCodec: 'pcm-16' })) }));
vi.mock('../闸/闸.ts', () => ({ passRenderGate: async (fn: () => Promise<unknown>) => fn(), registerTempFile: () => () => {} }));
vi.mock('../资产/资产锁.ts', () => ({ perGroupWithResourcePacks: async <T,>(_root: string, items: T[], _key: unknown, fn: (g: T[]) => Promise<unknown>) => [await fn(items)] }));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<object>()), loadAllSegments: async () => fake.segments }));
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试' }));

const { assembleFilm } = await import('./拼成片.ts');
const { composeCommands } = await import('../合成/命令.ts');
const { videoInfo } = await import('../渲/探测.ts');
const { codeRoot } = await import('../环境/路径.ts');
const { terrainUsageSegEnv } = await import('../../engine/段/地形环境.ts');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const makeSeg = (segKey: string, durSec: number): SegInfo =>
  ({
    key: segKey,
    章: 0,
    serial: null,
    segmentName: segKey,
    目录: path.join(codeRoot(), '作品', '测试', '段', segKey),
    segmentFile: path.join(codeRoot(), '作品', '测试', '段', segKey, '段.ts'),
    segment: { scene: '测试', sec: durSec, width: 320, height: 180, terrain: [] },
  }) as unknown as SegInfo;

const makeRunRecord = () => ({ log: vi.fn(), artifacts: [] as string[], stage: [] }) as unknown as RunRecord;

/** 数据根里除了 run/草稿、run/logs（耗时表）以外的全部文件 */
const filesOutsideDrafts = () =>
  (fs.readdirSync(dataRoot, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dataRoot, f)).isFile() && !f.startsWith(path.join('run', '草稿')) && !f.startsWith(path.join('run', 'logs')));

describe.skipIf(!hasFfmpeg)('试看出片', () => {
  beforeAll(() => {
    process.env.REMOTION_ANIM_TRIAL = trialJson;
    fake.segments = [makeSeg('甲', 2), makeSeg('乙', 1.5)];
  });
  afterAll(() => {
    delete process.env.REMOTION_ANIM_TRIAL;
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  it('--frames 只出一截，片子进 run/草稿/…-工作-试看-<名>/；不写切片缓存、不碰段签和删旧、不进 交付/', async () => {
    const segs = fake.segments as SegInfo[];
    const { dir, film, manifest } = await assembleFilm([segs[1]!], { level: '预览', name: '乙-30-89', bounds: ['乙'], trial: { frames: [30, 89] }, runRecord: makeRunRecord() });
    expect(path.dirname(dir)).toBe(path.join(dataRoot, 'run', '草稿'));
    expect(path.basename(dir)).toMatch(/^\d{4}-\d{4}-工作-试看-乙-30-89$/);
    expect(videoInfo(film).frameCount).toBe(60);
    expect(manifest).toMatchObject({ trial: { REMOTION_ANIM_TRIAL: trialJson }, frames: [30, 89], totalFrameCount: 60 });
    expect(manifest.segment[0]).toMatchObject({ key: '乙', pictureFingerprint: null, soundFingerprint: null, frameCount: 60 });
    const call = fake.renderCalls.at(-1)!;
    expect(call.frameRange).toEqual([30, 89]);
    // 试看参数原样给页面；不给地形用量的段名（页面就不记用量）
    expect(call.envVariables).toMatchObject({ REMOTION_ANIM_TRIAL: trialJson });
    expect(call.envVariables).not.toHaveProperty(terrainUsageSegEnv);
    for (const f of Object.values(guard)) expect(f).not.toHaveBeenCalled();
    expect(filesOutsideDrafts()).toEqual([]);
    expect(fs.existsSync(path.join(dir, '_工作'))).toBe(false);
  });

  it('不给 --frames：选的几段整段渲、接成一条，同样只在草稿里', async () => {
    const { film, manifest } = await assembleFilm(fake.segments as SegInfo[], { level: '预览', name: '两段', bounds: ['甲', '乙'], trial: {}, runRecord: makeRunRecord() });
    expect(videoInfo(film).frameCount).toBe(210);
    expect(manifest.segment.map((s) => [s.key, s.frameCount, s.filmStartFrame])).toEqual([['甲', 120, 0], ['乙', 90, 120]]);
    expect(fake.renderCalls.at(-1)!.frameRange).toBeNull();
    for (const f of Object.values(guard)) expect(f).not.toHaveBeenCalled();
    expect(filesOutsideDrafts()).toEqual([]);
  });

  it('--frames 超出这段、配了几段都报错', async () => {
    const segs = fake.segments as SegInfo[];
    await expect(assembleFilm([segs[1]!], { level: '预览', name: '超', bounds: [], trial: { frames: [0, 90] }, runRecord: makeRunRecord() })).rejects.toThrow(/只有 90 帧/);
    await expect(assembleFilm(segs, { level: '预览', name: '多段', bounds: [], trial: { frames: [0, 9] }, runRecord: makeRunRecord() })).rejects.toThrow(/只能配一段/);
  });

  it('没设试看参数时 film 不认 --frames，设了也不认 --rerender', async () => {
    delete process.env.REMOTION_ANIM_TRIAL;
    try {
      await expect(composeCommands.film!.跑(['乙', '--frames', '0-9'], makeRunRecord())).rejects.toThrow(/只在试看出片时能用/);
    } finally {
      process.env.REMOTION_ANIM_TRIAL = trialJson;
    }
    await expect(composeCommands.film!.跑(['乙', '--rerender'], makeRunRecord())).rejects.toThrow(/不用 --rerender/);
  });
});
