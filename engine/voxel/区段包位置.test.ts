import { afterEach, describe, expect, it } from 'vitest';
import { 地形版本环境名 } from '../段/地形环境.ts';
import { packDir } from './区段包位置.ts';

afterEach(() => {
  delete process.env[地形版本环境名];
});

describe('packDir 只认本页拿到的版本表', () => {
  it('声明的包拼出路径；换了表跟着换', () => {
    process.env[地形版本环境名] = JSON.stringify({ 甲: 'v1' });
    expect(packDir('甲')).toBe('terrain/甲/v1');
    process.env[地形版本环境名] = JSON.stringify({ 甲: 'v2' });
    expect(packDir('甲')).toBe('terrain/甲/v2');
  });

  it('读没声明的包报错，说得出声明了哪些，不退回全表', () => {
    process.env[地形版本环境名] = JSON.stringify({ 甲: 'v1', 乙: 'v2' });
    expect(() => packDir('丙')).toThrow(/没声明的区段包 丙.*甲、乙/);
    process.env[地形版本环境名] = '{}';
    expect(() => packDir('甲')).toThrow(/没声明的区段包 甲.*无/);
  });

  it('页面没拿到版本表也报错', () => {
    expect(() => packDir('甲')).toThrow(/没拿到地形版本表/);
  });
});
