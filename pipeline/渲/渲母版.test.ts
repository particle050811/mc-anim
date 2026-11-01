// 渲染母版、叠层、静帧的整条流程（Remotion、派生、转存都是假的，数据根是临时的）：页面拿到的地形版本要和指纹一样，地形用量记不上不能丢掉渲完的段。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-渲母版-'));
process.env.ANIM_DATA = 根;

const 态 = vi.hoisted(() => ({
  环境们: [] as Record<string, string>[],
  渲时: null as null | (() => void),
  组合们: [] as { id: string; durationInFrames: number; fps: number; width: number; height: number }[],
  表: { 暮色: 'v1' } as Record<string, string>,
}));

vi.mock('@remotion/bundler', () => ({ bundle: async () => '假包' }));
vi.mock('@remotion/renderer', () => {
  const 出 = async (o: { envVariables: Record<string, string> }, 文件: string) => {
    态.环境们.push(o.envVariables);
    fs.writeFileSync(文件, '帧');
    态.渲时?.();
  };
  return {
    openBrowser: async () => ({ newPage: async () => ({}), close: async () => {} }),
    getCompositions: async () => 态.组合们,
    renderMedia: (o: { envVariables: Record<string, string>; outputLocation: string }) => 出(o, o.outputLocation),
    renderStill: (o: { envVariables: Record<string, string>; output: string }) => 出(o, o.output),
  };
});
vi.mock('../指纹/指纹.ts', async (原) => ({
  ...(await 原<typeof import('../指纹/指纹.ts')>()),
  读地形版本表: () => 态.表,
  // 指纹算的时候表是什么，项.地形 就是什么；之后 态.表 再变，就是批次中途改了登记表
  算全部段指纹: async (任务: { 段: { 键: string; 段: { 地形: string[] } }; 叠层?: { 名: string } }[]) =>
    任务.map((t) => ({ 段: t.叠层 ? `${t.段.键}-${t.叠层.名}` : t.段.键, 指纹: `${'a'.repeat(63)}1`, 算法: '测', 项: { 地形: Object.fromEntries(t.段.段.地形.map((名) => [名, 态.表[名]!])) }, 明细: {} })),
}));
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));
vi.mock('../清单/清单.ts', async (原) => ({ ...(await 原<typeof import('../清单/清单.ts')>()), 全部段: async () => [] }));
vi.mock('../资产/随仓库.ts', () => ({ 补字节并报: () => {} }));
vi.mock('../资产/私有配乐.ts', () => ({ 备好私有配乐: () => [], 缺配乐提示: () => '' }));
vi.mock('../资产/缺字节.ts', () => ({ 补缺字节占位: (x: unknown) => x }));
vi.mock('../资产/webpack.ts', () => ({ webpack改写: () => (x: unknown) => x }));
vi.mock('../资产/缓存名.ts', () => ({ 稳定缓存名: (x: unknown) => x }));
vi.mock('../资产/资产锁.ts', () => ({ 读作品资产锁: () => ({}) }));
vi.mock('../段框架/注册目录.ts', () => ({ 缺的注册目录: () => [], 缺目录提示: () => '' }));
vi.mock('./public目录.ts', () => ({ 备好public目录: () => 根 }));
vi.mock('./打包残留.ts', () => ({ 删打包: () => {} }));
vi.mock('./探测.ts', () => ({ 视频信息: () => ({ 帧数: 3 }) }));
vi.mock('../段签/段签.ts', () => ({ 出段签: async () => ({}) }));
vi.mock('./转存.ts', () => ({ 存成压缩: async () => ({ 文件: '假.x264.mkv', 原大小: 1, 新大小: 1 }) }));
vi.mock('../缓存/钉.ts', () => ({ 删旧: () => {}, 有要删的旧: () => false }));

const { 渲染母版, 渲染叠层, 渲静帧 } = await import('./渲.ts');
const { 原母版路径 } = await import('./母版.ts');
const { 地形用量文件 } = await import('./地形用量.ts');
const { 作品名 } = await import('../环境/作品.ts');
const { 地形版本环境名, 地形用量段环境名 } = await import('../../engine/段/地形环境.ts');

const 段 = (键: string, 叠层?: { 名: string }[]) => ({ 键, 目录: path.join(根, '段', 键), 段: { 帧数: 3, fps: 24, 宽: 320, 高: 180, 地形: ['暮色'], 叠层 } }) as unknown as 段信息;
const 组合 = (id: string) => ({ id, durationInFrames: 3, fps: 24, width: 320, height: 180 });
const 记录 = () => ({ 记: () => {}, 产物: [], 阶段: [] }) as unknown as 运行记录;
const 指纹名 = `${'a'.repeat(63)}1`;

afterEach(() => {
  态.环境们 = [];
  态.渲时 = null;
  态.表 = { 暮色: 'v1' };
  vi.restoreAllMocks();
});

afterAll(() => fs.rmSync(根, { recursive: true, force: true }));

describe('页面的地形版本', () => {
  it('母版：第一段渲的时候表改了，后面的段还是指纹那版', async () => {
    态.组合们 = [组合('甲'), 组合('乙')];
    态.渲时 = () => void (态.表 = { 暮色: 'v2' });
    const r = await 渲染母版([段('甲'), 段('乙')], '视频', { 记录: 记录(), 重渲: true });
    expect(态.环境们.map((e) => JSON.parse(e[地形版本环境名]!))).toEqual([{ 暮色: 'v1' }, { 暮色: 'v1' }]);
    expect(r.map((x) => x.指纹.项.地形)).toEqual([{ 暮色: 'v1' }, { 暮色: 'v1' }]);
    expect(态.环境们.map((e) => e[地形用量段环境名])).toEqual([`${作品名()}/甲`, `${作品名()}/乙`]);
  });

  it('叠层同样取指纹那版，地形用量记在叠层键下', async () => {
    态.组合们 = [组合('甲-字幕'), 组合('甲-光')];
    态.渲时 = () => void (态.表 = { 暮色: 'v2' });
    await 渲染叠层([段('甲', [{ 名: '字幕' }, { 名: '光' }])], '视频', { 记录: 记录(), 重渲: true });
    expect(态.环境们.map((e) => JSON.parse(e[地形版本环境名]!))).toEqual([{ 暮色: 'v1' }, { 暮色: 'v1' }]);
    expect(态.环境们.map((e) => e[地形用量段环境名])).toEqual([`${作品名()}/甲-字幕`, `${作品名()}/甲-光`]);
  });

  it('静帧没算指纹，当场读表', async () => {
    态.组合们 = [组合('丙')];
    态.表 = { 暮色: 'v3' };
    const 出到 = fs.mkdtempSync(path.join(根, '静帧-'));
    await 渲静帧(段('丙'), [0], '视频', 出到);
    expect(JSON.parse(态.环境们[0]![地形版本环境名]!)).toEqual({ 暮色: 'v3' });
  });
});

describe('地形用量记不上', () => {
  const 写坏 = (键: string) => () => {
    fs.mkdirSync(path.dirname(地形用量文件(作品名(), 键)), { recursive: true });
    fs.writeFileSync(地形用量文件(作品名(), 键), '{坏');
  };

  it('母版照样改名、写指纹，只报警告', async () => {
    const 报 = vi.spyOn(console, 'error').mockImplementation(() => {});
    态.组合们 = [组合('丁')];
    态.渲时 = 写坏('丁');
    const [r] = await 渲染母版([段('丁')], '视频', { 记录: 记录(), 重渲: true, 留CRF1: true });
    expect(r!.新渲).toBe(true);
    expect(fs.existsSync(原母版路径('丁', 指纹名))).toBe(true);
    expect(fs.readdirSync(path.dirname(原母版路径('丁', 指纹名))).some((n) => n.endsWith('.指纹.json'))).toBe(true);
    expect(报.mock.calls.flat().join()).toMatch(/丁 的地形用量没记上/);
  });

  it('静帧的帧照样出', async () => {
    const 报 = vi.spyOn(console, 'error').mockImplementation(() => {});
    态.组合们 = [组合('戊')];
    写坏('戊')();
    const 出到 = fs.mkdtempSync(path.join(根, '静帧-'));
    const 出 = await 渲静帧(段('戊'), [1], '视频', 出到);
    expect(出).toHaveLength(1);
    expect(fs.existsSync(出[0]!)).toBe(true);
    expect(报.mock.calls.flat().join()).toMatch(/戊 的地形用量没记上/);
  });
});
