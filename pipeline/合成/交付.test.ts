// 交付目录的约定：manifest v1、v2 都读得回来（母版路径一样），版本太新拒绝；自足的判断；作品的 交付.toml。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-交付测试-'));
process.env.ANIM_DATA = 数据根;
const { 读交付manifest, 交付缺, 读交付设置, 交付母版, 未拉响度文件, 剪辑画面文件 } = await import('./交付.ts');
const { 交付引用 } = await import('../缓存/回收.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 交付 = (名: string, m: unknown) => {
  const dir = path.join(数据根, '交付', '作品甲', 名);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  return dir;
};
const 公共 = { 名: 'x', 帧率: 24, 宽: 2560, 高: 1440, 总帧数: 85, 响度: { 增益dB: 3 }, 叠层: [{ 键: '6-甲-层', 段: '6-甲', 文件: 'cache/叠层/作品甲/6-甲-层/eeeeeeeeeeeeeeee.mov', 全片起帧: 0 }] };
const 指 = 'a'.repeat(16) + 'b'.repeat(48);

describe('交付 manifest', () => {
  it('v1（段记母版，相对数据根或绝对路径、没有 版本 和 作品）和 v2（段不记母版）读出来的母版一样', () => {
    const 母 = path.join(数据根, 'cache', '母版', '作品甲', '6-甲', `${'a'.repeat(16)}.mkv`);
    const v1 = 读交付manifest(交付('v1', { ...公共, 段: [{ 编号: '6-1', 键: '6-甲', 指纹: 指, 帧数: 48, 全片起帧: 0, 母版: 'cache/母版/作品甲/6-甲/aaaaaaaaaaaaaaaa.mkv' }, { 编号: null, 键: '6-甲', 指纹: 指, 帧数: 37, 全片起帧: 48, 母版: 母 }] }));
    expect(v1).toMatchObject({ 版本: 1, 作品: '作品甲' });
    expect(v1.段.map((s) => s.母版)).toEqual([母, 母]);
    expect(v1.段[0]).toMatchObject({ 声音: null, 字节sha: null });
    expect(v1.叠层[0]!.文件).toBe(path.join(数据根, 'cache', '叠层', '作品甲', '6-甲-层', 'eeeeeeeeeeeeeeee.mov'));

    const 声 = `段签/作品甲/6-甲/${'a'.repeat(16)}/声音.flac`;
    const v2 = 读交付manifest(交付('v2', { ...公共, 版本: 2, 作品: '作品甲', 段: [{ 编号: '6-1', 键: '6-甲', 指纹: 指, 帧数: 48, 全片起帧: 0, 字节sha: 'c'.repeat(64), 段签: path.dirname(声), 声音: 声 }] }));
    expect(v2.段[0]).toMatchObject({ 母版: 母, 声音: path.join(数据根, ...声.split('/')), 字节sha: 'c'.repeat(64) });
    expect(交付母版('作品甲', '6-甲', 指)).toBe(母);
    // gc 按同一条规则算 v2 的母版
    expect(交付引用({ 版本: 2, 作品: '作品甲', 段: [{ 键: '6-甲', 指纹: 指 }] })).toEqual(['cache/母版/作品甲/6-甲/aaaaaaaaaaaaaaaa.mkv']);
    expect(交付引用({ 段: [{ 键: '6-甲', 指纹: 指 }] }, '作品乙')).toEqual(['cache/母版/作品乙/6-甲/aaaaaaaaaaaaaaaa.mkv']);
  });

  it('比这版代码新的 manifest 拒绝', () => {
    expect(() => 读交付manifest(交付('v3', { ...公共, 版本: 3, 段: [] }))).toThrow(/只认到 v2/);
  });

  it('自足：有未拉响度的 FLAC，要剪辑包的还要有画面', () => {
    const dir = 交付('自足', { ...公共, 段: [] });
    expect(交付缺(dir, true)).toEqual([未拉响度文件, 剪辑画面文件]);
    fs.writeFileSync(path.join(dir, 未拉响度文件), '');
    expect(交付缺(dir, false)).toEqual([]);
    expect(交付缺(dir, true)).toEqual([剪辑画面文件]);
    fs.mkdirSync(path.join(dir, '剪辑包'));
    fs.writeFileSync(path.join(dir, 剪辑画面文件), '');
    expect(交付缺(dir, true)).toEqual([]);
  });

  it('交付.toml：没有是默认（不出剪辑包），只认 剪辑包 一项', () => {
    const 根 = path.join(数据根, '作品根');
    fs.mkdirSync(根, { recursive: true });
    expect(读交付设置(根)).toEqual({ 剪辑包: false });
    fs.writeFileSync(path.join(根, '交付.toml'), '"剪辑包" = true\n');
    expect(读交付设置(根)).toEqual({ 剪辑包: true });
    fs.writeFileSync(path.join(根, '交付.toml'), '"剪辑报" = true\n');
    expect(() => 读交付设置(根)).toThrow(/不认识/);
    fs.writeFileSync(path.join(根, '交付.toml'), '"剪辑包" = "是"\n');
    expect(() => 读交付设置(根)).toThrow(/true 或 false/);
  });
});
