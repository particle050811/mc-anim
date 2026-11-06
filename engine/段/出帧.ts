// 段在输出帧上的位置（纯数据，pipeline 也 import）：段长对齐到 1/段格 秒（段定义.ts），成片按成片档的帧率出（4K60、1080P60）。
// 第 0 个输出帧就是段起点，段内第 g 帧是第 g ÷ fps 秒，段和段之间没有零头（用户 11-06 定原生 60 帧，docs/决策/0015-原生60帧.md）。
import { 段帧数, type 段定义 } from './段定义.ts';

/** 清单顺序里各正片段的全片起帧（输出帧；核对段不进成片，各自从 0 起） */
export const 全片起帧表 = (段们: readonly { 键: string; 段: Pick<段定义, '秒'> }[], fps: number): Map<string, number> => {
  const 表 = new Map<string, number>();
  let at = 0;
  for (const s of 段们) {
    if (s.键.startsWith('核对-')) {
      表.set(s.键, 0);
      continue;
    }
    表.set(s.键, at);
    at += 段帧数(s.段, fps);
  }
  return 表;
};
