// anim verify 逐帧：纯函数、存了再比的整条流程（Remotion 换成假的，png 内容由帧号和「这一轮的改动」定）。数据根、作品都是临时的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 用法错误 } from '../cli/参数.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-逐帧校验-'));
process.env.ANIM_DATA = 数据根;
const 假 = vi.hoisted(() => ({ 指纹: 'a'.repeat(64), 改的帧: new Set<number>(), 渲的: [] as { 帧: number[]; 打开声音: boolean }[], 打包: 0, 闸: 0, 小图: false, 缺地形: new Set<string>(), 看前一帧: false }));

const 段 = (键: string, 帧数: number) => ({ 键, 段名: 键, 章: 0, 编号: null, 目录: `/没有/${键}`, 段: { 帧数, fps: 24, 宽: 320, 高: 180 } });
const 甲 = 段('甲', 5);
const 乙 = 段('乙', 3);
vi.mock('../环境/温度.ts', () => {
  const 无温度 = () => ({ 芯片最高温: null, 发热等级: null });
  return { 读温度: vi.fn(无温度), 读温度并行: vi.fn(async () => 无温度()), 无温度 };
});
vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品名: () => '假作品', 作品根: () => 数据根 }));
vi.mock('../指纹/指纹.ts', () => ({ 算全部段指纹: async (任务: { 段: { 键: string } }[]) => 任务.map((t) => ({ 段: t.段.键, 指纹: 假.指纹, 项: {} })) }));
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 过渲染闸: <T>(fn: () => Promise<T>) => (假.闸++, fn()) }));
vi.mock('../资产/随仓库.ts', () => ({ 补字节并报: () => {} }));
vi.mock('../渲/求解缓存收集.ts', () => ({ 等求解缓存写完: async () => {}, 收求解缓存: () => {} }));
vi.mock('../渲/渲.ts', async (原) => ({
  ...(await 原<typeof import('../渲/渲.ts')>()),
  缺的本机地形: (s: { 键: string }) => (假.缺地形.has(s.键) ? '某包' : null),
  开会话: async (_级别: string, fn: (h: unknown) => Promise<unknown>) => (假.打包++, fn({ 组合: [] })),
  找组合: (_h: unknown, s: { 键: string }) => ({ id: s.键 }),
  同页出帧: async (_h: unknown, _c: unknown, 帧们: number[], o: { 打开声音: boolean; 每帧: (b: Buffer, f: number) => void }) => {
    假.渲的.push({ 帧: [...帧们], 打开声音: o.打开声音 });
    // 看前一帧：照真实情况，一帧的结果随同页面前一帧变
    let 前 = -1;
    for (const f of 帧们) {
      o.每帧(Buffer.alloc(假.小图 ? 10 : 100_000, `${f}${假.改的帧.has(f) ? '改' : ''}${假.看前一帧 ? `接${前}` : ''}`), f);
      前 = f;
    }
  },
}));

const { 跑逐帧校验, 解析帧串, 帧号文本, 定要渲的帧, 比校验, 校验文件, 写校验记录, 读校验记录 } = await import('./逐帧校验.ts');
const 记录 = () => {
  const 事件: string[] = [];
  return { 记: (_: string, m: string) => 事件.push(m), 阶段: [], 产物: [] as string[], 事件 } as unknown as 运行记录 & { 事件: string[] };
};
const 跑 = (段们: unknown[], o: { 模式: '存' | '比'; 名: string; 帧?: number[]; 留图?: string }, r = 记录()) => 跑逐帧校验(段们 as never, { 帧: null, 留图: null, ...o, 记录: r });

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));
beforeEach(() => {
  fs.rmSync(path.join(数据根, 'run'), { recursive: true, force: true });
  Object.assign(假, { 指纹: 'a'.repeat(64), 改的帧: new Set(), 渲的: [], 打包: 0, 闸: 0, 小图: false, 缺地形: new Set(), 看前一帧: false });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('纯函数', () => {
  it('--帧 认 a-b 和逗号列表，逗号的去重排序；写错了报用法错误', () => {
    expect(解析帧串('3-5')).toEqual([3, 4, 5]);
    expect(解析帧串('85,30,85')).toEqual([30, 85]);
    expect(() => 解析帧串('5-3')).toThrow(用法错误);
    expect(() => 解析帧串('a')).toThrow(用法错误);
    expect(() => 解析帧串('1,')).toThrow(用法错误);
  });
  it('帧号文本把连续的并起来', () => {
    expect(帧号文本([3, 5, 6, 7, 12])).toBe('3、5-7、12');
    expect(帧号文本([])).toBe('');
  });
  it('定要渲的帧：不给就是整段或基准存的帧，比的时候给了就从基准第一帧渲到要的最后一帧，超出段长的另报', () => {
    expect(定要渲的帧(3, null, null)).toEqual({ 要渲: [0, 1, 2], 超出: [], 基准没有: [] });
    expect(定要渲的帧(5, [1, 9], null)).toEqual({ 要渲: [1], 超出: [9], 基准没有: [] });
    expect(定要渲的帧(5, null, [1, 3])).toEqual({ 要渲: [1, 3], 超出: [], 基准没有: [] });
    expect(定要渲的帧(5, [1, 2], [1, 3])).toEqual({ 要渲: [1], 超出: [], 基准没有: [2] });
    expect(定要渲的帧(5, [3], [0, 1, 3, 4])).toEqual({ 要渲: [0, 1, 3], 超出: [], 基准没有: [] });
    expect(定要渲的帧(5, [4], [1, 3])).toEqual({ 要渲: [], 超出: [], 基准没有: [4] });
    expect(定要渲的帧(2, null, [1, 3])).toEqual({ 要渲: [1], 超出: [3], 基准没有: [] });
  });
  it('比校验只比这次渲了的帧，按帧号排', () => {
    const m = (o: Record<number, string>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), { sha: v, 字节: 1 }]));
    expect(比校验(m({ 1: 'x', 2: 'y', 3: 'z' }), m({ 2: 'y', 3: 'q', 1: 'p' }))).toEqual({ 相同: 1, 不同: [{ 帧: 1, 基准: 'x', 这次: 'p' }, { 帧: 3, 基准: 'z', 这次: 'q' }] });
  });
  it('记录写了读回来一样；sha 坏了报错', () => {
    const f = path.join(数据根, '记录', '甲.tsv');
    const r = { 段: '甲', 段帧数: 5, 指纹: 'b'.repeat(64), 提交: 'abc+未提交改动', 帧: new Map([[7, { sha: 'c'.repeat(64), 字节: 12 }], [2, { sha: 'd'.repeat(64), 字节: 34 }]]) };
    写校验记录(f, r);
    expect(读校验记录(f)).toEqual(r);
    expect(fs.readdirSync(path.dirname(f))).toEqual(['甲.tsv']);
    expect(fs.readFileSync(f, 'utf8').split('\n').slice(4, 6)).toEqual(['帧\tsha256\t字节', `2\t${'d'.repeat(64)}\t34`]);
    fs.writeFileSync(f, '1\tzz\t1\n');
    expect(() => 读校验记录(f)).toThrow(/读不懂/);
  });
});

describe('存了再比', () => {
  it('写到 run/逐帧校验/<作品>/<名>/<段键>.tsv；只打包一次、每段过一次闸、声音开着', async () => {
    expect(await 跑([甲, 乙], { 模式: '存', 名: '改前' })).toBe(0);
    expect(校验文件('改前', '甲')).toBe(path.join(数据根, 'run', '逐帧校验', '假作品', '改前', '甲.tsv'));
    expect([...读校验记录(校验文件('改前', '甲')).帧.keys()]).toEqual([0, 1, 2, 3, 4]);
    expect(读校验记录(校验文件('改前', '乙')).帧.size).toBe(3);
    expect(假.打包).toBe(1);
    expect(假.闸).toBe(2);
    expect(假.渲的.every((x) => x.打开声音)).toBe(true);
  });
  it('只写校验文件：数据根 run/逐帧校验 之外不多母版、段签', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    expect(fs.existsSync(path.join(数据根, 'cache'))).toBe(false);
    expect(fs.existsSync(path.join(数据根, '段签'))).toBe(false);
  });
  it('已有的不覆盖，一帧都不渲', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    假.渲的 = [];
    await expect(跑([甲, 乙], { 模式: '存', 名: '改前' })).rejects.toThrow(/已经有 甲/);
    expect(假.渲的).toEqual([]);
  });
  it('全部相同退出码 0；有不同退出码 1、列出帧号和两边的 sha', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    expect(await 跑([甲], { 模式: '比', 名: '改前' })).toBe(0);
    假.改的帧 = new Set([1, 2, 4]);
    const r = 记录();
    expect(await 跑([甲], { 模式: '比', 名: '改前' }, r)).toBe(1);
    expect(r.事件[0]).toMatch(/5 帧里 3 帧不同（1-2、4）/);
    expect(r.事件[0]).toMatch(/第 4 帧：基准 [0-9a-f]{16}，这次 [0-9a-f]{16}/);
  });
  it('说清段指纹变没变：同一指纹还不同是随机，指纹变了是改了代码', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    假.改的帧 = new Set([0]);
    const 同 = 记录();
    await 跑([甲], { 模式: '比', 名: '改前' }, 同);
    expect(同.事件[0]).toMatch(/段指纹和存基准时一样/);
    假.指纹 = 'f'.repeat(64);
    const 变 = 记录();
    await 跑([甲], { 模式: '比', 名: '改前' }, 变);
    expect(变.事件[0]).toMatch(/段指纹变了（基准 aaaaaaaaaaaaaaaa，现在 ffffffffffffffff）/);
  });
  it('不给 --帧 就渲基准存的帧；给了只渲到基准有的最后一帧', async () => {
    await 跑([甲], { 模式: '存', 名: '抽', 帧: [1, 3] });
    假.渲的 = [];
    expect(await 跑([甲], { 模式: '比', 名: '抽' })).toBe(0);
    expect(假.渲的[0]!.帧).toEqual([1, 3]);
    假.渲的 = [];
    expect(await 跑([甲], { 模式: '比', 名: '抽', 帧: [3, 4] })).toBe(0);
    expect(假.渲的[0]!.帧).toEqual([1, 3]);
    假.渲的 = [];
    expect(await 跑([甲], { 模式: '比', 名: '抽', 帧: [1] })).toBe(0);
    expect(假.渲的[0]!.帧).toEqual([1]);
  });
  it('整段存基准后 --比 --帧 只要一帧：不因批次不同误报，说明连前面的帧一起渲', async () => {
    假.看前一帧 = true;
    await 跑([甲], { 模式: '存', 名: '全' });
    假.渲的 = [];
    const 日志 = vi.mocked(console.log);
    日志.mockClear();
    expect(await 跑([甲], { 模式: '比', 名: '全', 帧: [3] })).toBe(0);
    expect(假.渲的[0]!.帧).toEqual([0, 1, 2, 3]);
    expect(日志.mock.calls.join()).toMatch(/隔开渲比不了.*0-3/);
    expect(日志.mock.calls.join()).toMatch(/4 帧全部相同/);
    假.改的帧 = new Set([2]);
    const r = 记录();
    expect(await 跑([甲], { 模式: '比', 名: '全', 帧: [3] }, r)).toBe(1);
    expect(r.事件[0]).toMatch(/4 帧里 1 帧不同（2）/);
  });
  it('--比 这段没存过：报出来、别的段照比，退出码 1', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    假.渲的 = [];
    const r = 记录();
    expect(await 跑([甲, 乙], { 模式: '比', 名: '改前' }, r)).toBe(1);
    expect(r.事件.join()).toMatch(/乙：「改前」里没存过这段/);
    expect(假.渲的).toHaveLength(1);
  });
  it('段变长变短都算不过', async () => {
    await 跑([甲], { 模式: '存', 名: '改前' });
    const 短 = 记录();
    expect(await 跑([段('甲', 4)], { 模式: '比', 名: '改前' }, 短)).toBe(1);
    expect(短.事件.join()).toMatch(/基准存的这些帧没了：4/);
    const 长 = 记录();
    expect(await 跑([段('甲', 6)], { 模式: '比', 名: '改前' }, 长)).toBe(1);
    expect(长.事件.join()).toMatch(/存基准时段有 5 帧，现在 6 帧/);
  });
  it('--存 超出段长的帧不渲，一帧都不剩才算不过', async () => {
    expect(await 跑([乙], { 模式: '存', 名: '超', 帧: [1, 9] })).toBe(0);
    expect(假.渲的[0]!.帧).toEqual([1]);
    const r = 记录();
    expect(await 跑([乙], { 模式: '存', 名: '全超', 帧: [9] }, r)).toBe(1);
    expect(r.事件.join()).toMatch(/没有能渲的帧/);
  });
  it('--留图：存留全部，比只留不同的帧', async () => {
    const 存图 = path.join(数据根, '存图');
    const 比图 = path.join(数据根, '比图');
    await 跑([甲], { 模式: '存', 名: '改前', 留图: 存图 });
    expect(fs.readdirSync(存图).sort()).toEqual([0, 1, 2, 3, 4].map((f) => `甲-第000${f}帧.png`));
    假.改的帧 = new Set([2]);
    await 跑([甲], { 模式: '比', 名: '改前', 留图: 比图 });
    expect(fs.readdirSync(比图)).toEqual(['甲-第0002帧.png']);
    fs.rmSync(存图, { recursive: true });
    fs.rmSync(比图, { recursive: true });
  });
  it('--留图 目录里已有这次可能写的 PNG：开跑前就拒，一帧都不渲', async () => {
    const 图 = path.join(数据根, '同一个');
    await 跑([甲], { 模式: '存', 名: '改前', 留图: 图 });
    假.渲的 = [];
    假.改的帧 = new Set([2]);
    await expect(跑([甲], { 模式: '比', 名: '改前', 留图: 图 })).rejects.toThrow(/已经有 5 张.*甲-第0000帧\.png.*换个空目录/);
    expect(假.渲的).toEqual([]);
    fs.rmSync(图, { recursive: true });
    expect(await 跑([甲], { 模式: '比', 名: '改前', 留图: 图 })).toBe(1);
    expect(fs.readdirSync(图)).toEqual(['甲-第0002帧.png']);
    // 改完再比一次也一样：前一次留的不同帧在里面
    await expect(跑([甲], { 模式: '比', 名: '改前', 留图: 图 })).rejects.toThrow(/已经有 1 张/);
    // 别的段、别的帧不撞
    expect(await 跑([乙], { 模式: '存', 名: '乙', 留图: 图 })).toBe(0);
    fs.rmSync(图, { recursive: true });
  });
  describe('本机缺地形包', () => {
    const 结论 = () => String(vi.mocked(console.log).mock.calls.at(-1)![0]);
    it('--存 跳过，别的段照存，退出码 0，结论说清跳过了谁', async () => {
      假.缺地形 = new Set(['乙']);
      expect(await 跑([甲, 乙], { 模式: '存', 名: '改前' })).toBe(0);
      expect(fs.existsSync(校验文件('改前', '乙'))).toBe(false);
      expect(结论()).toMatch(/1 段存好了.*跳过 乙，没存/);
    });
    it('--存 全部跳过：不算存好了，退出码 1', async () => {
      假.缺地形 = new Set(['甲']);
      const r = 记录();
      expect(await 跑([甲], { 模式: '存', 名: '改前' }, r)).toBe(1);
      expect(r.事件.join()).toMatch(/一段都没存/);
      expect(结论()).not.toMatch(/存好了/);
    });
    it('--比 存过基准的段没渲到：算不过，不说都相同', async () => {
      await 跑([甲, 乙], { 模式: '存', 名: '改前' });
      假.渲的 = [];
      假.缺地形 = new Set(['甲']);
      const 单 = 记录();
      expect(await 跑([甲], { 模式: '比', 名: '改前' }, 单)).toBe(1);
      expect(单.事件.join()).toMatch(/甲：「改前」里存过这段，但本机没有区段包 某包，没比到/);
      expect(结论()).not.toMatch(/都相同/);
      expect(假.渲的).toEqual([]);
      const 多 = 记录();
      expect(await 跑([甲, 乙], { 模式: '比', 名: '改前' }, 多)).toBe(1);
      expect(假.渲的[0]!.帧).toEqual([0, 1, 2]);
      expect(结论()).toMatch(/1 处没过；跳过 甲，没比/);
    });
    it('--比 没存过基准的段也缺包（存的时候就跳过了）：只跳过；一段都没比才算不过', async () => {
      假.缺地形 = new Set(['乙']);
      await 跑([甲, 乙], { 模式: '存', 名: '改前' });
      expect(await 跑([甲, 乙], { 模式: '比', 名: '改前' })).toBe(0);
      expect(结论()).toMatch(/1 段都相同；跳过 乙，没比/);
      const r = 记录();
      expect(await 跑([乙], { 模式: '比', 名: '改前' }, r)).toBe(1);
      expect(r.事件.join()).toMatch(/一段都没比/);
    });
  });
  it('PNG 小得像纯色：提醒，不拦', async () => {
    假.小图 = true;
    const r = 记录();
    expect(await 跑([甲], { 模式: '存', 名: '改前' }, r)).toBe(0);
    expect(r.事件.join()).toMatch(/可能是纯色.*0-4/);
  });
});
