import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfig } from './配置.ts';
import { codeRoot, mainCheckout } from './路径.ts';
import { enoughMemory, parseVmStat, parseSwap } from './资源.ts';

describe('配置', () => {
  it('环境变量 > anim.local.toml > 默认，并记下来源', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-配置-'));
    const toml = path.join(dir, 'anim.local.toml');
    fs.writeFileSync(toml, 'data = "数据"\ngl = "swangle"\n');
    const { value: values } = readConfig({ ANIM_GL: 'egl' }, toml);
    expect(values.数据根).toMatchObject({ value: path.join(dir, '数据'), source: 'anim.local.toml' });
    expect(values.gl).toMatchObject({ value: 'egl', source: '环境变量' });
    expect(values.ffmpeg).toMatchObject({ value: 'ffmpeg', source: '默认' });
    fs.rmSync(dir, { recursive: true });
  });

  it('默认值跟着前面取到的值走', () => {
    const { value: values } = readConfig({ ANIM_DATA: '/数据' }, null);
    expect(values.游戏!.value).toBe(path.resolve('/数据/game'));
    expect(values.锁目录!.value).toBe(path.resolve('/数据/run/locks'));
  });

  it('anim.local.toml 里写错项名就报错', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-配置-'));
    const toml = path.join(dir, 'anim.local.toml');
    fs.writeFileSync(toml, 'dta = "x"\n');
    expect(() => readConfig({}, toml)).toThrow(/不认识的项：dta/);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('路径', () => {
  it('代码根有 package.json，主检出有 .git', () => {
    expect(fs.existsSync(path.join(codeRoot(), 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(mainCheckout(), '.git'))).toBe(true);
  });
});

describe('资源读数', () => {
  it('vm_stat 按页大小算空闲，交换区按 MB', () => {
    const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 10.\nPages purgeable: 5.\nPages active: 999.\n';
    expect(parseVmStat(vm, 1e12)).toBe(315 * 16384);
    expect(parseSwap('total = 8192.00M  used = 6935.00M  free = 1257.00M  (encrypted)')).toEqual({ grandTotal: 8192 * 2 ** 20, used: 6935 * 2 ** 20 });
  });

  it('渲染放行只看空闲内存下限，交换区快满也放', () => {
    const m = { grandTotal: 100, free: 50, freePercent: 50, swapTotal: 100, swapUsed: 95 };
    expect(enoughMemory(m, 30)).toBe(true);
    expect(enoughMemory({ ...m, freePercent: 20 }, 30)).toBe(false);
  });
});
