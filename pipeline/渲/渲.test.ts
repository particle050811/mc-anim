// 渲/渲.ts 不开浏览器能测的部分：Composition 和全片位置对不上要拦（帧数按 段输出窗于 精确比）、渲染标签的格式（耗时表按它查预计耗时）。
import { describe, expect, it } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import { 作品名 } from '../环境/作品.ts';
import { 找组合, 渲染标签 } from './渲.ts';

const 段 = (键: string, 秒 = 1.05) => ({ 键, 段: { 秒, 宽: 1920, 高: 1080 } }) as unknown as 段信息;
// 段长对齐到 1/60 秒，出 60 帧：甲 1.05 秒 63 帧、乙 1.5 秒 90 帧，在哪个位置都一样；核对段各自从 0 起
const 甲 = 段('6-甲');
const 乙 = 段('6-乙', 1.5);
const 核 = 段('核对-丙');
const 全部 = [甲, 乙, 核];
const 组合 = (o: Partial<{ id: string; durationInFrames: number; fps: number; width: number; height: number }> = {}) =>
  ({ id: '6-甲', durationInFrames: 63, fps: 60, width: 1920, height: 1080, ...o }) as never;

describe('找组合', () => {
  it('帧数要正好是段长 × 成片帧率', () => {
    expect(找组合({ 组合: [组合()] }, 甲, 全部)).toMatchObject({ id: '6-甲' });
    expect(找组合({ 组合: [组合({ id: '6-乙', durationInFrames: 90 })] }, 乙, 全部)).toMatchObject({ id: '6-乙' });
    expect(() => 找组合({ 组合: [组合({ id: '6-乙', durationInFrames: 63 })] }, 乙, 全部)).toThrow(/应是 90 帧 60fps/);
    expect(() => 找组合({ 组合: [组合({ durationInFrames: 62 })] }, 甲, 全部)).toThrow(/应是 63 帧 60fps/);
    expect(找组合({ 组合: [组合({ id: '核对-丙' })] }, 核, 全部)).toMatchObject({ id: '核对-丙' });
  });
  it('打包里没有、帧率不对的、画幅不对、段不在清单里都报错', () => {
    expect(() => 找组合({ 组合: [] }, 甲, 全部)).toThrow(/打包里没有 Composition 6-甲/);
    expect(() => 找组合({ 组合: [组合({ fps: 24, durationInFrames: 25 })] }, 甲, 全部)).toThrow(/25 帧 24fps 1920×1080）和 段.ts、全片位置对不上/);
    expect(() => 找组合({ 组合: [组合({ width: 1280 })] }, 甲, 全部)).toThrow(/对不上/);
    expect(() => 找组合({ 组合: [组合()] }, 甲, [乙])).toThrow(/不在这部作品的清单里/);
  });
});

describe('渲染标签', () => {
  it('带作品名、段键、级别（耗时表的标签列）', () => {
    expect(渲染标签('6-测试', '预览')).toBe(`render:${作品名()}/6-测试:预览`);
  });
});
