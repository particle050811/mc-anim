import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-收集快乐/段.ts';
import { 正片事件, 段内正片事件帧, 段窗口, 第几句, fps } from './分镜.ts';
import { 哈气站位, 收照片站位, 照片举位, 苦力怕草丛后y } from './场/2-门口/第8句参数.ts';
import { 整屏镜头, 整屏镜头N, 门外草丛 } from './场/2-门口/整屏镜头.ts';
import { 第8句照片们, 照片像素, 照片尺寸 } from './特效/照片画.ts';

describe('2-收集快乐：第 8 句整句一个镜头', () => {
  it('窗口从第 8 句首字到第 9 句首字（歌曲帧 611～687）', () => {
    const w = 段窗口('2-收集快乐');
    expect([w.起帧, w.止帧]).toEqual([611, 687]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(8).起, 1);
    expect(段.帧数).toBe(76);
    expect(段.场窗口).toEqual({ 起帧: 611, 止帧: 687 });
  });

  it('三稿的拍：收照片 25.67、26.10、26.53、26.95，苦力怕 26.53、27.38，哈气 27.80，淘 28.23（差不到半帧）', () => {
    const 对 = [
      [正片事件.收照片一, 25.67], [正片事件.收照片二, 26.1], [正片事件.收照片三, 26.53], [正片事件.收照片四, 26.95],
      [正片事件.苦力怕冒头, 26.53], [正片事件.苦力怕摸到背后, 27.38], [正片事件.哈气, 27.8], [正片事件.苦力怕逃, 28.23],
    ] as const;
    for (const [e, 秒] of 对) expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
    expect(正片事件.哈气.帧).toBe(667);
  });

  it('cue：原声铺满整段；四声纸声在四张照片落进去之前 3 帧起放；哈气声在哈气前 2 帧起放；都不过段尾', () => {
    const 事 = 段内正片事件帧('2-收集快乐');
    const 声 = 段.声音 as 资产cue[];
    expect(声.find((c) => c.名 === '原声')).toMatchObject({ 帧: 0, 帧数: 76, 入点秒: 611 / 24 });
    const 纸 = 声.filter((c) => c.资产.startsWith('音效/item.book.page_turn'));
    expect(纸.map((c) => c.帧)).toEqual([事.收照片一, 事.收照片二, 事.收照片三, 事.收照片四].map((f) => f - 3));
    expect(声.find((c) => c.名 === '哈气')!.帧).toBe(事.哈气 - 2);
    for (const c of 声) expect(c.帧 + c.帧数).toBeLessThanOrEqual(段.帧数);
  });

  it('站位：哈气时苦力怕离你四五格；她收照片时站在门洞和箱子之间', () => {
    expect(哈气站位.你 - 哈气站位.苦力怕).toBeGreaterThanOrEqual(4);
    expect(哈气站位.你 - 哈气站位.苦力怕).toBeLessThanOrEqual(5);
    expect(收照片站位).toBeGreaterThanOrEqual(0);
    expect(收照片站位).toBeLessThan(1 - 7 / 16);
    // 照片举在箱子正上方，下边高过箱子（15/16 格）
    expect(照片举位[0]).toBe(1);
    expect(照片举位[2]).toBeGreaterThan(15 / 16);
  });

  it('苦力怕按原版追人速度（2.7 米/秒）走，26.53 正在草丛右沿冒出来；草丛的正面片在它前面', () => {
    const 走 = (((1 * 0.25) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20;
    const x冒头 = 哈气站位.苦力怕 - (走 * (正片事件.哈气.帧 - 正片事件.苦力怕冒头.帧)) / fps;
    const 草右沿 = Math.max(...门外草丛.map(([, x]) => x)) + 0.5;
    expect(Math.abs(x冒头 + 6 / 16 - 草右沿)).toBeLessThan(0.5);
    expect(苦力怕草丛后y - 0.25).toBeGreaterThan(0.5);
  });

  it('整屏镜头 N = 10，描边一个贴图像素宽；照片 18×12 个贴图像素', () => {
    expect(整屏镜头N).toBe(10);
    expect(整屏镜头.描边宽).toBe(10);
    for (const 画 of 第8句照片们) {
      expect(照片尺寸(画)).toEqual({ 宽: 18, 高: 12 });
      expect(照片像素(画)).toHaveLength(18 * 12 * 4); // 行数、每行字符数、每个字符都有颜色，不对就抛
    }
  });
});
