import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { 地形版本环境名, 地形用量段环境名 } from '../../engine/段/地形环境.ts';
import { 全表环境, 段渲染环境, 段现在的地形 } from '../渲/地形注入.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 代码根 } from '../环境/路径.ts';
import { 全部段 } from '../清单/清单.ts';
import { 叠层渲染参数, 渲染参数 } from '../渲/设置.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { 稳定JSON, 算全部段指纹, 算段指纹, 指纹差异, type 指纹任务 } from './指纹.ts';
import { 算默克尔 } from './默克尔.ts';

const 相对 = (p: string) => path.relative(代码根(), p).split(path.sep).join('/');

describe('稳定JSON', () => {
  it('和键的插入顺序无关', () => {
    expect(稳定JSON({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(稳定JSON({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});

describe('默克尔指纹', () => {
  const 临时 = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-指纹-')));
  const 根 = async (入口: string) => (await 算默克尔([相对(入口)])).根[0]!;

  it('只改注释、格式，或挪文件、换说明符写法，根哈希不变；改了代码就变', async () => {
    const d = 临时();
    const 甲 = path.join(d, '甲.ts');
    fs.writeFileSync(甲, "import { 乙 } from './乙.ts';\nexport default 乙 + 1;\n");
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙 = 1;\n');
    const 一 = await 根(甲);
    fs.writeFileSync(甲, "// 说明\nimport {乙} from './乙.ts'\n\n/** 加一 */\nexport default (乙 + 1)\n");
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙: number = 1; // 类型和注释\n');
    expect(await 根(甲)).toBe(一);
    fs.mkdirSync(path.join(d, '子'));
    fs.renameSync(path.join(d, '乙.ts'), path.join(d, '子', '丙.ts'));
    fs.writeFileSync(甲, "import { 乙 } from './子/丙.ts';\nexport default 乙 + 1;\n");
    expect(await 根(甲)).toBe(一);
    fs.writeFileSync(path.join(d, '子', '丙.ts'), 'export const 乙 = 2;\n');
    expect(await 根(甲)).not.toBe(一);
    fs.rmSync(d, { recursive: true });
  });

  it('asset: 按资产锁 sha、npm 包按 lockfile 版本、Worker 的 new URL 都算进去；锁里没有的 id 报错', async () => {
    const d = 临时();
    const 甲 = path.join(d, '甲.ts');
    fs.writeFileSync(甲, "import 图 from 'asset:核对/冒烟色块'; import { interpolate } from 'remotion'; export const w = () => new Worker(new URL('./工人.ts', import.meta.url)); export default [图, interpolate];");
    fs.writeFileSync(path.join(d, '工人.ts'), 'export const 工 = 1;');
    const r = await 算默克尔([相对(甲)]);
    expect(r.明细.资产).toEqual({ '核对/冒烟色块': 读资产锁()['核对/冒烟色块']!.sha256 });
    expect(Object.keys(r.明细.模块).sort()).toEqual([相对(甲), 相对(path.join(d, '工人.ts'))].sort());
    fs.writeFileSync(path.join(d, '工人.ts'), 'export const 工 = 2;');
    expect((await 算默克尔([相对(甲)])).根[0]).not.toBe(r.根[0]);
    fs.writeFileSync(path.join(d, '工人.ts'), "import x from 'asset:核对/不存在'; export const 工 = x;");
    await expect(算默克尔([相对(甲)])).rejects.toThrow(/资产锁里没有「核对\/不存在」/);
    fs.rmSync(d, { recursive: true });
  });
});

describe('段指纹', () => {
  it('冒烟段的指纹：逐项展开、两级渲染设置不同指纹、差异说得出是哪项', async () => {
    const [冒烟] = await 全部段();
    const 视频 = await 算段指纹(冒烟!, 渲染参数('视频'));
    const 预览 = await 算段指纹(冒烟!, 渲染参数('预览'));
    expect(视频.指纹).toMatch(/^[0-9a-f]{64}$/);
    expect(视频.指纹).not.toBe(预览.指纹);
    expect(Object.keys(视频.明细.模块)).toEqual(expect.arrayContaining(['作品/应力转动/核对/冒烟/画面.tsx', '作品/应力转动/核对/冒烟/段.ts', 'engine/段/设置.ts', '作品/应力转动/注册.tsx', 'engine/段/注册工厂.tsx']));
    expect(Object.keys(视频.明细.模块)).not.toContain('作品/应力转动/清单.ts');
    expect(Object.keys(视频.明细.资产).sort()).toEqual(['核对/冒烟色块', '核对/冒烟音']);
    expect(视频.项.依赖版本).toMatchObject({ remotion: '4.0.537', react: '19.3.0', three: '0.186.1' });
    expect(Object.keys(视频.项.打包规则).sort()).toEqual(['pipeline/资产/ogg解码.cjs', 'pipeline/资产/webpack.ts', 'tsconfig']);
    expect(指纹差异(视频, 预览).sort()).toEqual(['渲染设置 改了 imageFormat', '渲染设置 改了 inputProps', '渲染设置 改了 scale']);
    expect((await 算段指纹(冒烟!, 渲染参数('视频'))).指纹).toBe(视频.指纹);
  });
});

describe('地形按段依赖', () => {
  const 表文件 = path.join(代码根(), 'assets', '地形版本.json');
  const 原 = fs.readFileSync;
  /** 拿改过的地形登记表算指纹（代码根不动） */
  const 用表算 = async (s: 段信息, 改: (包: Record<string, { 版本: string }>, 表: { 说明?: string }) => void) => {
    const 表 = JSON.parse(原(表文件, 'utf8')) as { 说明?: string; 包: Record<string, { 版本: string }> };
    改(表.包, 表);
    const 桩 = vi.spyOn(fs, 'readFileSync').mockImplementation(((f: fs.PathOrFileDescriptor, ...其余: unknown[]) => (f === 表文件 ? JSON.stringify(表) : (原 as (...a: unknown[]) => unknown)(f, ...其余))) as typeof fs.readFileSync);
    try {
      return await 算段指纹(s, 渲染参数('视频'));
    } finally {
      桩.mockRestore();
    }
  };
  const 穿塔 = async () => (await 全部段()).find((s) => s.键 === '6-穿塔斩首领')!;

  it('改没声明的包、加新包、改说明，段不过期；改声明的包段过期，差异说得出是哪个包', async () => {
    const s = await 穿塔();
    const 无关 = Object.keys(JSON.parse(原(表文件, 'utf8')).包).filter((名) => !s.段.地形.includes(名));
    expect(无关.length).toBeGreaterThan(0);
    const 基 = await 用表算(s, () => {});
    expect(Object.keys(基.明细.模块)).not.toContain('assets/地形版本.json');
    expect(Object.keys(基.项.地形).sort()).toEqual([...s.段.地形].sort());
    const 改无关 = await 用表算(s, (包, 表) => {
      包[无关[0]!]!.版本 = '无关新版本';
      包.新包 = { 版本: 'x' };
      表.说明 = '改过';
    });
    expect(改无关.指纹).toBe(基.指纹);
    const 改声明 = await 用表算(s, (包) => {
      包[s.段.地形[0]!]!.版本 = '声明新版本';
    });
    expect(改声明.指纹).not.toBe(基.指纹);
    expect(指纹差异(基, 改声明)).toEqual([`地形 改了 ${s.段.地形[0]}`]);
  });

  it('删掉没声明的包不过期；删掉声明的包算指纹时报错', async () => {
    const s = await 穿塔();
    const 基 = await 用表算(s, () => {});
    const 无关 = Object.keys(JSON.parse(原(表文件, 'utf8')).包).filter((名) => !s.段.地形.includes(名))[0]!;
    expect((await 用表算(s, (包) => void delete 包[无关])).指纹).toBe(基.指纹);
    await expect(用表算(s, (包) => void delete 包[s.段.地形[0]!])).rejects.toThrow(/没在 assets\/地形版本.json 登记版本/);
  });

  // 批次中途表变了页面也不跟着变，整条流程在 渲/渲母版.test.ts 验
  it('环境按给的地形项拼，只有声明的包；同一张表当场读的和指纹的地形项相同', async () => {
    const s = await 穿塔();
    const 基 = await 用表算(s, () => {});
    const 环境 = 段渲染环境(基.段, 基.项.地形);
    expect(JSON.parse(环境[地形版本环境名]!)).toEqual(基.项.地形);
    expect(段现在的地形(s)).toEqual(基.项.地形);
    expect(环境[地形用量段环境名]).toBe(`应力转动/${s.键}`);
    expect(Object.keys(JSON.parse(全表环境()[地形版本环境名]!))).toEqual(Object.keys(JSON.parse(原(表文件, 'utf8')).包));
  });
});

describe('一次算 = 逐段算', () => {
  it('一批段和叠层一次建图算的指纹、明细，和逐段单独算的逐字相同', async () => {
    const 段们 = await 全部段();
    // 取头几段加所有带叠层的段：两级渲染设置、叠层、共用闭包都覆盖到，又不至于逐段打包太久
    const 挑 = [...new Set([...段们.slice(0, 3), ...段们.filter((s) => s.段.叠层?.length).slice(0, 1)])];
    const 任务: 指纹任务[] = 挑.flatMap((s) => [
      { 段: s, 渲染设置: 渲染参数('视频') },
      { 段: s, 渲染设置: 渲染参数('预览') },
      ...(s.段.叠层 ?? []).map((l) => ({ 段: s, 渲染设置: 叠层渲染参数('视频'), 叠层: l })),
    ]);
    const 一次 = await 算全部段指纹(任务);
    expect(一次.map((x) => x.段)).toEqual(任务.map((t) => (t.叠层 ? `${t.段.键}-${t.叠层.名}` : t.段.键)));
    const 逐段 = await Promise.all(任务.map((t) => 算段指纹(t.段, t.渲染设置, t.叠层)));
    for (const [i, x] of 逐段.entries()) expect(JSON.stringify(一次[i])).toBe(JSON.stringify(x));
  });
});
