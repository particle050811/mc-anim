import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCompositions, renderMedia } from '@remotion/renderer';

const 假 = vi.hoisted(() => ({
  目录: '', 时间: 100_000, 输入: 'remotionshm', 读组合毫秒: [] as number[], 首帧毫秒: [] as number[],
  环境: [] as Record<string, string>[], 参数没改: true, 打包删了: false,
  browser: { newPage: vi.fn(), close: vi.fn(async () => {}) },
}));
const 文件名 = '0123456789abcdef.json';
const 内容 = '{"层":"核对","值":123}';
vi.mock('../环境/配置.ts', () => ({ 求解缓存目录: () => 假.目录 }));
vi.mock('../环境/作品.ts', () => ({ 作品名: () => '测试作品' }));
vi.mock('../环境/路径.ts', () => ({ 代码根: () => process.cwd() }));
vi.mock('../清单/清单.ts', () => ({ 选段: async () => [{ 键: '核对-冒烟', 段: { 帧数: 2 } }] }));
vi.mock('../闸/闸.ts', () => ({ 过渲染闸: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('../运行记录/阶段.ts', () => ({ 记阶段: () => ({}) }));
vi.mock('./渲.ts', () => ({ 打包: async () => { 假.时间 += 1000; return '测试打包'; } }));
vi.mock('./打包残留.ts', () => ({ 删打包: () => { 假.打包删了 = true; } }));
vi.mock('./设置.ts', () => ({ 渲染参数: () => ({ inputProps: {}, gl: 'angle', scale: 1 }), 等帧超时毫秒: 30000 }));
vi.mock('./地形注入.ts', () => ({ 段渲染环境: () => ({}), 段现在的地形: () => ({}) }));
vi.mock('./地形用量.ts', () => ({ 收地形用量: () => {}, 记已量帧: async () => {}, 等地形用量写完: async () => {} }));
vi.mock('../运行记录/渲染明细.ts', () => ({ 明细收集: class {
  帧完成() {}
  async 包<T>(fn: () => Promise<T>) { return fn(); }
  async 写出(_阶段: unknown, 环境: Record<string, string>) {
    假.环境.push(环境);
    return { 文件: null, 明细: { 小结: { 中位毫秒: 20, P90毫秒: 20, P99毫秒: 20, 最慢帧: [] }, 等待: [] } };
  }
} }));
vi.mock('@remotion/renderer', () => ({
  openBrowser: vi.fn(async () => { 假.时间 += 500; return 假.browser; }),
  getCompositions: vi.fn(async () => {
    const page = await 假.browser.newPage();
    const 毫秒 = fs.existsSync(path.join(假.目录, 文件名)) ? 2800 : 14100;
    假.时间 += 毫秒;
    假.读组合毫秒.push(毫秒);
    // 和 Remotion cleanupPage 一样不等 close；测试实际收集器的等待接口，而不是直接假定缓存写好了。
    void page.close();
    return [{ id: '核对-冒烟' }];
  }),
  renderMedia: vi.fn(async (o: {
    disableSharedMemoryCapture?: boolean;
    ffmpegOverride: (p: { type: 'pre-stitcher' | 'stitcher'; args: string[] }) => string[];
    onProgress: (p: { renderedFrames: number }) => void;
  }) => {
    const args = ['-f', o.disableSharedMemoryCapture ? 'image2pipe' : 假.输入, '-i', '-'];
    假.参数没改 &&= o.ffmpegOverride({ type: 'pre-stitcher', args }) === args;
    o.ffmpegOverride({ type: 'stitcher', args: ['-i', 'pre-encode.mkv', '-f', 'matroska'] });
    const 毫秒 = fs.existsSync(path.join(假.目录, 文件名)) ? 300 : 12300;
    假.首帧毫秒.push(毫秒);
    假.时间 += 毫秒;
    o.onProgress({ renderedFrames: 1 });
    假.时间 += 20;
    o.onProgress({ renderedFrames: 2 });
    假.时间 += 10;
  }),
}));
import { 测速 } from './测速.ts';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(假, { 目录: fs.mkdtempSync(path.join(os.tmpdir(), 'anim-测速测试-')), 时间: 100_000, 输入: 'remotionshm', 读组合毫秒: [], 首帧毫秒: [], 环境: [], 参数没改: true, 打包删了: false });
  假.browser = { newPage: vi.fn(), close: vi.fn(async () => {}) };
  假.browser.newPage.mockImplementation(async () => ({
    _client: () => ({ send: async () => {
      await Promise.resolve();
      return { result: { value: JSON.stringify(fs.existsSync(path.join(假.目录, 文件名)) ? {} : { [文件名]: 内容 }) } };
    } }),
    close: async () => {},
  }));
  vi.spyOn(Date, 'now').mockImplementation(() => 假.时间);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { fs.rmSync(假.目录, { recursive: true, force: true }); vi.restoreAllMocks(); });

const 热缓存 = () => fs.writeFileSync(path.join(假.目录, 文件名), 内容);

describe('测速', () => {
  it('缺缓存时先落盘，冷读不计时；重读和首帧均命中，结果及输出交代准备', async () => {
    const r = await 测速({ 段: '核对-冒烟', 次: 2 });
    expect(假.读组合毫秒).toEqual([14100, 2800]);
    expect(假.首帧毫秒).toEqual([300, 300]);
    expect(r.求解缓存准备).toEqual({ 新写: 1, 秒: 14.1 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮.map((x) => x.首帧秒)).toEqual([0.3, 0.3]);
    expect(r.轮.map((x) => x.总秒)).toEqual([0.33, 0.33]);
    expect(r.打包秒).toBe(1);
    expect(r.开浏览器秒).toBe(0.5);
    expect(fs.readFileSync(path.join(假.目录, 文件名))).toEqual(Buffer.from(内容));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('不计入测速阶段'));
    expect(假.browser.close).toHaveBeenCalledOnce();
    expect(假.打包删了).toBe(true);
  });

  it('已有缓存不多开组合页、不重写，也没有准备耗时', async () => {
    热缓存();
    const 写 = vi.spyOn(fs, 'writeFileSync');
    const r = await 测速({ 段: '核对-冒烟' });
    expect(getCompositions).toHaveBeenCalledOnce();
    expect(写).not.toHaveBeenCalled();
    expect(r.求解缓存准备).toEqual({ 新写: 0, 秒: 0 });
    expect(r.读组合秒).toBe(2.8);
    expect(r.轮[0]!.首帧秒).toBe(0.3);
  });

  it.each([
    ['remotionshm', false, false, true],
    ['image2pipe', false, false, false],
    ['image2pipe', false, true, false],
    ['remotionshm', false, true, true],
    ['remotionshm', true, false, false],
  ] as const)('输入 %s，禁用 %s，不收日志 %s：实际共享内存 %s', async (输入, 关共享内存, 不收日志, 预期) => {
    热缓存();
    假.输入 = 输入;
    const r = await 测速({ 段: '核对-冒烟', 关共享内存, 不收日志 });
    expect(r.共享内存).toBe(预期);
    expect(r.轮[0]!.共享内存).toBe(预期);
    expect(假.环境[0]!.共享内存).toBe(String(预期));
    expect(假.参数没改).toBe(true);
    expect(renderMedia).toHaveBeenCalledOnce();
  });
});
