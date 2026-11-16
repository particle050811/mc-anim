import { afterEach, describe, expect, it } from 'vitest';
import { terrainVersionEnv, terrainUsageSegEnv } from '../段/地形环境.ts';
import { packDir } from './区段包位置.ts';
import { recordSectionRead } from './地形用量.ts';

const g = globalThis as { terrainUsage?: Map<string, { version: string; sections: Set<string> }> };
afterEach(() => {
  delete process.env[terrainVersionEnv];
  delete process.env[terrainUsageSegEnv];
  delete g.terrainUsage;
});

describe('地形用量', () => {
  it('传了段名才记；读过的包和区段都在，没读的包不在', () => {
    process.env[terrainVersionEnv] = JSON.stringify({ 甲: 'v1', 乙: 'v2' });
    packDir('甲');
    recordSectionRead('甲', ['0|1|2']);
    expect(g.terrainUsage).toBeUndefined();
    process.env[terrainUsageSegEnv] = '作品/段';
    packDir('甲');
    recordSectionRead('甲', ['0|1|2', '1|0|0']);
    recordSectionRead('甲', ['0|1|2']);
    expect([...g.terrainUsage!.keys()]).toEqual(['甲']);
    expect(g.terrainUsage!.get('甲')!.version).toBe('v1');
    expect([...g.terrainUsage!.get('甲')!.sections]).toEqual(['0|1|2', '1|0|0']);
  });

  it('区段不经 packDir 就记：是接错了，报错', () => {
    process.env[terrainUsageSegEnv] = '作品/段';
    expect(() => recordSectionRead('甲', ['0|1|2'])).toThrow(/要经 packDir/);
  });
});
