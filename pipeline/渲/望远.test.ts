import { describe, expect, it } from 'vitest';
import { 套望远, 解析望远 } from './望远.ts';

const 全 = [3840, 2160] as const;

describe('解析望远', () => {
  it('x,y,宽：高按原帧宽高比，倍 = 全宽 ÷ 宽', () => {
    const [c] = 解析望远('1440,630,480', 全);
    expect(c).toMatchObject({ x: 1440, y: 630, 宽: 480, 高: 270, 倍: 8, 细一级: false, 真值: false, 名: 'x1440-y630-宽480' });
    expect(JSON.parse(c!.值)).toEqual({ 左: 0.375, 上: 630 / 2160, 占: 0.125, 细一级: false, 真值: false });
  });
  it('心x,心y,倍x：按中心和倍数', () => {
    const [c] = 解析望远('1920,1080,4x', 全, { 细一级: true });
    expect(c).toMatchObject({ x: 1440, y: 810, 宽: 960, 高: 540, 倍: 4, 名: 'x1440-y810-宽960-细一级' });
  });
  it('开关进文件名和给页面的值', () => {
    const [c] = 解析望远('1920,1080,4x', 全, { 细一级: true, 真值: true });
    expect(c!.名).toBe('x1440-y810-宽960-细一级-真值');
    expect(JSON.parse(c!.值)).toMatchObject({ 细一级: true, 真值: true });
    expect(解析望远('1920,1080,4x', 全, { 真值: true })[0]!.名).toBe('x1440-y810-宽960-真值');
    expect(解析望远('1920,1080,4x; 1920,1080,4x,真值', 全).map((c) => c.名)).toEqual(['x1440-y810-宽960', 'x1440-y810-宽960-真值']);
    expect(() => 解析望远('1920,1080,4x,细二级', 全)).toThrow(/要写成/);
  });
  it('整帧 = 1 倍', () => {
    expect(JSON.parse(解析望远('0,0,3840', 全)[0]!.值)).toEqual({ 左: 0, 上: 0, 占: 1, 细一级: false, 真值: false });
  });
  it('分号隔开的几块各出一份', () => {
    expect(解析望远('0,0,1920; 1920,1080,2x', 全).map((c) => c.名)).toEqual(['x0-y0-宽1920', 'x960-y540-宽1920']);
  });
  it('超出原帧、写错的报错', () => {
    expect(() => 解析望远('3000,0,1000', 全)).toThrow(/超出原帧/);
    expect(() => 解析望远('0,2000,960', 全)).toThrow(/超出原帧/);
    expect(() => 解析望远('100,100,16x', 全)).toThrow(/超出原帧/);
    expect(() => 解析望远('0,0', 全)).toThrow(/要写成/);
    expect(() => 解析望远('a,0,100', 全)).toThrow(/要是数/);
    expect(() => 解析望远('1920,1080,0.5x', 全)).toThrow(/不能小于 1/);
  });
});

describe('套望远', () => {
  it('望远入口排在作品入口前面，别的入口顺序不变', async () => {
    const c = await 套望远(async (x) => x, '/作品/index.ts')({ entry: ['/a.js', '/作品/index.ts', '/b.js'] });
    const 入口 = c.entry as string[];
    expect(入口).toHaveLength(4);
    expect([入口[0], 入口[2], 入口[3]]).toEqual(['/a.js', '/作品/index.ts', '/b.js']);
    expect(入口[1]).toMatch(/engine[\\/]core[\\/]望远\.ts$/);
  });
  it('找不到作品入口就报错', async () => {
    await expect(套望远(async (x) => x, '/作品/index.ts')({ entry: ['/a.js'] })).rejects.toThrow(/找不到作品入口/);
  });
});
