// 渲/渲.ts 不开浏览器能测的部分：Composition 和 段.ts 对不上要拦、渲染标签的格式（耗时表按它查预计耗时）。
import { describe, expect, it } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import { 作品名 } from '../环境/作品.ts';
import { 叠层渲染标签, 找组合, 渲染标签 } from './渲.ts';

const 段 = { 键: '6-测试', 段: { 帧数: 48, fps: 24, 宽: 1920, 高: 1080 } } as unknown as 段信息;
const 组合 = (o: Partial<{ id: string; durationInFrames: number; fps: number; width: number; height: number }> = {}) =>
  ({ id: '6-测试', durationInFrames: 48, fps: 24, width: 1920, height: 1080, ...o }) as never;

describe('找组合', () => {
  it('按段键（或叠层键）找，帧数、fps、画幅和 段.ts 一致才放过', () => {
    expect(找组合({ 组合: [组合()] }, 段)).toMatchObject({ id: '6-测试' });
    expect(找组合({ 组合: [组合({ id: '6-测试-字幕' })] }, 段, '6-测试-字幕')).toMatchObject({ id: '6-测试-字幕' });
  });
  it('打包里没有、或和 段.ts 对不上就报错', () => {
    expect(() => 找组合({ 组合: [] }, 段)).toThrow(/打包里没有 Composition 6-测试/);
    expect(() => 找组合({ 组合: [组合({ durationInFrames: 47 })] }, 段)).toThrow(/47 帧 24fps 1920×1080）和 段.ts 对不上/);
    expect(() => 找组合({ 组合: [组合({ width: 1280 })] }, 段)).toThrow(/和 段.ts 对不上/);
  });
});

describe('渲染标签', () => {
  it('带作品名、段键、级别（耗时表的标签列）', () => {
    expect(渲染标签('6-测试', '预览')).toBe(`render:${作品名()}/6-测试:预览`);
    expect(叠层渲染标签('6-测试-字幕', '视频')).toBe(`render-layer:${作品名()}/6-测试-字幕:视频`);
  });
});
