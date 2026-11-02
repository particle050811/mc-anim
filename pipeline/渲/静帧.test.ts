// anim still 的两条路：多帧默认同页连出、--逐帧 每帧新页面。Remotion 换成假的，只看调了谁、写了哪些文件。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const 假 = vi.hoisted(() => ({ 连出: [] as Record<string, unknown>[], 单帧: [] as number[] }));
vi.mock('./渲染器.ts', async (原) => ({
  ...(await 原<typeof import('./渲染器.ts')>()),
  renderFrames: async (o: { frames: number[]; onFrameBuffer: (b: Buffer, f: number) => void }) => {
    假.连出.push(o);
    for (const f of [...o.frames].sort((a, b) => a - b)) await o.onFrameBuffer(Buffer.from(String(f)), f);
  },
  renderStill: async (o: { frame: number; output: string; overwrite: boolean }) => {
    假.单帧.push(o.frame);
    fs.writeFileSync(o.output, String(o.frame), { flag: o.overwrite ? 'w' : 'wx' });
  },
}));
const { 出静帧们, 同页出帧, 静帧文件, 连出提醒 } = await import('./渲.ts');

const 出到 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-静帧-'));
const h = { serveUrl: '/包', browser: {}, 参数: { inputProps: {}, gl: 'angle', scale: 2 } } as never;
const 组合 = { id: '甲' } as never;
const 跑 = (帧们: number[], 逐帧?: boolean) => {
  const 进度: number[] = [];
  return 出静帧们(h, 组合, '甲', 帧们, 出到, { 逐帧, 环境: { 段标记: '甲' }, 完成: (n) => 进度.push(n) }).then(() => 进度);
};

afterAll(() => fs.rmSync(出到, { recursive: true, force: true }));
beforeEach(() => {
  fs.rmSync(出到, { recursive: true, force: true });
  fs.mkdirSync(出到);
  假.连出 = [];
  假.单帧 = [];
});

describe('静帧', () => {
  it('多帧默认同一页面出：并发 1、声音关着（和 renderStill 一样）、文件名和逐帧相同、进度逐帧走', async () => {
    expect(await 跑([85, 30, 140])).toEqual([1, 2, 3]);
    expect(假.单帧).toEqual([]);
    expect(假.连出).toHaveLength(1);
    expect(假.连出[0]).toMatchObject({ frames: [85, 30, 140], concurrency: 1, muted: true, imageFormat: 'png', scale: 2, outputDir: null, logLevel: 'verbose' });
    expect(fs.readdirSync(出到).sort()).toEqual(['甲-第0030帧.png', '甲-第0085帧.png', '甲-第0140帧.png']);
    expect(fs.readFileSync(静帧文件(出到, '甲', 85), 'utf8')).toBe('85');
  });
  it('--逐帧 每帧一次 renderStill，按给的顺序，文件名一样', async () => {
    expect(await 跑([85, 30], true)).toEqual([1, 2]);
    expect(假.连出).toEqual([]);
    expect(假.单帧).toEqual([85, 30]);
    expect(fs.readdirSync(出到).sort()).toEqual(['甲-第0030帧.png', '甲-第0085帧.png']);
  });
  it('只有一帧不走连出', async () => {
    await 跑([7]);
    expect(假.连出).toEqual([]);
    expect(假.单帧).toEqual([7]);
  });
  it('连出不覆盖已有的文件', async () => {
    fs.writeFileSync(静帧文件(出到, '甲', 30), '旧');
    await expect(跑([30, 85])).rejects.toThrow(/EEXIST/);
    expect(fs.readFileSync(静帧文件(出到, '甲', 30), 'utf8')).toBe('旧');
  });
  it('多帧连出才提醒帧随批变，一帧和 --逐帧 不提醒', () => {
    expect(连出提醒('甲', [0, 85])).toMatch(/甲 这 2 帧在同一页面连出.*--逐帧/);
    expect(连出提醒('甲', [85])).toBeNull();
    expect(连出提醒('甲', [0, 85], true)).toBeNull();
  });
  it('逐帧校验走的同页出帧可以开声音（照 renderMedia）', async () => {
    await 同页出帧(h, 组合, [1], { 打开声音: true, 环境: {}, 每帧: () => {} });
    expect(假.连出[0]).toMatchObject({ muted: false, frames: [1] });
  });
});
