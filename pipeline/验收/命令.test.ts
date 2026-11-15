// verify 和切片（用户 11-02 定换比法，11-06 定只比切片）：哈希和认可版不一样的帧直接解切片，比小块平均颜色，编码噪声在门槛以下照样过；
// 段签记的切片没了、又要看像素，报要重渲才能验收，accept 也拒（认可参考要从这版的切片抽）；CRF1 时代的认可（尺寸、帧数对不上）报要重新认可。
// 数据根、作品都是临时的；渲染换成假的（记下要渲哪几段）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunRecord } from '../运行记录/记录.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-验收命令-'));
process.env.ANIM_DATA = dataRoot;
const workRoot = path.join(dataRoot, '假作品');
const fingerprintOf = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const current = vi.hoisted(() => ({ 指纹: '' }));
const readPixelCalls = vi.hoisted(() => [] as string[]);
const renderCalls = vi.hoisted(() => [] as string[][]);

vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<typeof import('../环境/作品.ts')>()), listWorks: () => new Map([['应力转动', workRoot]]), workRoot: () => workRoot }));
const segmentInfo = { 键: '甲', segmentName: '甲', 章: 0, 编号: null, 段: { 帧数: 48, fps: 24, 宽: 320, 高: 180 } };
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<typeof import('../清单/清单.ts')>()), allSegments: async () => [segmentInfo], selectSegs: async () => [segmentInfo] }));
vi.mock('../闸/闸.ts', async (actual) => ({ ...(await actual<typeof import('../闸/闸.ts')>()), lazyPassGate: () => async () => {}, passGate: <T>(fn: () => Promise<T>) => fn(), passRenderGate: <T>(fn: () => Promise<T>) => fn() }));
// 切片的路径、指纹照真的算法起名，指纹由 当前.指纹 定；测试的切片是 320×180 48 帧
vi.mock('../渲/段产物.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../渲/段产物.ts')>();
  return {
    ...actual,
    segmentProducts: async (allFlag: unknown, segments: { 键: string }[]) =>
      segments.map((s) => {
        const soundFingerprint = fingerprintOf(`${current.指纹}-声`);
        return { 段: s, 画面指纹: { 段: s.键, 指纹: current.指纹, 项: {} }, 声音指纹: { 段: s.键, 指纹: soundFingerprint, 项: {} }, 画面: actual.segPicturePath(s.键, current.指纹), 声音: actual.segSoundPath(s.键, soundFingerprint), outputFrames: 48, outputStartFrame: 0, 参数: { inputProps: { 级别: '视频' } } };
      }),
  };
});
vi.mock('../渲/设置.ts', async (actual) => ({ ...(await actual<typeof import('../渲/设置.ts')>()), masterSize: () => [320, 180] }));
vi.mock('../渲/渲段.ts', () => ({ renderSegments: async (allFlag: unknown, segments: { 键: string }[]) => (renderCalls.push(segments.map((s) => s.键)), []) }));
// 并排图写到临时数据根，不写主检出的 预览/
vi.mock('../预览/预览.ts', async (actual) => ({
  ...(await actual<typeof import('../预览/预览.ts')>()),
  newPreviewDir: (topic: string) => fs.mkdtempSync(path.join(process.env.ANIM_DATA!, `预览-${topic}-`)),
}));
vi.mock('./验收.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./验收.ts')>();
  return { ...actual, scanMaster: (f: string, o: never) => (readPixelCalls.push(f), actual.scanMaster(f, o)) };
});

const { verifyCommands } = await import('./命令.ts');
const { segPicturePath, segSoundPath } = await import('../渲/段产物.ts');
const { readApproval, approvalFile, platformId } = await import('./认可.ts');
const { referenceFile } = await import('./参考.ts');
const { readSidecar } = await import('./参考像素.ts');
const { conversion } = await import('./比较.ts');

const makeRunRecord = () => {
  const eventMessages: string[] = [];
  return { log: (_: string, m: string) => eventMessages.push(m), 产物: [] as string[], 事件: eventMessages } as unknown as RunRecord & { 事件: string[] };
};
/** 一份切片（mp4 不带声音）和配的 wav；带颗粒噪声，亮一级：整片 Y 加 1，哈希都变、肉眼看不出 */
const makeFixture = (seed: string, brightenByOne = false) => {
  const picturePath = segPicturePath('甲', seed);
  fs.mkdirSync(path.dirname(picturePath), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=24:duration=2,noise=alls=20:allf=t${brightenByOne ? ',lutyuv=y=val+1' : ''}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0', '-threads', '1', '-pix_fmt', 'yuv420p', '-an', picturePath,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const soundResult = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le', '-ac', '2', segSoundPath('甲', fingerprintOf(`${seed}-声`))]);
  if (soundResult.status !== 0) throw new Error(String(soundResult.stderr));
};
const F1 = fingerprintOf('认可那版');
const F2 = fingerprintOf('新的一版');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const runVerify = (args: string[], r = makeRunRecord()) => verifyCommands['verify']!.跑(args, r);

describe.skipIf(!hasFfmpeg)('verify 和切片', () => {
  beforeAll(async () => {
    fs.mkdirSync(workRoot, { recursive: true });
    current.指纹 = F1;
    makeFixture(F1);
    await runVerify(['accept', '甲', '--理由', '测试']);
    expect(readApproval(approvalFile('甲'))?.指纹).toBe(F1);
    // 新指纹：同一画面亮一级（噪声种子固定）
    current.指纹 = F2;
    makeFixture(F2, true);
  });
  afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

  it('accept 记下换算、从这版的切片备好认可参考（带旁记）', () => {
    const approval = readApproval(approvalFile('甲'))!;
    expect(approval.conversion).toBe(conversion);
    expect(readSidecar(referenceFile(approval, platformId()))).toMatchObject({ 来源: '切片', 帧: [0, 24, 47] });
  });

  it('哈希不一样的帧解切片比块平均差，编码噪声在门槛内，过', async () => {
    const logSpy = vi.spyOn(console, 'log');
    try {
      expect(await runVerify(['甲'])).toBe(0);
      const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(printed).toMatch(/✓ 甲：和认可版.*比在阈值内（块差，像素取自认可参考；3 帧有微小差别/);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('段签记的切片没了：要看像素就报要重渲才能验收；accept 也拒；--渲 就把它交给渲段', async () => {
    const picturePath = segPicturePath('甲', F2);
    const backupPath = `${picturePath}.留`;
    fs.renameSync(picturePath, backupPath);
    try {
      readPixelCalls.length = 0;
      renderCalls.length = 0;
      const r = makeRunRecord();
      expect(await runVerify(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toContain('要重渲才能验收（anim film 甲 --重渲）');
      expect(readPixelCalls).toEqual([]);
      await expect(runVerify(['accept', '甲', '--理由', '测试'])).rejects.toThrow(/先 anim film 甲/);
      expect(renderCalls).toEqual([]);
      await runVerify(['--渲', '甲']);
      expect(renderCalls).toEqual([['甲']]);
    } finally {
      fs.renameSync(backupPath, picturePath);
    }
  });

  it('不是现行的认可（CRF1 时代的 1440p）：报要重新认可，不解码', async () => {
    const f = approvalFile('甲');
    const raw = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, raw.replace(/^"宽" = 320$/m, '"宽" = 2560').replace(/^"高" = 180$/m, '"高" = 1440'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(raw);
    try {
      readPixelCalls.length = 0;
      const r = makeRunRecord();
      expect(await runVerify(['甲'], r)).toBe(1);
      expect(r.事件.join('\n')).toMatch(/甲：这段没有现行认可，要重新认可（认可时是 2560×1440 48 帧，现在的切片是 320×180 48 帧/);
      expect(readPixelCalls).toEqual([]);
    } finally {
      fs.writeFileSync(f, raw);
    }
  });

  it('认可记录的抽样间隔和段签不一样：签名里没有要的帧，解切片重算、都比像素，过', async () => {
    const f = approvalFile('甲');
    const raw = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, raw.replace(/^"间隔" = 24$/m, '"间隔" = 7'));
    expect(fs.readFileSync(f, 'utf8')).not.toBe(raw);
    try {
      readPixelCalls.length = 0;
      expect(await runVerify(['甲'])).toBe(0);
      expect(readPixelCalls.filter((x) => x.endsWith('.mp4'))).toHaveLength(1);
    } finally {
      fs.writeFileSync(f, raw);
    }
  });

  it('这版 accept：认可参考从这版的切片抽', async () => {
    await runVerify(['accept', '甲', '--理由', '测试']);
    const approval = readApproval(approvalFile('甲'))!;
    expect(approval.指纹).toBe(F2);
    expect(readSidecar(referenceFile(approval, platformId()))).toMatchObject({ 来源: '切片' });
  });
});
