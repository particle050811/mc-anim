import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 全部段 } from '../清单/清单.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { 稳定JSON, 算段指纹, 算闭包, 指纹差异 } from './指纹.ts';

const 相对 = (p: string) => path.relative(代码根(), p).split(path.sep).join('/');

describe('稳定JSON', () => {
  it('和键的插入顺序无关', () => {
    expect(稳定JSON({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(稳定JSON({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});

describe('依赖闭包', () => {
  it('闭包里的文件改了指纹就变；asset: 记 sha；npm 包记 lockfile 版本', async () => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-指纹-')));
    fs.writeFileSync(path.join(d, '甲.ts'), "import { 乙 } from './乙.ts'; import 图 from 'asset:核对/冒烟色块'; import { interpolate } from 'remotion'; export default [乙, 图, interpolate];");
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙 = 1;');
    const 一 = await 算闭包([相对(path.join(d, '甲.ts'))]);
    expect(Object.keys(一.文件).sort()).toEqual([相对(path.join(d, '乙.ts')), 相对(path.join(d, '甲.ts'))].sort());
    expect(一.资产).toEqual({ '核对/冒烟色块': 读资产锁()['核对/冒烟色块']!.sha256 });
    expect(一.外部包).toEqual({ remotion: '4.0.530' });
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙 = 2;');
    const 二 = await 算闭包([相对(path.join(d, '甲.ts'))]);
    expect(二.文件[相对(path.join(d, '乙.ts'))]).not.toBe(一.文件[相对(path.join(d, '乙.ts'))]);
    fs.writeFileSync(path.join(d, '乙.ts'), "import x from 'asset:核对/不存在'; export const 乙 = x;");
    await expect(算闭包([相对(path.join(d, '甲.ts'))])).rejects.toThrow(/资产锁里没有「核对\/不存在」/);
    fs.rmSync(d, { recursive: true });
  });

  it('冒烟段的指纹：逐项展开、两级渲染设置不同指纹、差异说得出是哪项', async () => {
    const [冒烟] = await 全部段();
    const 视频 = await 算段指纹(冒烟!, 渲染参数('视频'));
    const 预览 = await 算段指纹(冒烟!, 渲染参数('预览'));
    expect(视频.指纹).toMatch(/^[0-9a-f]{64}$/);
    expect(视频.指纹).not.toBe(预览.指纹);
    expect(Object.keys(视频.项.闭包.文件)).toEqual(expect.arrayContaining(['content/核对/冒烟/画面.tsx', 'content/核对/冒烟/段.ts', 'content/设置.ts', 'content/注册.tsx']));
    expect(Object.keys(视频.项.资产).sort()).toEqual(['核对/冒烟色块', '核对/冒烟音']);
    expect(视频.项.依赖版本).toMatchObject({ remotion: '4.0.530', react: '19.3.0', three: '0.186.1' });
    expect(Object.keys(视频.项.打包规则)).toEqual(['pipeline/资产/ogg解码.cjs', 'pipeline/资产/webpack.ts', 'remotion.config.ts']);
    expect(指纹差异(视频.项, 预览.项).sort()).toEqual(['渲染设置 改了 imageFormat', '渲染设置 改了 inputProps', '渲染设置 改了 scale']);
    expect((await 算段指纹(冒烟!, 渲染参数('视频'))).指纹).toBe(视频.指纹);
  });
});
