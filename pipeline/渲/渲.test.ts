// 渲/渲.ts 不开浏览器能测的部分：Composition 和全片位置对不上要拦（帧数按 段输出窗于 精确比）、渲染标签的格式（耗时表按它查预计耗时）。
import { describe, expect, it } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import { workName } from '../环境/作品.ts';
import { findComposition, renderLabel } from './渲.ts';

const makeSeg = (segKey: string, durSec = 1.05) => ({ 键: segKey, 段: { 秒: durSec, 宽: 1920, 高: 1080 } }) as unknown as SegInfo;
// 段长对齐到 1/60 秒，出 60 帧：甲 1.05 秒 63 帧、乙 1.5 秒 90 帧，在哪个位置都一样；核对段各自从 0 起
const firstSegment = makeSeg('6-甲');
const secondSeg = makeSeg('6-乙', 1.5);
const checkSeg = makeSeg('核对-丙');
const allSegments = [firstSegment, secondSeg, checkSeg];
const makeComposition = (o: Partial<{ id: string; durationInFrames: number; fps: number; width: number; height: number }> = {}) =>
  ({ id: '6-甲', durationInFrames: 63, fps: 60, width: 1920, height: 1080, ...o }) as never;

describe('找组合', () => {
  it('帧数要正好是段长 × 成片帧率', () => {
    expect(findComposition({ compositions: [makeComposition()] }, firstSegment, allSegments)).toMatchObject({ id: '6-甲' });
    expect(findComposition({ compositions: [makeComposition({ id: '6-乙', durationInFrames: 90 })] }, secondSeg, allSegments)).toMatchObject({ id: '6-乙' });
    expect(() => findComposition({ compositions: [makeComposition({ id: '6-乙', durationInFrames: 63 })] }, secondSeg, allSegments)).toThrow(/应是 90 帧 60fps/);
    expect(() => findComposition({ compositions: [makeComposition({ durationInFrames: 62 })] }, firstSegment, allSegments)).toThrow(/应是 63 帧 60fps/);
    expect(findComposition({ compositions: [makeComposition({ id: '核对-丙' })] }, checkSeg, allSegments)).toMatchObject({ id: '核对-丙' });
  });
  it('打包里没有、帧率不对的、画幅不对、段不在清单里都报错', () => {
    expect(() => findComposition({ compositions: [] }, firstSegment, allSegments)).toThrow(/打包里没有 Composition 6-甲/);
    expect(() => findComposition({ compositions: [makeComposition({ fps: 24, durationInFrames: 25 })] }, firstSegment, allSegments)).toThrow(/25 帧 24fps 1920×1080）和 段.ts、全片位置对不上/);
    expect(() => findComposition({ compositions: [makeComposition({ width: 1280 })] }, firstSegment, allSegments)).toThrow(/对不上/);
    expect(() => findComposition({ compositions: [makeComposition()] }, firstSegment, [secondSeg])).toThrow(/不在这部作品的清单里/);
  });
});

describe('渲染标签', () => {
  it('带作品名、段键、级别（耗时表的标签列）', () => {
    expect(renderLabel('6-测试', '预览')).toBe(`render:${workName()}/6-测试:预览`);
  });
});
