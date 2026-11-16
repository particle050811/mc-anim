import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessBrowser } from '@remotion/renderer';
import { terrainUsageSegEnv } from '../../engine/段/地形环境.ts';
import { encodeFrameRanges, mergeUsage, decodeFrameRanges, terrainUsageFile, readTerrainUsage, startWholeMeasure, collectTerrainUsage, recordMeasuredFrames, waitTerrainUsageWrites } from './地形用量.ts';

describe('帧段串', () => {
  it('升序去重，连续的并成一段，解回来一样', () => {
    expect(encodeFrameRanges([5, 1, 2, 3, 3, 9, 10])).toBe('1-3,5,9-10');
    expect(encodeFrameRanges([])).toBe('');
    expect(decodeFrameRanges('1-3,5,9-10')).toEqual([1, 2, 3, 5, 9, 10]);
    expect(decodeFrameRanges('')).toEqual([]);
  });
});

describe('并入用量', () => {
  const emptyUsage = { work: '甲', segment: '段', measuredFrames: '', pack: {} };
  it('按并集累积，区段按级、i、j 数值排', () => {
    const firstMerge = mergeUsage(emptyUsage, { 暮色: { version: 'v1', sections: ['1|2|3', '0|10|0'] } }, [0, 1]);
    const merged = mergeUsage(firstMerge, { 暮色: { version: 'v1', sections: ['0|9|0', '1|2|3'] }, 主世界: { version: 'v2', sections: [] } }, [2, 7]);
    expect(merged.pack.暮色!.sections).toEqual(['0|9|0', '0|10|0', '1|2|3']);
    expect(merged.pack.主世界).toEqual({ version: 'v2', sections: [] });
    expect(merged.measuredFrames).toBe('0-2,7');
  });
  it('包的版本换了：那个包作废重记，已量帧清零；别的包留着', () => {
    const firstMerge = mergeUsage(emptyUsage, { 暮色: { version: 'v1', sections: ['0|0|0'] }, 主世界: { version: 'v2', sections: ['0|1|1'] } }, [0, 1, 2]);
    const merged = mergeUsage(firstMerge, { 暮色: { version: 'v9', sections: ['0|5|5'] } }, [3]);
    expect(merged.pack.暮色).toEqual({ version: 'v9', sections: ['0|5|5'] });
    expect(merged.pack.主世界!.sections).toEqual(['0|1|1']);
    expect(merged.measuredFrames).toBe('3');
  });
});

describe('收地形用量', () => {
  let root: string;
  const savedAnimData = process.env.ANIM_DATA;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形用量-'));
    process.env.ANIM_DATA = root;
    vi.resetModules();
  });
  afterEach(() => {
    if (savedAnimData === undefined) delete process.env.ANIM_DATA;
    else process.env.ANIM_DATA = savedAnimData;
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** 假浏览器：页面 close 前执行表达式，window 是给的数据 */
  const fakeBrowser = (fakeWindow: unknown) => {
    const closedLog: string[] = [];
    const browser = {
      newPage: async () => ({
        _client: () => ({ send: async (_: string, a: { expression: string }) => ({ result: { value: new Function('window', `return ${a.expression}`)(fakeWindow) as string } }) }),
        close: async () => void closedLog.push('关'),
      }),
    };
    return { browser: browser as unknown as HeadlessBrowser, closedLog };
  };
  const makeWindow = (segKey: string | undefined, usage: [string, { version: string; sections: Set<string> }][]) => ({ process: { env: segKey ? { [terrainUsageSegEnv]: segKey } : {} }, terrainUsage: new Map(usage) });
  const openPageThenClose = async (b: HeadlessBrowser) => {
    const page = await (b as unknown as { newPage: () => Promise<{ close: () => Promise<void> }> }).newPage();
    await page.close();
  };

  it('页面关掉前收走、写进 run/地形用量/<作品>/<段键>.json，多次累积；页面照常关', async () => {
    const { browser, closedLog } = fakeBrowser(makeWindow('甲作/段一', [['暮色', { version: 'v1', sections: new Set(['0|1|1']) }]]));
    collectTerrainUsage(browser);
    await openPageThenClose(browser);
    await waitTerrainUsageWrites();
    expect(closedLog).toEqual(['关']);
    expect(terrainUsageFile('甲作', '段一')).toBe(path.join(root, 'run', '地形用量', '甲作', '段一.json'));
    await recordMeasuredFrames('段一', [0, 1], '甲作');
    await openPageThenClose(browser);
    await recordMeasuredFrames('段一', [2], '甲作');
    const r = readTerrainUsage('甲作', '段一')!;
    expect(r.pack.暮色!.sections).toEqual(['0|1|1']);
    expect(r.measuredFrames).toBe('0-2');
  });

  it('读 Composition 列表的页面（没传段名）、没读地形的段都不留文件；先记帧后关页也接得上', async () => {
    const fakeHandle = fakeBrowser(makeWindow(undefined, [['暮色', { version: 'v1', sections: new Set() }]]));
    collectTerrainUsage(fakeHandle.browser);
    await openPageThenClose(fakeHandle.browser);
    const noRead = fakeBrowser(makeWindow('甲作/段二', []));
    collectTerrainUsage(noRead.browser);
    await openPageThenClose(noRead.browser);
    await recordMeasuredFrames('段二', [0], '甲作');
    expect(fs.existsSync(path.join(root, 'run', '地形用量', '甲作'))).toBe(false);
    const reader = fakeBrowser(makeWindow('甲作/段二', [['暮色', { version: 'v1', sections: new Set(['0|0|0']) }]]));
    collectTerrainUsage(reader.browser);
    await openPageThenClose(reader.browser);
    expect(readTerrainUsage('甲作', '段二')!.measuredFrames).toBe('0');
  });

  it('整段重渲：旧记录清掉，记下这次指纹', async () => {
    const prevBrowser = fakeBrowser(makeWindow('甲作/段三', [['主世界', { version: 'v1', sections: new Set(['0|0|0']) }]]));
    collectTerrainUsage(prevBrowser.browser);
    await openPageThenClose(prevBrowser.browser);
    await recordMeasuredFrames('段三', [5], '甲作');
    startWholeMeasure('段三', '指纹甲', '甲作');
    const nextBrowser = fakeBrowser(makeWindow('甲作/段三', [['暮色', { version: 'v1', sections: new Set(['0|9|9']) }]]));
    collectTerrainUsage(nextBrowser.browser);
    await openPageThenClose(nextBrowser.browser);
    await recordMeasuredFrames('段三', [0, 1], '甲作');
    const r = readTerrainUsage('甲作', '段三')!;
    expect(r.fingerprint).toBe('指纹甲');
    expect(Object.keys(r.pack)).toEqual(['暮色']);
    expect(r.measuredFrames).toBe('0-1');
  });

  it('记录写不上只报警告：坏 JSON、关页时写失败都不抛，页面照常关；整段重渲清掉坏的就恢复', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = terrainUsageFile('甲作', '段四');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{坏');
    await expect(recordMeasuredFrames('段四', [0], '甲作')).resolves.toBeUndefined();
    const { browser, closedLog } = fakeBrowser(makeWindow('甲作/段四', [['暮色', { version: 'v1', sections: new Set(['0|0|0']) }]]));
    collectTerrainUsage(browser);
    await openPageThenClose(browser);
    expect(closedLog).toEqual(['关']);
    expect(errorSpy.mock.calls.flat().join()).toMatch(/段四 的地形用量没记上/);
    startWholeMeasure('段四', '指纹乙', '甲作');
    await openPageThenClose(browser);
    await recordMeasuredFrames('段四', [0], '甲作');
    expect(readTerrainUsage('甲作', '段四')).toMatchObject({ fingerprint: '指纹乙', measuredFrames: '0' });
    errorSpy.mockRestore();
  });

  it('开始整段量删不掉旧文件只报警告，接着照常量', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stub = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EPERM');
    });
    expect(() => startWholeMeasure('段五', '指纹丙', '甲作')).not.toThrow();
    expect(errorSpy.mock.calls.flat().join()).toMatch(/段五 的地形用量没记上（EPERM）/);
    stub.mockRestore();
    errorSpy.mockRestore();
  });
});
