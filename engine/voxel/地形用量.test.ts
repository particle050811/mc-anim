import { afterEach, describe, expect, it } from 'vitest';
import { terrainVersionEnv, terrainUsageSegEnv, terrainCoverEnv } from '../段/地形环境.ts';
import { packDir } from './区段包位置.ts';
import { noteCoverWorld, recordSectionRead, setCoverFrame } from './地形用量.ts';

const g = globalThis as { terrainUsage?: Map<string, { version: string; sections: Set<string> }>; terrainCoverFirst?: Map<string, Map<string, number>>; terrainCoverWorlds?: Set<string>; terrainCoverFrame?: number };
afterEach(() => {
  delete process.env[terrainVersionEnv];
  delete process.env[terrainUsageSegEnv];
  delete process.env[terrainCoverEnv];
  delete g.terrainUsage;
  delete g.terrainCoverFirst;
  delete g.terrainCoverWorlds;
  delete g.terrainCoverFrame;
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

  it('覆盖页：记每个区段头一次用到的帧，和体素世界从哪些包挑过（挑出 0 个也算）；不是覆盖页不记', () => {
    process.env[terrainVersionEnv] = JSON.stringify({ 甲: 'v1', 乙: 'v2' });
    process.env[terrainUsageSegEnv] = '作品/段';
    noteCoverWorld('甲');
    expect(g.terrainCoverWorlds).toBeUndefined();
    process.env[terrainCoverEnv] = '段';
    packDir('甲');
    packDir('乙');
    setCoverFrame(5);
    recordSectionRead('甲', ['0|1|2']);
    noteCoverWorld('甲');
    setCoverFrame(3);
    recordSectionRead('甲', ['0|1|2', '1|0|0']);
    noteCoverWorld('乙');
    expect(Object.fromEntries(g.terrainCoverFirst!.get('甲')!)).toEqual({ '0|1|2': 3, '1|0|0': 3 });
    expect([...g.terrainCoverWorlds!]).toEqual(['甲', '乙']);
    expect(g.terrainCoverFirst!.has('乙')).toBe(false);
  });
});
