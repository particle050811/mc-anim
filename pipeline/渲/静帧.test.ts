// anim still 的两条路：多帧默认同页连出、--per-frame 每帧新页面。Remotion 换成假的，只看调了谁、写了哪些文件。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ multiFrameCalls: [] as Record<string, unknown>[], singleFrames: [] as number[] }));
vi.mock('./渲染器.ts', async (actual) => ({
  ...(await actual<typeof import('./渲染器.ts')>()),
  renderFrames: async (o: { frames: number[]; onFrameBuffer: (b: Buffer, f: number) => void }) => {
    fake.multiFrameCalls.push(o);
    for (const f of [...o.frames].sort((a, b) => a - b)) await o.onFrameBuffer(Buffer.from(String(f)), f);
  },
  renderStill: async (o: { frame: number; output: string; overwrite: boolean }) => {
    fake.singleFrames.push(o.frame);
    fs.writeFileSync(o.output, String(o.frame), { flag: o.overwrite ? 'w' : 'wx' });
  },
}));
const { renderStills, renderFramesSamePage, stillFile, batchHint } = await import('./渲.ts');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-静帧-'));
const h = { serveUrl: '/包', browser: {}, 参数: { inputProps: {}, gl: 'angle', scale: 2 } } as never;
const composition = { id: '甲' } as never;
const renderWithProgress = (frames: number[], frameByFrame?: boolean) => {
  const progressSteps: number[] = [];
  return renderStills(h, composition, '甲', frames, outDir, { frameByFrame, 环境: { 段标记: '甲' }, 完成: (n) => progressSteps.push(n) }).then(() => progressSteps);
};

afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));
beforeEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir);
  fake.multiFrameCalls = [];
  fake.singleFrames = [];
});

describe('静帧', () => {
  it('多帧默认同一页面出：并发 1、声音关着（和 renderStill 一样）、文件名和逐帧相同、进度逐帧走', async () => {
    expect(await renderWithProgress([85, 30, 140])).toEqual([1, 2, 3]);
    expect(fake.singleFrames).toEqual([]);
    expect(fake.multiFrameCalls).toHaveLength(1);
    expect(fake.multiFrameCalls[0]).toMatchObject({ frames: [85, 30, 140], concurrency: 1, muted: true, imageFormat: 'png', scale: 2, outputDir: null, logLevel: 'verbose' });
    expect(fs.readdirSync(outDir).sort()).toEqual(['甲-第0030帧.png', '甲-第0085帧.png', '甲-第0140帧.png']);
    expect(fs.readFileSync(stillFile(outDir, '甲', 85), 'utf8')).toBe('85');
  });
  it('--per-frame 每帧一次 renderStill，按给的顺序，文件名一样', async () => {
    expect(await renderWithProgress([85, 30], true)).toEqual([1, 2]);
    expect(fake.multiFrameCalls).toEqual([]);
    expect(fake.singleFrames).toEqual([85, 30]);
    expect(fs.readdirSync(outDir).sort()).toEqual(['甲-第0030帧.png', '甲-第0085帧.png']);
  });
  it('只有一帧不走连出', async () => {
    await renderWithProgress([7]);
    expect(fake.multiFrameCalls).toEqual([]);
    expect(fake.singleFrames).toEqual([7]);
  });
  it('连出不覆盖已有的文件', async () => {
    fs.writeFileSync(stillFile(outDir, '甲', 30), '旧');
    await expect(renderWithProgress([30, 85])).rejects.toThrow(/EEXIST/);
    expect(fs.readFileSync(stillFile(outDir, '甲', 30), 'utf8')).toBe('旧');
  });
  it('多帧连出才提醒帧随批变，一帧和 --per-frame 不提醒', () => {
    expect(batchHint('甲', [0, 85])).toMatch(/甲 这 2 帧在同一页面连出.*--per-frame/);
    expect(batchHint('甲', [85])).toBeNull();
    expect(batchHint('甲', [0, 85], true)).toBeNull();
  });
  it('逐帧校验走的同页出帧可以开声音（照 renderMedia）', async () => {
    await renderFramesSamePage(h, composition, [1], { withAudio: true, 环境: {}, onFrame: () => {} });
    expect(fake.multiFrameCalls[0]).toMatchObject({ muted: false, frames: [1] });
  });
});
