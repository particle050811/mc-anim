import { afterEach, describe, expect, it } from 'vitest';
import { 地形版本环境名, 地形用量段环境名 } from '../段/地形环境.ts';
import { packDir } from './区段包位置.ts';
import { 记读区段 } from './地形用量.ts';

const g = globalThis as { __地形用量?: Map<string, { 版本: string; 区段: Set<string> }> };
afterEach(() => {
  delete process.env[地形版本环境名];
  delete process.env[地形用量段环境名];
  delete g.__地形用量;
});

describe('地形用量', () => {
  it('传了段名才记；读过的包和区段都在，没读的包不在', () => {
    process.env[地形版本环境名] = JSON.stringify({ 甲: 'v1', 乙: 'v2' });
    packDir('甲');
    记读区段('甲', ['0|1|2']);
    expect(g.__地形用量).toBeUndefined();
    process.env[地形用量段环境名] = '作品/段';
    packDir('甲');
    记读区段('甲', ['0|1|2', '1|0|0']);
    记读区段('甲', ['0|1|2']);
    expect([...g.__地形用量!.keys()]).toEqual(['甲']);
    expect(g.__地形用量!.get('甲')!.版本).toBe('v1');
    expect([...g.__地形用量!.get('甲')!.区段]).toEqual(['0|1|2', '1|0|0']);
  });

  it('区段不经 packDir 就记：是接错了，报错', () => {
    process.env[地形用量段环境名] = '作品/段';
    expect(() => 记读区段('甲', ['0|1|2'])).toThrow(/要经 packDir/);
  });
});
