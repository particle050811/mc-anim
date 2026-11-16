import { describe, expect, it } from 'vitest';
import { applyTelescope, parseTelescope } from './望远.ts';

const fullSize = [3840, 2160] as const;

describe('解析望远', () => {
  it('x,y,宽：高按原帧宽高比，倍 = 全宽 ÷ 宽', () => {
    const [c] = parseTelescope('1440,630,480', fullSize);
    expect(c).toMatchObject({ x: 1440, y: 630, 宽: 480, 高: 270, zoom: 8, fineLevel: false, 真值: false, 名: 'x1440-y630-宽480' });
    expect(JSON.parse(c!.值)).toEqual({ left: 0.375, 上: 630 / 2160, widthRatio: 0.125, fineLevel: false, 真值: false });
  });
  it('心x,心y,倍x：按中心和倍数', () => {
    const [c] = parseTelescope('1920,1080,4x', fullSize, { fineLevel: true });
    expect(c).toMatchObject({ x: 1440, y: 810, 宽: 960, 高: 540, zoom: 4, 名: 'x1440-y810-宽960-细一级' });
  });
  it('开关进文件名和给页面的值', () => {
    const [c] = parseTelescope('1920,1080,4x', fullSize, { fineLevel: true, 真值: true });
    expect(c!.名).toBe('x1440-y810-宽960-细一级-真值');
    expect(JSON.parse(c!.值)).toMatchObject({ fineLevel: true, 真值: true });
    expect(parseTelescope('1920,1080,4x', fullSize, { 真值: true })[0]!.名).toBe('x1440-y810-宽960-真值');
    expect(parseTelescope('1920,1080,4x; 1920,1080,4x,真值', fullSize).map((c) => c.名)).toEqual(['x1440-y810-宽960', 'x1440-y810-宽960-真值']);
    expect(() => parseTelescope('1920,1080,4x,细二级', fullSize)).toThrow(/要写成/);
  });
  it('整帧 = 1 倍', () => {
    expect(JSON.parse(parseTelescope('0,0,3840', fullSize)[0]!.值)).toEqual({ left: 0, 上: 0, widthRatio: 1, fineLevel: false, 真值: false });
  });
  it('分号隔开的几块各出一份', () => {
    expect(parseTelescope('0,0,1920; 1920,1080,2x', fullSize).map((c) => c.名)).toEqual(['x0-y0-宽1920', 'x960-y540-宽1920']);
  });
  it('超出原帧、写错的报错', () => {
    expect(() => parseTelescope('3000,0,1000', fullSize)).toThrow(/超出原帧/);
    expect(() => parseTelescope('0,2000,960', fullSize)).toThrow(/超出原帧/);
    expect(() => parseTelescope('100,100,16x', fullSize)).toThrow(/超出原帧/);
    expect(() => parseTelescope('0,0', fullSize)).toThrow(/要写成/);
    expect(() => parseTelescope('a,0,100', fullSize)).toThrow(/要是数/);
    expect(() => parseTelescope('1920,1080,0.5x', fullSize)).toThrow(/不能小于 1/);
  });
});

describe('套望远', () => {
  it('望远入口排在作品入口前面，别的入口顺序不变', async () => {
    const c = await applyTelescope(async (x) => x, '/作品/index.ts')({ entry: ['/a.js', '/作品/index.ts', '/b.js'] });
    const entries = c.entry as string[];
    expect(entries).toHaveLength(4);
    expect([entries[0], entries[2], entries[3]]).toEqual(['/a.js', '/作品/index.ts', '/b.js']);
    expect(entries[1]).toMatch(/engine[\\/]段[\\/]望远\.ts$/);
  });
  it('找不到作品入口就报错', async () => {
    await expect(applyTelescope(async (x) => x, '/作品/index.ts')({ entry: ['/a.js'] })).rejects.toThrow(/找不到作品入口/);
  });
});
