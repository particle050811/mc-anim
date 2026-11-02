// 渲染母版、叠层、静帧的整条流程（Remotion、派生、转存都是假的，数据根是临时的）：页面拿到的地形版本要和指纹一样，地形用量记不上不能丢掉渲完的段。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import type { 后处理参数, 后处理结果 } from './后处理.ts';
import type { 跑后台 } from './后台转存.ts';

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-渲母版-'));
process.env.ANIM_DATA = 根;
// 这个文件里的旧用例不起子进程；后台的用例单独关掉它
process.env.ANIM_INLINE_TRANSCODE = '1';

const 态 = vi.hoisted(() => ({
  环境们: [] as Record<string, string>[],
  渲时: null as null | (() => void),
  组合们: [] as { id: string; durationInFrames: number; fps: number; width: number; height: number }[],
  表: { 暮色: 'v1' } as Record<string, string>,
}));

vi.mock('../环境/温度.ts', () => {
  const 无温度 = () => ({ 芯片最高温: null, 发热等级: null });
  return { 读温度: vi.fn(无温度), 读温度并行: vi.fn(async () => 无温度()), 读现成温度: vi.fn(async () => 无温度()), 无温度 };
});
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
vi.mock('./转存.ts', () => ({
  存成压缩内层: async () => ({ 文件: '假.x264.mkv', 原大小: 1, 新大小: 1 }),
  还是那份: () => true,
  已转完: async () => false,
}));
vi.mock('../缓存/钉.ts', () => ({ 删旧: () => {}, 有要删的旧: () => false }));

const { 渲染母版, 渲染叠层, 渲静帧 } = await import('./渲.ts');
const { 明细目录 } = await import('../运行记录/渲染明细.ts');
const { 原母版路径 } = await import('./母版.ts');
const { 地形用量文件 } = await import('./地形用量.ts');
const { 作品名 } = await import('../环境/作品.ts');
const { 地形版本环境名, 地形用量段环境名 } = await import('../../engine/段/地形环境.ts');

const 段 = (键: string, 叠层?: { 名: string }[]) => ({ 键, 目录: path.join(根, '段', 键), 段: { 帧数: 3, fps: 24, 宽: 320, 高: 180, 地形: ['暮色'], 叠层 } }) as unknown as 段信息;
const 组合 = (id: string) => ({ id, durationInFrames: 3, fps: 24, width: 320, height: 180 });
const 记录 = () => ({ 记: () => {}, 产物: [] as string[], 阶段: [] as { 标签: string; 阶段: string }[] }) as unknown as 运行记录;
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

describe('后台转存', () => {
  const 手动跑 = () => {
    const 起了: 后处理参数[] = [];
    const 放: ((x: 后处理结果 | null) => void)[] = [];
    const 跑: 跑后台 = (p, h) => {
      起了.push(p);
      h.阶段([{ 标签: p.标签, 阶段: '派生段签', 开始: 'x', 秒: 1 }]);
      return new Promise((r) => void 放.push(r));
    };
    return { 起了, 放, 跑 };
  };
  const 过一拍 = () => new Promise((r) => setTimeout(r, 20));
  const 关内联 = () => {
    delete process.env.ANIM_INLINE_TRANSCODE;
    return () => void (process.env.ANIM_INLINE_TRANSCODE = '1');
  };
  const 压 = (键: string): 后处理结果 => ({ 母版: `${键}.x264.mkv`, 结局: '压缩' });

  it('放闸才排后台；等后台都做完才返回；r.母版、产物、阶段都对，产物照段的次序', async () => {
    const 开 = 关内联();
    try {
      态.组合们 = [组合('后甲'), 组合('后乙')];
      const 手 = 手动跑();
      const 记 = 记录();
      let 完 = false;
      const p = 渲染母版([段('后甲'), 段('后乙')], '视频', { 记录: 记, 重渲: true, 跑后台: 手.跑 }).then((x) => ((完 = true), x));
      await vi.waitFor(() => expect(手.起了.map((x) => x.键)).toEqual(['后甲']));
      // 第一段后台没做完，第二段已经出帧了
      await vi.waitFor(() => expect(态.环境们.length).toBe(2));
      await 过一拍();
      expect(完).toBe(false);
      expect(手.起了[0]).toMatchObject({ 级别: '视频', 留CRF1: false, 标签: `render:${作品名()}/后甲:视频` });
      手.放[0]!(压('后甲'));
      await vi.waitFor(() => expect(手.起了.length).toBe(2));
      await 过一拍();
      expect(完).toBe(false);
      手.放[1]!(压('后乙'));
      const r = await p;
      expect(r.map((x) => x.母版)).toEqual(['后甲.x264.mkv', '后乙.x264.mkv']);
      expect(记.产物).toEqual(['后甲.x264.mkv', '后乙.x264.mkv']);
      expect(记.阶段.filter((x) => x.阶段 === '派生段签').length).toBe(2);
      expect(记.阶段.some((x) => x.阶段 === '等后台' && x.标签 === `批:${作品名()}:视频`)).toBe(true);
    } finally {
      开();
    }
  });

  it('后台还没做完，出帧明细已经落盘；收工写回同一个文件，带上后台阶段', async () => {
    const 开 = 关内联();
    try {
      态.组合们 = [组合('明细甲')];
      const 手 = 手动跑();
      const 新明细 = () => (fs.existsSync(明细目录()) ? fs.readdirSync(明细目录()).filter((f) => f.includes('明细甲')) : []);
      for (const f of 新明细()) fs.rmSync(path.join(明细目录(), f));
      const p = 渲染母版([段('明细甲')], '视频', { 记录: 记录(), 重渲: true, 跑后台: 手.跑 });
      await vi.waitFor(() => expect(手.起了.length).toBe(1));
      const 文件们 = 新明细();
      expect(文件们.length).toBe(1);
      const 读 = () => JSON.parse(fs.readFileSync(path.join(明细目录(), 文件们[0]!), 'utf8')) as { 阶段: { 阶段: string }[] };
      expect(读().阶段.some((x) => x.阶段 === '派生段签')).toBe(false);
      手.放[0]!(压('明细甲'));
      await p;
      expect(新明细()).toEqual(文件们);
      expect(读().阶段.some((x) => x.阶段 === '派生段签')).toBe(true);
    } finally {
      开();
    }
  });

  it('子进程没交结果（被杀、起不来）：只警告，CRF1 留着，下一段照做', async () => {
    const 开 = 关内联();
    try {
      态.组合们 = [组合('败甲'), 组合('败乙')];
      const 手 = 手动跑();
      const 警告们: string[] = [];
      const 记 = { ...记录(), 记: (_: string, s: string) => void 警告们.push(s) } as unknown as 运行记录;
      const p = 渲染母版([段('败甲'), 段('败乙')], '视频', { 记录: 记, 重渲: true, 跑后台: 手.跑 });
      await vi.waitFor(() => expect(手.起了.length).toBe(1));
      手.放[0]!(null);
      await vi.waitFor(() => expect(手.起了.length).toBe(2));
      手.放[1]!(压('败乙'));
      const r = await p;
      expect(r[0]!.母版).toBe(原母版路径('败甲', 指纹名));
      expect(r[1]!.母版).toBe('败乙.x264.mkv');
      expect(警告们.join()).toMatch(/败甲 的后台转存中断/);
    } finally {
      开();
    }
  });

  it('限流：后台第一段不动，排着两段了第四段不出帧；放开一段才接着渲', async () => {
    const 开 = 关内联();
    try {
      const 键们 = ['流一', '流二', '流三', '流四'];
      态.组合们 = 键们.map(组合);
      const 手 = 手动跑();
      const 记 = 记录();
      const p = 渲染母版(键们.map((k) => 段(k)), '视频', { 记录: 记, 重渲: true, 跑后台: 手.跑 });
      // 一在做，二、三排着：第四段等空位
      await vi.waitFor(() => expect(态.环境们.length).toBe(3));
      // 等满 100 毫秒才记阶段（后台转存.ts 的 等空位）
      await new Promise((r) => setTimeout(r, 150));
      expect(态.环境们.length).toBe(3);
      手.放[0]!(压('流一'));
      await vi.waitFor(() => expect(态.环境们.length).toBe(4));
      await vi.waitFor(() => expect(手.放.length).toBe(2));
      手.放[1]!(压('流二'));
      await vi.waitFor(() => expect(手.放.length).toBe(3));
      手.放[2]!(压('流三'));
      await vi.waitFor(() => expect(手.放.length).toBe(4));
      手.放[3]!(压('流四'));
      await p;
      expect(记.阶段.filter((x) => x.阶段 === '等后台' && x.标签 === `render:${作品名()}/流四:视频`).length).toBe(1);
    } finally {
      开();
    }
  });

  it('渲到一半出错：已排上的段照样等做完，错再抛出去', async () => {
    const 开 = 关内联();
    try {
      态.组合们 = [组合('错甲'), 组合('错乙')];
      const 手 = 手动跑();
      const 记 = 记录();
      let 第几 = 0;
      态.渲时 = () => {
        if (++第几 === 2) throw new Error('渲崩了');
      };
      let 抛了 = false;
      const p = 渲染母版([段('错甲'), 段('错乙')], '视频', { 记录: 记, 重渲: true, 跑后台: 手.跑 }).catch((e: Error) => {
        抛了 = true;
        return e;
      });
      await vi.waitFor(() => expect(手.起了.length).toBe(1));
      await 过一拍();
      expect(抛了).toBe(false);
      手.放[0]!(压('错甲'));
      expect(((await p) as Error).message).toBe('渲崩了');
      expect(记.产物).toEqual(['错甲.x264.mkv']);
    } finally {
      开();
    }
  });

  it('命中已是最新但只有 CRF1：不排后台，用到时才转', async () => {
    const 开 = 关内联();
    try {
      fs.mkdirSync(path.dirname(原母版路径('补甲', 指纹名)), { recursive: true });
      fs.writeFileSync(原母版路径('补甲', 指纹名), '帧');
      态.组合们 = [];
      const 跑 = vi.fn();
      const [r] = await 渲染母版([段('补甲')], '视频', { 记录: 记录(), 跑后台: 跑 as never });
      expect(跑).not.toHaveBeenCalled();
      expect(r!.母版).toBe(原母版路径('补甲', 指纹名));
      expect(r!.新渲).toBe(false);
    } finally {
      开();
    }
  });

  it('--留CRF1：不走后台，还在闸里当场做，CRF1 不删', async () => {
    const 开 = 关内联();
    try {
      态.组合们 = [组合('留甲')];
      const 跑 = vi.fn();
      const 记 = 记录();
      const [r] = await 渲染母版([段('留甲')], '视频', { 记录: 记, 重渲: true, 留CRF1: true, 跑后台: 跑 as never });
      expect(跑).not.toHaveBeenCalled();
      expect(r!.母版).toBe('假.x264.mkv');
      expect(fs.existsSync(原母版路径('留甲', 指纹名))).toBe(true);
      expect(记.阶段.some((x) => x.阶段 === '等后台')).toBe(false);
    } finally {
      开();
    }
  });

  it('CRF1 改名那一刻 .用过 已经在：闸外别的 render 的 删旧 挡得住刚改名的这份', async () => {
    态.组合们 = [组合('钉甲')];
    const 原 = 原母版路径('钉甲', 指纹名);
    const 用过 = path.join(path.dirname(原), `${指纹名.slice(0, 16)}.用过`);
    const 真改名 = fs.renameSync;
    let 改名时有: boolean | null = null;
    vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {
      if (b === 原) 改名时有 = fs.existsSync(用过);
      真改名(a, b);
    });
    await 渲染母版([段('钉甲')], '视频', { 记录: 记录(), 重渲: true });
    expect(改名时有).toBe(true);
  });

  it('ANIM_INLINE_TRANSCODE=1：不走后台，还在闸里当场做', async () => {
    态.组合们 = [组合('内联')];
    const 跑 = vi.fn();
    const 记 = 记录();
    const [r] = await 渲染母版([段('内联')], '视频', { 记录: 记, 重渲: true, 跑后台: 跑 as never });
    expect(跑).not.toHaveBeenCalled();
    expect(r!.母版).toBe('假.x264.mkv');
    expect(记.产物).toEqual(['假.x264.mkv']);
    expect(记.阶段.some((x) => x.阶段 === '等后台')).toBe(false);
    expect(记.阶段.map((x) => x.阶段)).toEqual(expect.arrayContaining(['派生段签', '转存', '删旧']));
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
