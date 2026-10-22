import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 全部段 } from '../清单/清单.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { 稳定JSON, 算段指纹, 指纹差异 } from './指纹.ts';
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
    expect(视频.项.依赖版本).toMatchObject({ remotion: '4.0.530', react: '19.3.0', three: '0.186.1' });
    expect(Object.keys(视频.项.打包规则).sort()).toEqual(['pipeline/资产/ogg解码.cjs', 'pipeline/资产/webpack.ts', 'tsconfig']);
    expect(指纹差异(视频, 预览).sort()).toEqual(['渲染设置 改了 imageFormat', '渲染设置 改了 inputProps', '渲染设置 改了 scale']);
    expect((await 算段指纹(冒烟!, 渲染参数('视频'))).指纹).toBe(视频.指纹);
  });
});
