// 测试按 60 帧核对段.ts 用：秒的 cue、段长、场窗口换回帧号（跨段音效.ts 的 按帧cue 反过来）。这部作品的分镜、音效都按 60 帧的歌曲帧排。
import { 段帧数, 是逐格, type 声音cue, type 段定义 } from '@engine/段/段定义.ts';
import { fps } from '../分镜/时间.ts';
import type { 帧上cue } from './跨段音效.ts';

const 圆 = (x: number) => Math.round(x * 1e6) / 1e6;

export const 回帧 = (c: 声音cue): 帧上cue => {
  if (c.资产 === undefined) throw new Error(`台词 cue ${c.台词} 不回帧`);
  const { 秒, 长秒, 增益, 淡出秒, ...其余 } = c;
  if (是逐格(增益) && 增益.每秒 !== fps) throw new Error(`${c.名} 的逐格增益每秒 ${增益.每秒}，不是 ${fps}`);
  return {
    ...其余,
    帧: 圆(秒 * fps),
    帧数: 圆(长秒 * fps),
    ...(增益 === undefined ? {} : { 增益: 是逐格(增益) ? 增益.值 : 增益 }),
    ...(淡出秒 === undefined ? {} : { 淡出: 圆(淡出秒 * fps) }),
  };
};

export const 回帧们 = (段: Pick<段定义, '声音'>): 帧上cue[] => (段.声音 ?? []).map(回帧);
export const 帧数于 = (段: Pick<段定义, '秒'>) => 段帧数(段, fps);
export const 窗帧 = (段: Pick<段定义, '场窗口'>) => 段.场窗口 && { 起帧: 圆(段.场窗口.起秒 * fps), 止帧: 圆(段.场窗口.止秒 * fps) };
