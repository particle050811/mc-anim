// anim verify frames：纯函数、存了再比的整条流程（Remotion 换成假的，png 内容由帧号和「这一轮的改动」定）。数据根、作品都是临时的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunRecord } from '../运行记录/记录.ts';
import { UsageError } from '../cli/参数.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-逐帧校验-'));
process.env.ANIM_DATA = dataRoot;
const fake = vi.hoisted(() => ({ 指纹: 'a'.repeat(64), changedFrames: new Set<number>(), renderCalls: [] as { 帧: number[]; withAudio: boolean }[], 打包: 0, 闸: 0, thumb: false, missingTerrain: new Set<string>(), lookPrevFrame: false }));

const makeSegmentInfo = (segKey: string, frameCount: number) => ({ 键: segKey, segmentName: segKey, 章: 0, 编号: null, 目录: `/没有/${segKey}`, 段: { 帧数: frameCount, fps: 24, 宽: 320, 高: 180 } });
const firstSegment = makeSegmentInfo('甲', 5);
const secondSeg = makeSegmentInfo('乙', 3);
vi.mock('../环境/温度.ts', () => {
  const noTempReading = () => ({ 芯片最高温: null, 发热等级: null });
  return { readTemperature: vi.fn(noTempReading), readTempParallel: vi.fn(async () => noTempReading()), noTempReading };
});
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<typeof import('../环境/作品.ts')>()), workName: () => '假作品', workRoot: () => dataRoot }));
// 切片参数、输出帧数取自 段产物（这里输出帧数就当段长）；全部段 只给 段产物 算字幕、全片位置用
vi.mock('../渲/段产物.ts', () => ({
  segmentProducts: async (allFlag: unknown, segments: { 键: string; 段: { 帧数: number } }[]) => segments.map((s) => ({ 段: s, 画面指纹: { 段: s.键, 指纹: fake.指纹, 项: { 地形: {} } }, outputFrames: s.段.帧数, 参数: {} })),
}));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<typeof import('../清单/清单.ts')>()), loadAllSegments: async () => [] }));
vi.mock('../闸/闸.ts', async (actual) => ({ ...(await actual<typeof import('../闸/闸.ts')>()), passRenderGate: <T>(fn: () => Promise<T>) => (fake.闸++, fn()) }));
vi.mock('../分发/随仓库.ts', () => ({ fillBytesAndReport: () => {} }));
vi.mock('../渲/求解缓存收集.ts', () => ({ waitSolveCacheWrites: async () => {}, collectSolveCache: () => {} }));
vi.mock('../渲/渲.ts', async (actual) => ({
  ...(await actual<typeof import('../渲/渲.ts')>()),
  missingLocalTerrain: (s: { 键: string }) => (fake.missingTerrain.has(s.键) ? '某包' : null),
  openSession: async (level: string, fn: (h: unknown) => Promise<unknown>) => (fake.打包++, fn({ compositions: [] })),
  findComposition: (_h: unknown, s: { 键: string }) => ({ id: s.键 }),
  renderFramesSamePage: async (_h: unknown, _c: unknown, frames: number[], o: { withAudio: boolean; onFrame: (b: Buffer, f: number) => void }) => {
    fake.renderCalls.push({ 帧: [...frames], withAudio: o.withAudio });
    // 看前一帧：照真实情况，一帧的结果随同页面前一帧变
    let prev = -1;
    for (const f of frames) {
      o.onFrame(Buffer.alloc(fake.thumb ? 10 : 100_000, `${f}${fake.changedFrames.has(f) ? '改' : ''}${fake.lookPrevFrame ? `接${prev}` : ''}`), f);
      prev = f;
    }
  },
}));

const { runPerFrame, parseFrames, frameNumText, pickRenderFrames, compareChecks, checkFile, writeCheckRecord, readCheckRecord } = await import('./逐帧校验.ts');
const makeRunRecord = () => {
  const eventMessages: string[] = [];
  return { log: (_: string, m: string) => eventMessages.push(m), 阶段: [], 产物: [] as string[], 事件: eventMessages } as unknown as RunRecord & { 事件: string[] };
};
const runFrameCheck = (segments: unknown[], o: { checkMode: '存' | '比'; 名: string; 帧?: number[]; keepDir?: string }, r = makeRunRecord()) => runPerFrame(segments as never, { 帧: null, keepDir: null, ...o, runRecord: r });

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
beforeEach(() => {
  fs.rmSync(path.join(dataRoot, 'run'), { recursive: true, force: true });
  Object.assign(fake, { 指纹: 'a'.repeat(64), changedFrames: new Set(), renderCalls: [], 打包: 0, 闸: 0, thumb: false, missingTerrain: new Set(), lookPrevFrame: false });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('纯函数', () => {
  it('--frames 认 a-b 和逗号列表，逗号的去重排序；写错了报用法错误', () => {
    expect(parseFrames('3-5')).toEqual([3, 4, 5]);
    expect(parseFrames('85,30,85')).toEqual([30, 85]);
    expect(() => parseFrames('5-3')).toThrow(UsageError);
    expect(() => parseFrames('a')).toThrow(UsageError);
    expect(() => parseFrames('1,')).toThrow(UsageError);
  });
  it('帧号文本把连续的并起来', () => {
    expect(frameNumText([3, 5, 6, 7, 12])).toBe('3、5-7、12');
    expect(frameNumText([])).toBe('');
  });
  it('定要渲的帧：不给就是整段或基准存的帧，比的时候给了就从基准第一帧渲到要的最后一帧，超出段长的另报', () => {
    expect(pickRenderFrames(3, null, null)).toEqual({ toRender: [0, 1, 2], outOfRange: [], missingInBase: [] });
    expect(pickRenderFrames(5, [1, 9], null)).toEqual({ toRender: [1], outOfRange: [9], missingInBase: [] });
    expect(pickRenderFrames(5, null, [1, 3])).toEqual({ toRender: [1, 3], outOfRange: [], missingInBase: [] });
    expect(pickRenderFrames(5, [1, 2], [1, 3])).toEqual({ toRender: [1], outOfRange: [], missingInBase: [2] });
    expect(pickRenderFrames(5, [3], [0, 1, 3, 4])).toEqual({ toRender: [0, 1, 3], outOfRange: [], missingInBase: [] });
    expect(pickRenderFrames(5, [4], [1, 3])).toEqual({ toRender: [], outOfRange: [], missingInBase: [4] });
    expect(pickRenderFrames(2, null, [1, 3])).toEqual({ toRender: [1], outOfRange: [3], missingInBase: [] });
  });
  it('比校验只比这次渲了的帧，按帧号排', () => {
    const m = (o: Record<number, string>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), { sha: v, 字节: 1 }]));
    expect(compareChecks(m({ 1: 'x', 2: 'y', 3: 'z' }), m({ 2: 'y', 3: 'q', 1: 'p' }))).toEqual({ 相同: 1, 不同: [{ 帧: 1, 基准: 'x', current: 'p' }, { 帧: 3, 基准: 'z', current: 'q' }] });
  });
  it('记录写了读回来一样；sha 坏了报错', () => {
    const f = path.join(dataRoot, '记录', '甲.tsv');
    const r = { 段: '甲', 段帧数: 5, 指纹: 'b'.repeat(64), 提交: 'abc+未提交改动', 帧: new Map([[7, { sha: 'c'.repeat(64), 字节: 12 }], [2, { sha: 'd'.repeat(64), 字节: 34 }]]) };
    writeCheckRecord(f, r);
    expect(readCheckRecord(f)).toEqual(r);
    expect(fs.readdirSync(path.dirname(f))).toEqual(['甲.tsv']);
    expect(fs.readFileSync(f, 'utf8').split('\n').slice(4, 6)).toEqual(['帧\tsha256\t字节', `2\t${'d'.repeat(64)}\t34`]);
    fs.writeFileSync(f, '1\tzz\t1\n');
    expect(() => readCheckRecord(f)).toThrow(/读不懂/);
  });
});

describe('存了再比', () => {
  it('写到 run/逐帧校验/<作品>/<名>/<段键>.tsv；只打包一次、每段过一次闸、声音开着', async () => {
    expect(await runFrameCheck([firstSegment, secondSeg], { checkMode: '存', 名: '改前' })).toBe(0);
    expect(checkFile('改前', '甲')).toBe(path.join(dataRoot, 'run', '逐帧校验', '假作品', '改前', '甲.tsv'));
    expect([...readCheckRecord(checkFile('改前', '甲')).帧.keys()]).toEqual([0, 1, 2, 3, 4]);
    expect(readCheckRecord(checkFile('改前', '乙')).帧.size).toBe(3);
    expect(fake.打包).toBe(1);
    expect(fake.闸).toBe(2);
    expect(fake.renderCalls.every((x) => x.withAudio)).toBe(true);
  });
  it('只写校验文件：数据根 run/逐帧校验 之外不多母版、段签', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    expect(fs.existsSync(path.join(dataRoot, 'cache'))).toBe(false);
    expect(fs.existsSync(path.join(dataRoot, '段签'))).toBe(false);
  });
  it('已有的不覆盖，一帧都不渲', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    fake.renderCalls = [];
    await expect(runFrameCheck([firstSegment, secondSeg], { checkMode: '存', 名: '改前' })).rejects.toThrow(/已经有 甲/);
    expect(fake.renderCalls).toEqual([]);
  });
  it('全部相同退出码 0；有不同退出码 1、列出帧号和两边的 sha', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前' })).toBe(0);
    fake.changedFrames = new Set([1, 2, 4]);
    const r = makeRunRecord();
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前' }, r)).toBe(1);
    expect(r.事件[0]).toMatch(/5 帧里 3 帧不同（1-2、4）/);
    expect(r.事件[0]).toMatch(/第 4 帧：基准 [0-9a-f]{16}，这次 [0-9a-f]{16}/);
  });
  it('说清段指纹变没变：同一指纹还不同是随机，指纹变了是改了代码', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    fake.changedFrames = new Set([0]);
    const comparison = makeRunRecord();
    await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前' }, comparison);
    expect(comparison.事件[0]).toMatch(/段指纹和存基准时一样/);
    fake.指纹 = 'f'.repeat(64);
    const recorder = makeRunRecord();
    await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前' }, recorder);
    expect(recorder.事件[0]).toMatch(/段指纹变了（基准 aaaaaaaaaaaaaaaa，现在 ffffffffffffffff）/);
  });
  it('不给 --frames 就渲基准存的帧；给了只渲到基准有的最后一帧', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '抽', 帧: [1, 3] });
    fake.renderCalls = [];
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '抽' })).toBe(0);
    expect(fake.renderCalls[0]!.帧).toEqual([1, 3]);
    fake.renderCalls = [];
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '抽', 帧: [3, 4] })).toBe(0);
    expect(fake.renderCalls[0]!.帧).toEqual([1, 3]);
    fake.renderCalls = [];
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '抽', 帧: [1] })).toBe(0);
    expect(fake.renderCalls[0]!.帧).toEqual([1]);
  });
  it('整段存基准后 --compare --frames 只要一帧：不因批次不同误报，说明连前面的帧一起渲', async () => {
    fake.lookPrevFrame = true;
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '全' });
    fake.renderCalls = [];
    const logSpy = vi.mocked(console.log);
    logSpy.mockClear();
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '全', 帧: [3] })).toBe(0);
    expect(fake.renderCalls[0]!.帧).toEqual([0, 1, 2, 3]);
    expect(logSpy.mock.calls.join()).toMatch(/隔开渲比不了.*0-3/);
    expect(logSpy.mock.calls.join()).toMatch(/4 帧全部相同/);
    fake.changedFrames = new Set([2]);
    const r = makeRunRecord();
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '全', 帧: [3] }, r)).toBe(1);
    expect(r.事件[0]).toMatch(/4 帧里 1 帧不同（2）/);
  });
  it('--compare 这段没存过：报出来、别的段照比，退出码 1', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    fake.renderCalls = [];
    const r = makeRunRecord();
    expect(await runFrameCheck([firstSegment, secondSeg], { checkMode: '比', 名: '改前' }, r)).toBe(1);
    expect(r.事件.join()).toMatch(/乙：「改前」里没存过这段/);
    expect(fake.renderCalls).toHaveLength(1);
  });
  it('段变长变短都算不过', async () => {
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' });
    const recorder = makeRunRecord();
    expect(await runFrameCheck([makeSegmentInfo('甲', 4)], { checkMode: '比', 名: '改前' }, recorder)).toBe(1);
    expect(recorder.事件.join()).toMatch(/基准存的这些帧没了：4/);
    const lengthRecords = makeRunRecord();
    expect(await runFrameCheck([makeSegmentInfo('甲', 6)], { checkMode: '比', 名: '改前' }, lengthRecords)).toBe(1);
    expect(lengthRecords.事件.join()).toMatch(/存基准时段有 5 帧，现在 6 帧/);
  });
  it('--save 超出段长的帧不渲，一帧都不剩才算不过', async () => {
    expect(await runFrameCheck([secondSeg], { checkMode: '存', 名: '超', 帧: [1, 9] })).toBe(0);
    expect(fake.renderCalls[0]!.帧).toEqual([1]);
    const r = makeRunRecord();
    expect(await runFrameCheck([secondSeg], { checkMode: '存', 名: '全超', 帧: [9] }, r)).toBe(1);
    expect(r.事件.join()).toMatch(/没有能渲的帧/);
  });
  it('--keep-images：存留全部，比只留不同的帧', async () => {
    const saveDir = path.join(dataRoot, '存图');
    const compareDir = path.join(dataRoot, '比图');
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前', keepDir: saveDir });
    expect(fs.readdirSync(saveDir).sort()).toEqual([0, 1, 2, 3, 4].map((f) => `甲-第000${f}帧.png`));
    fake.changedFrames = new Set([2]);
    await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前', keepDir: compareDir });
    expect(fs.readdirSync(compareDir)).toEqual(['甲-第0002帧.png']);
    fs.rmSync(saveDir, { recursive: true });
    fs.rmSync(compareDir, { recursive: true });
  });
  it('--keep-images 目录里已有这次可能写的 PNG：开跑前就拒，一帧都不渲', async () => {
    const imageDir = path.join(dataRoot, '同一个');
    await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前', keepDir: imageDir });
    fake.renderCalls = [];
    fake.changedFrames = new Set([2]);
    await expect(runFrameCheck([firstSegment], { checkMode: '比', 名: '改前', keepDir: imageDir })).rejects.toThrow(/已经有 5 张.*甲-第0000帧\.png.*换个空目录/);
    expect(fake.renderCalls).toEqual([]);
    fs.rmSync(imageDir, { recursive: true });
    expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前', keepDir: imageDir })).toBe(1);
    expect(fs.readdirSync(imageDir)).toEqual(['甲-第0002帧.png']);
    // 改完再比一次也一样：前一次留的不同帧在里面
    await expect(runFrameCheck([firstSegment], { checkMode: '比', 名: '改前', keepDir: imageDir })).rejects.toThrow(/已经有 1 张/);
    // 别的段、别的帧不撞
    expect(await runFrameCheck([secondSeg], { checkMode: '存', 名: '乙', keepDir: imageDir })).toBe(0);
    fs.rmSync(imageDir, { recursive: true });
  });
  describe('本机缺地形包', () => {
    const verdictText = () => String(vi.mocked(console.log).mock.calls.at(-1)![0]);
    it('--save 跳过，别的段照存，退出码 0，结论说清跳过了谁', async () => {
      fake.missingTerrain = new Set(['乙']);
      expect(await runFrameCheck([firstSegment, secondSeg], { checkMode: '存', 名: '改前' })).toBe(0);
      expect(fs.existsSync(checkFile('改前', '乙'))).toBe(false);
      expect(verdictText()).toMatch(/1 段存好了.*跳过 乙，没存/);
    });
    it('--save 全部跳过：不算存好了，退出码 1', async () => {
      fake.missingTerrain = new Set(['甲']);
      const r = makeRunRecord();
      expect(await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' }, r)).toBe(1);
      expect(r.事件.join()).toMatch(/一段都没存/);
      expect(verdictText()).not.toMatch(/存好了/);
    });
    it('--compare 存过基准的段没渲到：算不过，不说都相同', async () => {
      await runFrameCheck([firstSegment, secondSeg], { checkMode: '存', 名: '改前' });
      fake.renderCalls = [];
      fake.missingTerrain = new Set(['甲']);
      const singleRecorder = makeRunRecord();
      expect(await runFrameCheck([firstSegment], { checkMode: '比', 名: '改前' }, singleRecorder)).toBe(1);
      expect(singleRecorder.事件.join()).toMatch(/甲：「改前」里存过这段，但本机没有区段包 某包，没比到/);
      expect(verdictText()).not.toMatch(/都相同/);
      expect(fake.renderCalls).toEqual([]);
      const multiRecorder = makeRunRecord();
      expect(await runFrameCheck([firstSegment, secondSeg], { checkMode: '比', 名: '改前' }, multiRecorder)).toBe(1);
      expect(fake.renderCalls[0]!.帧).toEqual([0, 1, 2]);
      expect(verdictText()).toMatch(/1 处没过；跳过 甲，没比/);
    });
    it('--compare 没存过基准的段也缺包（存的时候就跳过了）：只跳过；一段都没比才算不过', async () => {
      fake.missingTerrain = new Set(['乙']);
      await runFrameCheck([firstSegment, secondSeg], { checkMode: '存', 名: '改前' });
      expect(await runFrameCheck([firstSegment, secondSeg], { checkMode: '比', 名: '改前' })).toBe(0);
      expect(verdictText()).toMatch(/1 段都相同；跳过 乙，没比/);
      const r = makeRunRecord();
      expect(await runFrameCheck([secondSeg], { checkMode: '比', 名: '改前' }, r)).toBe(1);
      expect(r.事件.join()).toMatch(/一段都没比/);
    });
  });
  it('PNG 小得像纯色：提醒，不拦', async () => {
    fake.thumb = true;
    const r = makeRunRecord();
    expect(await runFrameCheck([firstSegment], { checkMode: '存', 名: '改前' }, r)).toBe(0);
    expect(r.事件.join()).toMatch(/可能是纯色.*0-4/);
  });
});
