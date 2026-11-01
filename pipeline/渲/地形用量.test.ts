import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessBrowser } from '@remotion/renderer';
import { 地形用量段环境名 } from '../../engine/段/地形环境.ts';
import { 帧段串, 并入用量, 解帧段串, 地形用量文件, 读地形用量, 开始整段量, 收地形用量, 记已量帧, 等地形用量写完 } from './地形用量.ts';

describe('帧段串', () => {
  it('升序去重，连续的并成一段，解回来一样', () => {
    expect(帧段串([5, 1, 2, 3, 3, 9, 10])).toBe('1-3,5,9-10');
    expect(帧段串([])).toBe('');
    expect(解帧段串('1-3,5,9-10')).toEqual([1, 2, 3, 5, 9, 10]);
    expect(解帧段串('')).toEqual([]);
  });
});

describe('并入用量', () => {
  const 空 = { 作品: '甲', 段: '段', 已量帧: '', 包: {} };
  it('按并集累积，区段按级、i、j 数值排', () => {
    const 一 = 并入用量(空, { 暮色: { 版本: 'v1', 区段: ['1|2|3', '0|10|0'] } }, [0, 1]);
    const 二 = 并入用量(一, { 暮色: { 版本: 'v1', 区段: ['0|9|0', '1|2|3'] }, 主世界: { 版本: 'v2', 区段: [] } }, [2, 7]);
    expect(二.包.暮色!.区段).toEqual(['0|9|0', '0|10|0', '1|2|3']);
    expect(二.包.主世界).toEqual({ 版本: 'v2', 区段: [] });
    expect(二.已量帧).toBe('0-2,7');
  });
  it('包的版本换了：那个包作废重记，已量帧清零；别的包留着', () => {
    const 一 = 并入用量(空, { 暮色: { 版本: 'v1', 区段: ['0|0|0'] }, 主世界: { 版本: 'v2', 区段: ['0|1|1'] } }, [0, 1, 2]);
    const 二 = 并入用量(一, { 暮色: { 版本: 'v9', 区段: ['0|5|5'] } }, [3]);
    expect(二.包.暮色).toEqual({ 版本: 'v9', 区段: ['0|5|5'] });
    expect(二.包.主世界!.区段).toEqual(['0|1|1']);
    expect(二.已量帧).toBe('3');
  });
});

describe('收地形用量', () => {
  let 根: string;
  const 原 = process.env.ANIM_DATA;
  beforeEach(() => {
    根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形用量-'));
    process.env.ANIM_DATA = 根;
    vi.resetModules();
  });
  afterEach(() => {
    if (原 === undefined) delete process.env.ANIM_DATA;
    else process.env.ANIM_DATA = 原;
    fs.rmSync(根, { recursive: true, force: true });
  });

  /** 假浏览器：页面 close 前执行表达式，window 是给的数据 */
  const 假浏览器 = (窗: unknown) => {
    const 关了: string[] = [];
    const browser = {
      newPage: async () => ({
        _client: () => ({ send: async (_: string, a: { expression: string }) => ({ result: { value: new Function('window', `return ${a.expression}`)(窗) as string } }) }),
        close: async () => void 关了.push('关'),
      }),
    };
    return { browser: browser as unknown as HeadlessBrowser, 关了 };
  };
  const 窗 = (段: string | undefined, 用量: [string, { 版本: string; 区段: Set<string> }][]) => ({ process: { env: 段 ? { [地形用量段环境名]: 段 } : {} }, __地形用量: new Map(用量) });
  const 开页关页 = async (b: HeadlessBrowser) => {
    const page = await (b as unknown as { newPage: () => Promise<{ close: () => Promise<void> }> }).newPage();
    await page.close();
  };

  it('页面关掉前收走、写进 run/地形用量/<作品>/<段键>.json，多次累积；页面照常关', async () => {
    const { browser, 关了 } = 假浏览器(窗('甲作/段一', [['暮色', { 版本: 'v1', 区段: new Set(['0|1|1']) }]]));
    收地形用量(browser);
    await 开页关页(browser);
    await 等地形用量写完();
    expect(关了).toEqual(['关']);
    expect(地形用量文件('甲作', '段一')).toBe(path.join(根, 'run', '地形用量', '甲作', '段一.json'));
    await 记已量帧('段一', [0, 1], '甲作');
    await 开页关页(browser);
    await 记已量帧('段一', [2], '甲作');
    const r = 读地形用量('甲作', '段一')!;
    expect(r.包.暮色!.区段).toEqual(['0|1|1']);
    expect(r.已量帧).toBe('0-2');
  });

  it('读 Composition 列表的页面（没传段名）、没读地形的段都不留文件；先记帧后关页也接得上', async () => {
    const 列表 = 假浏览器(窗(undefined, [['暮色', { 版本: 'v1', 区段: new Set() }]]));
    收地形用量(列表.browser);
    await 开页关页(列表.browser);
    const 没读 = 假浏览器(窗('甲作/段二', []));
    收地形用量(没读.browser);
    await 开页关页(没读.browser);
    await 记已量帧('段二', [0], '甲作');
    expect(fs.existsSync(path.join(根, 'run', '地形用量', '甲作'))).toBe(false);
    const 读了 = 假浏览器(窗('甲作/段二', [['暮色', { 版本: 'v1', 区段: new Set(['0|0|0']) }]]));
    收地形用量(读了.browser);
    await 开页关页(读了.browser);
    expect(读地形用量('甲作', '段二')!.已量帧).toBe('0');
  });

  it('整段重渲：旧记录清掉，记下这次指纹', async () => {
    const 旧 = 假浏览器(窗('甲作/段三', [['主世界', { 版本: 'v1', 区段: new Set(['0|0|0']) }]]));
    收地形用量(旧.browser);
    await 开页关页(旧.browser);
    await 记已量帧('段三', [5], '甲作');
    开始整段量('段三', '指纹甲', '甲作');
    const 新 = 假浏览器(窗('甲作/段三', [['暮色', { 版本: 'v1', 区段: new Set(['0|9|9']) }]]));
    收地形用量(新.browser);
    await 开页关页(新.browser);
    await 记已量帧('段三', [0, 1], '甲作');
    const r = 读地形用量('甲作', '段三')!;
    expect(r.指纹).toBe('指纹甲');
    expect(Object.keys(r.包)).toEqual(['暮色']);
    expect(r.已量帧).toBe('0-1');
  });

  it('记录写不上只报警告：坏 JSON、关页时写失败都不抛，页面照常关；整段重渲清掉坏的就恢复', async () => {
    const 报 = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = 地形用量文件('甲作', '段四');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{坏');
    await expect(记已量帧('段四', [0], '甲作')).resolves.toBeUndefined();
    const { browser, 关了 } = 假浏览器(窗('甲作/段四', [['暮色', { 版本: 'v1', 区段: new Set(['0|0|0']) }]]));
    收地形用量(browser);
    await 开页关页(browser);
    expect(关了).toEqual(['关']);
    expect(报.mock.calls.flat().join()).toMatch(/段四 的地形用量没记上/);
    开始整段量('段四', '指纹乙', '甲作');
    await 开页关页(browser);
    await 记已量帧('段四', [0], '甲作');
    expect(读地形用量('甲作', '段四')).toMatchObject({ 指纹: '指纹乙', 已量帧: '0' });
    报.mockRestore();
  });

  it('开始整段量删不掉旧文件只报警告，接着照常量', () => {
    const 报 = vi.spyOn(console, 'error').mockImplementation(() => {});
    const 桩 = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EPERM');
    });
    expect(() => 开始整段量('段五', '指纹丙', '甲作')).not.toThrow();
    expect(报.mock.calls.flat().join()).toMatch(/段五 的地形用量没记上（EPERM）/);
    桩.mockRestore();
    报.mockRestore();
  });
});
