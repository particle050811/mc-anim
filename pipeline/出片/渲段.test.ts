// 渲段（唯一的出片路，决策/0014）的契约：命中已是最新不渲、只在有旧的时候过一张不渲染的清旧票；过期段一段一张 render 票，画面声音同一遍渲成切片（先写临时名、核帧数再改名）、
// 派生段签、删旧、记耗时；帧数不对不留切片；本机没有区段包的段跳过。渲染后端换假的（渲/假后端.ts），切片用 ffmpeg 现造；指纹（段产物）、段签、删旧换成假的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import type { RunRecord } from '../运行记录/记录.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-渲段测试-'));
process.env.ANIM_DATA = dataRoot;

const fake = vi.hoisted(() => ({ fingerprint: {} as Record<string, string>, frameShortfall: 0, hasOld: false }));
const spy = vi.hoisted(() => ({ deriveSegStamp: vi.fn(async () => ({})), deleteOld: vi.fn() }));
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试作品', workRoot: () => path.join(process.env.ANIM_DATA!, '作品') }));
vi.mock('../分发/随仓库.ts', () => ({ fillBytesAndReport: () => {} }));
// 渲染明细的系统采样不读芯片温度（会在数据根建缓存）
vi.mock('../环境/温度.ts', () => {
  const noTempReading = () => ({ chipMaxTemp: null, thermalLevel: null });
  return { readTemperature: noTempReading, readTempParallel: async () => noTempReading(), noTempReading };
});
vi.mock('../验收/段签.ts', () => ({ deriveSegStamp: spy.deriveSegStamp }));
vi.mock('../缓存/钉.ts', () => ({ deleteOld: spy.deleteOld, hasOldToDelete: () => fake.hasOld }));
// 指纹由 fake.fingerprint 定（没给是 a…），路径、输出窗照真的算
vi.mock('../渲/段产物.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../渲/段产物.ts')>();
  return {
    ...actual,
    segmentProducts: async (all: SegInfo[], segs: SegInfo[], level: string) =>
      segs.map((s) => {
        const fp = { segment: s.key, fingerprint: fake.fingerprint[s.key] ?? 'a'.repeat(64), items: { terrain: { 'pack-a': 'v1' } } };
        const w = actual.segOutputWindow(all, s);
        return { segment: s, pictureFingerprint: fp, soundFingerprint: fp, 画面: actual.segPicturePath(s.key, fp.fingerprint), sound: actual.segSoundPath(s.key, fp.fingerprint), outputFrames: w.frameCount, outputStartFrame: w.start, soundStartSec: w.start / 60, soundEndSec: (w.start + w.frameCount) / 60, params: { inputProps: { level }, audioCodec: 'pcm-16' } };
      }),
  };
});

const { renderSegments } = await import('./渲段.ts');
const { expectedComposition } = await import('../渲/渲.ts');
const { fakeBackend } = await import('../渲/假后端.ts');
const { timingLogPath } = await import('../环境/配置.ts');
const { terrainUsageSegEnv, terrainVersionEnv } = await import('../../engine/段/地形环境.ts');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const runFfmpeg = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

const makeSeg = (key: string, sec: number): SegInfo => {
  const dir = path.join(dataRoot, '作品', '段', key);
  fs.mkdirSync(dir, { recursive: true });
  return { key, 章: 0, serial: null, segmentName: key, 目录: dir, segmentFile: path.join(dir, '段.ts'), segment: { scene: '测试', sec, width: 64, height: 36, terrain: [] } } as unknown as SegInfo;
};
const segs = [makeSeg('甲', 0.5), makeSeg('乙', 0.25)];
const makeRunRecord = () => ({ log: vi.fn(), artifacts: [] as string[], stage: [] }) as unknown as RunRecord;

type MediaOpts = { outputLocation: string; separateAudioTo: string; composition: { durationInFrames: number }; envVariables: Record<string, string> };
const setup = () => {
  const calls: MediaOpts[] = [];
  const renderMedia = async (o: MediaOpts) => {
    calls.push(o);
    const n = o.composition.durationInFrames - fake.frameShortfall;
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=60', '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', o.outputLocation]);
    runFfmpeg(['-f', 'lavfi', '-t', String(n / 60), '-i', 'sine=frequency=440:sample_rate=48000', '-ac', '2', '-c:a', 'pcm_s16le', o.separateAudioTo]);
  };
  const f = fakeBackend({ session: { compositions: segs.map((s) => expectedComposition(s, segs, {})) }, renderMedia: renderMedia as never });
  return { ...f, calls };
};
const timingLines = () => (fs.existsSync(timingLogPath()) ? fs.readFileSync(timingLogPath(), 'utf8').split('\n').slice(1).filter(Boolean) : []);
/** 切片目录里的文件（不含 刚用过、指纹 这些旁记） */
const masterFiles = () => (fs.readdirSync(path.join(dataRoot), { recursive: true }) as string[]).filter((f) => /\.(mp4|wav)$/.test(f)).map((f) => path.basename(f)).sort();

beforeEach(() => {
  fs.rmSync(path.join(dataRoot, 'cache'), { recursive: true, force: true });
  fs.rmSync(path.join(dataRoot, 'run'), { recursive: true, force: true });
  Object.assign(fake, { fingerprint: {}, frameShortfall: 0, hasOld: false });
  spy.deriveSegStamp.mockClear();
  spy.deleteOld.mockClear();
  for (const s of segs) fs.rmSync(path.join(s.目录, '本机地形.txt'), { force: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe.skipIf(!hasFfmpeg)('渲段', () => {
  it('过期段：一个会话、一段一张 render 票，画面声音同一遍渲成切片，派生段签、删旧、记耗时', async () => {
    const f = setup();
    const runRecord = makeRunRecord();
    process.env.REMOTION_ANIM_TRIAL = '{"台阶并色":{"off":true}}';
    let outputs;
    try {
      outputs = await renderSegments(segs, segs, '视频', { runRecord, backend: f.backend });
    } finally {
      delete process.env.REMOTION_ANIM_TRIAL;
    }
    expect(f.sessions).toEqual([{ level: '视频', opts: { preload: ['甲', '乙'] } }]);
    expect(f.tickets.map((t) => t.decl)).toEqual([
      { kind: 'render', work: '测试作品', segment: '甲', level: '视频', frameCount: 30, itemCount: 2, canYield: true, purpose: '产出' },
      { kind: 'render', work: '测试作品', segment: '乙', level: '视频', frameCount: 15, itemCount: 2, canYield: true, purpose: '产出' },
    ]);
    // 先写临时名；地形照指纹的地形项、记地形用量；正式切片不混进试看参数
    expect(f.calls.map((c) => path.basename(c.outputLocation))).toEqual([`${'a'.repeat(16)}.渲染中-${process.pid}.mp4`, `${'a'.repeat(16)}.渲染中-${process.pid}.mp4`]);
    expect(f.calls[0]!.separateAudioTo).toMatch(/\.渲染中-\d+\.wav$/);
    expect(JSON.parse(f.calls[0]!.envVariables[terrainVersionEnv]!)).toEqual({ 'pack-a': 'v1' });
    expect(f.calls[0]!.envVariables[terrainUsageSegEnv]).toBe('测试作品/甲');
    expect(f.calls[0]!.envVariables).not.toHaveProperty('REMOTION_ANIM_TRIAL');
    for (const r of outputs) expect([fs.existsSync(r.画面), fs.existsSync(r.sound)]).toEqual([true, true]);
    expect(masterFiles()).toEqual(['aaaaaaaaaaaaaaaa.mp4', 'aaaaaaaaaaaaaaaa.mp4', 'aaaaaaaaaaaaaaaa.wav', 'aaaaaaaaaaaaaaaa.wav']);
    expect(spy.deriveSegStamp).toHaveBeenCalledTimes(2);
    expect(spy.deleteOld.mock.calls.map((c) => c.slice(0, 4))).toEqual([
      ['母版', '甲', '视频', ['a'.repeat(64), 'a'.repeat(64)]],
      ['母版', '乙', '视频', ['a'.repeat(64), 'a'.repeat(64)]],
    ]);
    expect(timingLines().map((l) => l.split('\t').slice(1, 4).filter((_, i) => i !== 1))).toEqual([['render:测试作品/甲:视频', '0'], ['render:测试作品/乙:视频', '0']]);
    expect(runRecord.artifacts).toEqual(outputs.flatMap((r) => [r.画面, r.sound]));
  });

  it('已是最新：不开会话、不渲；有旧的才过一张不渲染的清旧票删旧', async () => {
    await renderSegments(segs, segs, '视频', { runRecord: makeRunRecord(), backend: setup().backend });
    spy.deleteOld.mockClear();
    const f = setup();
    await renderSegments(segs, segs, '视频', { runRecord: makeRunRecord(), backend: f.backend });
    expect([f.sessions, f.calls, f.tickets, spy.deleteOld.mock.calls]).toEqual([[], [], [], []]);
    fake.hasOld = true;
    await renderSegments(segs, [segs[0]!], '视频', { runRecord: makeRunRecord(), backend: f.backend });
    expect([f.sessions, f.calls]).toEqual([[], []]);
    expect(f.tickets).toEqual([{ gate: 'render', decl: { kind: '清命中的旧', noRender: true } }]);
    expect(spy.deleteOld.mock.calls.map((c) => c.slice(0, 4))).toEqual([['母版', '甲', '视频', ['a'.repeat(64), 'a'.repeat(64)]]]);
  });

  it('--rerender 已是最新的也重渲；只渲一段的票不让路', async () => {
    await renderSegments(segs, [segs[1]!], '视频', { runRecord: makeRunRecord(), backend: setup().backend });
    const f = setup();
    await renderSegments(segs, [segs[1]!], '视频', { rerender: true, runRecord: makeRunRecord(), backend: f.backend });
    expect(f.calls).toHaveLength(1);
    expect(f.tickets[0]!.decl).toMatchObject({ segment: '乙', itemCount: 1, canYield: false });
  });

  it('帧数和输出窗对不上：报错，不留切片和临时文件，不派生段签、不删旧，耗时记失败', async () => {
    fake.frameShortfall = 1;
    fake.fingerprint = { 甲: 'b'.repeat(64) };
    await expect(renderSegments(segs, [segs[0]!], '视频', { runRecord: makeRunRecord(), backend: setup().backend })).rejects.toThrow(/甲 渲出来 29 帧，按全片位置应该是 30 帧/);
    expect(masterFiles()).toEqual([]);
    expect(spy.deriveSegStamp).not.toHaveBeenCalled();
    expect(spy.deleteOld).not.toHaveBeenCalled();
    expect(timingLines().map((l) => l.split('\t')[3])).toEqual(['1']);
  });

  it('本机没有区段包的段跳过，别的照渲', async () => {
    fs.writeFileSync(path.join(segs[0]!.目录, '本机地形.txt'), '没烘的包\n');
    const f = setup();
    const outputs = await renderSegments(segs, segs, '视频', { runRecord: makeRunRecord(), backend: f.backend });
    expect(outputs.map((r) => r.segment.key)).toEqual(['乙']);
    expect(f.tickets.map((t) => t.decl.segment)).toEqual(['乙']);
  });
});
