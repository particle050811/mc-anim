import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCompositions, renderMedia } from './渲染器.ts';

const fake = vi.hoisted(() => ({
  目录: '', time: 100_000, input: 'remotionshm', readCompositionsMs: [] as number[], firstFrameMs: [] as number[],
  env: [] as Record<string, string>[], paramsUnchanged: true, packDeleted: false,
  browser: { newPage: vi.fn(), close: vi.fn(async () => {}) },
}));
const hashFileName = '0123456789abcdef.json';
const content = '{"层":"核对","值":123}';
vi.mock('../环境/配置.ts', () => ({ solveCacheDir: () => fake.目录 }));
vi.mock('../环境/作品.ts', () => ({ workName: () => '测试作品', workRoot: () => fake.目录 }));
vi.mock('../资产/资产锁.ts', () => ({ withSegResourcePack: <T>(workRoot: string, segKey: string, fn: () => T) => fn() }));
vi.mock('../环境/路径.ts', () => ({ codeRoot: () => process.cwd() }));
vi.mock('../清单/清单.ts', () => ({ selectSegs: async () => [{ key: '核对-冒烟', segment: { sec: 1 } }], loadAllSegments: async () => [{ key: '核对-冒烟', segment: { sec: 1 } }] }));
vi.mock('../闸/闸.ts', () => ({ passRenderGate: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('../运行记录/阶段.ts', () => ({ recordPhase: () => ({}) }));
vi.mock('./渲.ts', () => ({ bundleProject: async () => { fake.time += 1000; return '测试打包'; }, findComposition: (h: { compositions: unknown[] }) => h.compositions[0] }));
vi.mock('./段产物.ts', () => ({ segPictureParams: () => [{ inputProps: {}, gl: 'angle', scale: 1 }], segOutputWindow: () => ({ start: 0, frameCount: 2 }) }));
vi.mock('./打包残留.ts', () => ({ removeBundles: () => { fake.packDeleted = true; } }));
vi.mock('./设置.ts', () => ({ frameTimeoutMs: 30000 }));
vi.mock('./地形注入.ts', () => ({ segRenderEnv: () => ({}), segTerrainNow: () => ({}) }));
vi.mock('./地形用量.ts', () => ({ collectTerrainUsage: () => {}, recordMeasuredFrames: async () => {}, waitTerrainUsageWrites: async () => {} }));
vi.mock('../运行记录/渲染明细.ts', () => ({ DetailCollector: class {
  frameDone() {}
  async pack<T>(fn: () => Promise<T>) { return fn(); }
  async writeOut(phase: unknown, env: Record<string, string>) {
    fake.env.push(env);
    return { file: null, detail: { summary: { medianMs: 20, p90Ms: 20, p99Ms: 20, slowestFrames: [] }, waiting: [] } };
  }
} }));
vi.mock('./浏览器.ts', () => ({ prepareBrowser: async () => '/假/chrome-headless-shell' }));
vi.mock('./渲染器.ts', () => ({
  openBrowser: vi.fn(async () => { fake.time += 500; return fake.browser; }),
  getCompositions: vi.fn(async () => {
    const page = await fake.browser.newPage();
    const advanceMs = fs.existsSync(path.join(fake.目录, hashFileName)) ? 2800 : 14100;
    fake.time += advanceMs;
    fake.readCompositionsMs.push(advanceMs);
    // 和 Remotion cleanupPage 一样不等 close；测试实际收集器的等待接口，而不是直接假定缓存写好了。
    void page.close();
    return [{ id: '核对-冒烟' }];
  }),
  renderMedia: vi.fn(async (o: {
    disableSharedMemoryCapture?: boolean;
    ffmpegOverride: (p: { type: 'pre-stitcher' | 'stitcher'; args: string[] }) => string[];
    onProgress: (p: { renderedFrames: number }) => void;
  }) => {
    const args = ['-f', o.disableSharedMemoryCapture ? 'image2pipe' : fake.input, '-i', '-'];
    fake.paramsUnchanged &&= o.ffmpegOverride({ type: 'pre-stitcher', args }) === args;
    o.ffmpegOverride({ type: 'stitcher', args: ['-i', 'pre-encode.mkv', '-f', 'matroska'] });
    const firstFrameMs = fs.existsSync(path.join(fake.目录, hashFileName)) ? 300 : 12300;
    fake.firstFrameMs.push(firstFrameMs);
    fake.time += firstFrameMs;
    o.onProgress({ renderedFrames: 1 });
    fake.time += 20;
    o.onProgress({ renderedFrames: 2 });
    fake.time += 10;
  }),
}));
import { bench } from './测速.ts';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(fake, { 目录: fs.mkdtempSync(path.join(os.tmpdir(), 'anim-测速测试-')), time: 100_000, input: 'remotionshm', readCompositionsMs: [], firstFrameMs: [], env: [], paramsUnchanged: true, packDeleted: false });
  fake.browser = { newPage: vi.fn(), close: vi.fn(async () => {}) };
  fake.browser.newPage.mockImplementation(async () => ({
    _client: () => ({ send: async () => {
      await Promise.resolve();
      return { result: { value: JSON.stringify(fs.existsSync(path.join(fake.目录, hashFileName)) ? {} : { [hashFileName]: content }) } };
    } }),
    close: async () => {},
  }));
  vi.spyOn(Date, 'now').mockImplementation(() => fake.time);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { fs.rmSync(fake.目录, { recursive: true, force: true }); vi.restoreAllMocks(); });

const warmCache = () => fs.writeFileSync(path.join(fake.目录, hashFileName), content);

describe('测速', () => {
  it('缺缓存时先落盘，冷读不计时；重读和首帧均命中，结果及输出交代准备', async () => {
    const r = await bench({ segment: '核对-冒烟', count: 2 });
    expect(fake.readCompositionsMs).toEqual([14100, 2800]);
    expect(fake.firstFrameMs).toEqual([300, 300]);
    expect(r.求解缓存准备).toEqual({ 新写: 1, sec: 14.1 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮.map((x) => x.首帧秒)).toEqual([0.3, 0.3]);
    expect(r.轮.map((x) => x.totalSec)).toEqual([0.33, 0.33]);
    expect(r.打包秒).toBe(1);
    expect(r.开浏览器秒).toBe(0.5);
    expect(fs.readFileSync(path.join(fake.目录, hashFileName))).toEqual(Buffer.from(content));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('不计入测速阶段'));
    expect(fake.browser.close).toHaveBeenCalledOnce();
    expect(fake.packDeleted).toBe(true);
  });

  it('已有缓存不多开组合页、不重写，也没有准备耗时', async () => {
    warmCache();
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const r = await bench({ segment: '核对-冒烟' });
    expect(getCompositions).toHaveBeenCalledOnce();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(r.求解缓存准备).toEqual({ 新写: 0, sec: 0 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮[0]!.首帧秒).toBe(0.3);
  });

  it.each([
    ['remotionshm', false, false, true],
    ['image2pipe', false, false, false],
    ['image2pipe', false, true, false],
    ['remotionshm', false, true, true],
    ['remotionshm', true, false, false],
  ] as const)('输入 %s，禁用 %s，不收日志 %s：实际共享内存 %s', async (inputSource, disableSharedMemory, noLogCollect, expected) => {
    warmCache();
    fake.input = inputSource;
    const r = await bench({ segment: '核对-冒烟', disableSharedMemory, noLogCollect });
    expect(r.sharedMemory).toBe(expected);
    expect(r.轮[0]!.sharedMemory).toBe(expected);
    expect(fake.env[0]!.sharedMemory).toBe(String(expected));
    expect(fake.paramsUnchanged).toBe(true);
    expect(renderMedia).toHaveBeenCalledOnce();
  });
});
