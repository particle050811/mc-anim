import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-收集快乐/段.ts';
import { 正片事件, 段内正片事件帧, 段窗口, 第几句, fps } from './分镜.ts';
import { 收照片站位, 照片举位, 照片举缩放, 苦力怕走倍率, 苦力怕逃倍率, 苦力怕掉头帧, 纸声们, 纸声峰值, 纸声顺序 } from './场/2-门口/第8句参数.ts';
import { 哈气站位, 第8句镜头 } from './场/2-门口/第8句.ts';
import { 第8句照片们, 照片像素, 照片尺寸, 照片细分 } from './特效/照片画.ts';

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

  it('cue：原声铺满整段；四声纸声最响的那一下落在收照片那一拍上、峰值配到同一档；哈气声在哈气前 2 帧起放；都不过段尾', () => {
    const 事 = 段内正片事件帧('2-收集快乐');
    const 声 = 段.声音 as 资产cue[];
    expect(声.find((c) => c.名 === '原声')).toMatchObject({ 帧: 0, 帧数: 76, 入点秒: 611 / 24 });
    const 纸 = 声.filter((c) => c.资产.startsWith('音效/item.book.page_turn'));
    const 拍们 = [事.收照片一, 事.收照片二, 事.收照片三, 事.收照片四];
    纸.forEach((c, i) => {
      const 文件 = 纸声们[纸声顺序[i]!]!;
      expect(c.资产).toBe(文件.资产);
      // 文件里最响那一帧在段内哪一帧：cue 起点 − 入点
      expect(c.帧 - Math.round((c.入点秒 ?? 0) * fps) + 文件.峰帧).toBe(拍们[i]);
      expect(20 * Math.log10(c.增益 as number) + 文件.峰值).toBeCloseTo(纸声峰值, 3);
    });
    expect(声.find((c) => c.名 === '哈气')!.帧).toBe(事.哈气 - 2);
    for (const c of 声) expect(c.帧 + c.帧数).toBeLessThanOrEqual(段.帧数);
  });

  it('站位：哈气时苦力怕离你四五格；她收照片时站在门洞和箱子之间', () => {
    expect(哈气站位.你 - 哈气站位.苦力怕).toBeGreaterThanOrEqual(4);
    expect(哈气站位.你 - 哈气站位.苦力怕).toBeLessThanOrEqual(5);
    expect(收照片站位).toBeGreaterThanOrEqual(0);
    expect(收照片站位).toBeLessThan(1 - 7 / 16);
    // 照片举着时横在她的脸（她脚底 ± 0.25 格）和你的左臂中间，下边高过箱子（15/16 格）
    const 宽 = (照片尺寸(第8句照片们[0]!).宽 / 16 / 照片细分) * 照片举缩放;
    expect(照片举位[0] - 宽 / 2).toBeGreaterThan(收照片站位 + 0.25);
    expect(照片举位[0] + 宽 / 2).toBeLessThan(哈气站位.你 - 0.5);
    expect(照片举位[2]).toBeGreaterThan(15 / 16);
    // 举着不动时照片像素是整的成片像素（N = 16 时 5 像素）
    expect(Number.isInteger(照片举缩放 * 照片细分)).toBe(true);
  });

  it('苦力怕按原版追人速度（2.7 米/秒）走，从画框左边走进来（26.53 前后）；逃出画框在段尾之前', () => {
    const 追 = (((1 * 0.25) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20;
    const 左沿 = -1280 / 第8句镜头.取景.每格;
    const 进画帧 = 正片事件.哈气.帧 - ((哈气站位.苦力怕 - (左沿 - 6 / 16)) / (追 * 苦力怕走倍率)) * fps;
    expect(Math.abs(进画帧 - 正片事件.苦力怕冒头.帧)).toBeLessThan(4);
    const 逃 = 3.89 * 苦力怕逃倍率;
    const 出画帧 = 正片事件.苦力怕掉头.帧 + 苦力怕掉头帧 + ((哈气站位.苦力怕 - (左沿 - 6 / 16)) / 逃) * fps;
    expect(出画帧).toBeLessThan(段窗口('2-收集快乐').止帧);
  });

  it('照片：64×36 的画面（比方块贴图细 4 倍）加白边 68×46', () => {
    for (const 画 of 第8句照片们) {
      expect(照片尺寸(画)).toEqual({ 宽: 68, 高: 46 });
      expect(照片像素(画)).toHaveLength(68 * 46 * 4); // 小图字符没颜色、颜色写错都会抛
    }
  });
});
