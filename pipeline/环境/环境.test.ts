import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 读配置 } from './配置.ts';
import { 代码根, 主检出 } from './路径.ts';
import { 内存够渲染, 解析vm_stat, 解析交换区 } from './资源.ts';

describe('配置', () => {
  it('环境变量 > anim.local.toml > 默认，并记下来源', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-配置-'));
    const toml = path.join(dir, 'anim.local.toml');
    fs.writeFileSync(toml, 'data = "数据"\nvideo_encoder = "libx264"\n');
    const { 值 } = 读配置({ ANIM_VIDEO_ENCODER: 'h264_videotoolbox' }, toml);
    expect(值.数据根).toMatchObject({ 值: path.join(dir, '数据'), 来源: 'anim.local.toml' });
    expect(值.编码器).toMatchObject({ 值: 'h264_videotoolbox', 来源: '环境变量' });
    expect(值.gl).toMatchObject({ 值: 'angle', 来源: '默认' });
    fs.rmSync(dir, { recursive: true });
  });

  it('默认值跟着前面取到的值走', () => {
    const { 值 } = 读配置({ ANIM_LEGACY: '/不存在/旧项目', ANIM_DATA: '/数据' }, null);
    expect(值.游戏!.值).toBe(path.resolve('/不存在/旧项目/game'));
    expect(值.锁目录!.值).toBe(path.resolve('/数据/run/locks'));
  });

  it('anim.local.toml 里写错项名就报错', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-配置-'));
    const toml = path.join(dir, 'anim.local.toml');
    fs.writeFileSync(toml, 'dta = "x"\n');
    expect(() => 读配置({}, toml)).toThrow(/不认识的项：dta/);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('路径', () => {
  it('代码根有 package.json，主检出有 .git', () => {
    expect(fs.existsSync(path.join(代码根(), 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(主检出(), '.git'))).toBe(true);
  });
});

describe('资源读数', () => {
  it('vm_stat 按页大小算空闲，交换区按 MB', () => {
    const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 10.\nPages purgeable: 5.\nPages active: 999.\n';
    expect(解析vm_stat(vm, 1e12)).toBe(315 * 16384);
    expect(解析交换区('total = 8192.00M  used = 6935.00M  free = 1257.00M  (encrypted)')).toEqual({ 总: 8192 * 2 ** 20, 已用: 6935 * 2 ** 20 });
  });

  it('渲染放行只看空闲内存下限，交换区快满也放', () => {
    const m = { 总: 100, 空闲: 50, 空闲百分比: 50, 交换区总: 100, 交换区已用: 95 };
    expect(内存够渲染(m, 30)).toBe(true);
    expect(内存够渲染({ ...m, 空闲百分比: 20 }, 30)).toBe(false);
  });
});
