// bench：会话、出片、闸换成假后端（假后端.ts）；核对冷热求解缓存的计时归属、共享内存的认法、开会话的参数和测速票。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderSession } from './会话.ts';
import { fakeBackend } from './假后端.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-测速测试-'));
process.env.ANIM_DATA = dataRoot;

const fake = vi.hoisted(() => ({ time: 100_000, input: 'remotionshm', load: 1, env: [] as Record<string, string>[] }));
const seg = { key: '核对-冒烟', segment: { sec: 1, width: 1280, height: 720, terrain: [] } };
vi.mock('../环境/作品.ts', () => ({ workName: () => '测试作品', workRoot: () => process.env.ANIM_DATA }));
vi.mock('../清单/清单.ts', () => ({ selectSegs: async () => [seg], loadAllSegments: async () => [seg] }));
vi.mock('../环境/资源.ts', () => ({ load1Min: () => fake.load, coreCount: () => 10 }));
vi.mock('./段产物.ts', () => ({ segPictureParams: () => [{ inputProps: {}, gl: 'angle', scale: 1 }], segOutputWindow: () => ({ start: 0, frameCount: 2 }) }));
vi.mock('./地形注入.ts', () => ({ segRenderEnv: () => ({}), segTerrainNow: () => ({}), trialEnv: () => ({}), trialTerrain: () => [] }));
vi.mock('../运行记录/渲染明细.ts', () => ({ DetailCollector: class {
  frameDone() {}
  async pack<T>(fn: () => Promise<T>) { return fn(); }
  async writeOut(_phase: unknown, env: Record<string, string>) {
    fake.env.push(env);
    return { file: null, detail: { summary: { medianMs: 20, p90Ms: 20, p99Ms: 20, slowestFrames: [] }, waiting: [] } };
  }
} }));

const { bench } = await import('./测速.ts');
const { expectedComposition } = await import('./渲.ts');
const composition = expectedComposition(seg as never, [seg as never], {});

type MediaOpts = { disableSharedMemoryCapture?: boolean; ffmpegOverride: (p: { type: 'pre-stitcher' | 'stitcher'; args: string[] }) => string[]; onProgress: (p: { renderedFrames: number }) => void };
const setup = (cold: boolean) => {
  const calls = { paramsUnchanged: true, rereads: 0 };
  // 冷缓存：会话读列表那一页新写了一份求解缓存（14.1 秒），重读 2.8 秒；首帧都是热的
  const session: Partial<RenderSession> = {
    compositions: [composition],
    seconds: { bundle: 1, browser: 0.5, compositions: cold ? 14.1 : 2.8 },
    solveCache: { 新写: cold ? 1 : 0 },
    readCompositions: async () => {
      calls.rereads++;
      fake.time += 2800;
      return [composition];
    },
  };
  const renderMedia = vi.fn(async (o: MediaOpts) => {
    const args = ['-f', o.disableSharedMemoryCapture ? 'image2pipe' : fake.input, '-i', '-'];
    calls.paramsUnchanged &&= o.ffmpegOverride({ type: 'pre-stitcher', args }) === args;
    o.ffmpegOverride({ type: 'stitcher', args: ['-i', 'pre-encode.mkv', '-f', 'matroska'] });
    fake.time += 300;
    o.onProgress({ renderedFrames: 1 });
    fake.time += 20;
    o.onProgress({ renderedFrames: 2 });
    fake.time += 10;
  });
  return { ...fakeBackend({ session, renderMedia: renderMedia as never }), calls, renderMedia };
};

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
beforeEach(() => {
  vi.restoreAllMocks();
  Object.assign(fake, { time: 100_000, input: 'remotionshm', load: 1, env: [] });
  vi.spyOn(Date, 'now').mockImplementation(() => fake.time);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('测速', () => {
  it('缺缓存时冷读归进准备、重读一次计时；打包、开浏览器照会话报', async () => {
    const f = setup(true);
    const r = await bench({ segment: '核对-冒烟', count: 2, backend: f.backend });
    expect(f.calls.rereads).toBe(1);
    expect(r.求解缓存准备).toEqual({ 新写: 1, sec: 14.1 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮.map((x) => x.首帧秒)).toEqual([0.3, 0.3]);
    expect(r.轮.map((x) => x.totalSec)).toEqual([0.33, 0.33]);
    expect(r.打包秒).toBe(1);
    expect(r.开浏览器秒).toBe(0.5);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('不计入测速阶段'));
  });

  it('已有缓存不重读、没有准备耗时', async () => {
    const f = setup(false);
    const r = await bench({ segment: '核对-冒烟', backend: f.backend });
    expect(f.calls.rereads).toBe(0);
    expect(r.求解缓存准备).toEqual({ 新写: 0, sec: 0 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮[0]!.首帧秒).toBe(0.3);
  });

  it('会话：预载这一段（注册工厂按段懒加载，求解在读组合那页算）、不接着色器缓存，--browser、--verbose 转给开浏览器；一轮一张低优先、要空机器的票', async () => {
    const f = setup(false);
    await bench({ segment: '核对-冒烟', count: 2, verbose: true, browser: '/别的/chrome', backend: f.backend });
    expect(f.sessions).toEqual([{ level: '视频', opts: { shading: false, preload: ['核对-冒烟'], logLevel: 'verbose', browserExecutable: '/别的/chrome', shaderCache: false } }]);
    expect(f.tickets).toHaveLength(2);
    expect(f.tickets[0]).toEqual({ gate: 'render', decl: expect.objectContaining({ kind: 'bench', lowPriority: true, needsLoad: true, loadLimit: 0.6, segment: '核对-冒烟', frameCount: 2, frame: '0-1' }) });
  });

  it('放行时负载已过 核数×0.6 的轮标 incomparable', async () => {
    fake.load = 6;
    const r = await bench({ segment: '核对-冒烟', backend: setup(false).backend });
    expect(r.轮[0]!.load).toEqual({ start: 6, end: 6, incomparable: true });
  });

  it.each([
    ['remotionshm', false, false, true],
    ['image2pipe', false, false, false],
    ['image2pipe', false, true, false],
    ['remotionshm', false, true, true],
    ['remotionshm', true, false, false],
  ] as const)('输入 %s，禁用 %s，不收日志 %s：实际共享内存 %s', async (inputSource, disableSharedMemory, noLogCollect, expected) => {
    fake.input = inputSource;
    const f = setup(false);
    const r = await bench({ segment: '核对-冒烟', disableSharedMemory, noLogCollect, backend: f.backend });
    expect(r.sharedMemory).toBe(expected);
    expect(r.轮[0]!.sharedMemory).toBe(expected);
    expect(fake.env[0]!.sharedMemory).toBe(String(expected));
    expect(f.calls.paramsUnchanged).toBe(true);
    expect(f.renderMedia).toHaveBeenCalledOnce();
  });
});
