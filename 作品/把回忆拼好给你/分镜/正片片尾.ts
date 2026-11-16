// 正片片尾（段 2-拼回）的事件和段窗口；起点 片尾白光 在 正片15尾.ts。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';
import * as mainCutLine15Tail from './正片15尾.ts';

export const eventDefs = {
  // 片尾（开场与片尾这一路）：54.65 = 第 32 小节下拍，55.50 = 第 130 拍
  outroRecolor: { 在: { beat: 130 }, basis: '三稿片尾 55.50：「啪」地回色，新合照换掉旧图标、上次游玩换成这次，构图回到第 0 镜，停到原声放完（0.5 秒）' },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...mainCutLine15Tail.eventTable, ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片结尾：片尾（54.65 咔哒闪白起，从图标跟前拉回「选择世界」界面，碎片拼成新合照），放到原声完 */
export const mainCutOutro = arrangeSegs(
  {
    name: '正片片尾',
    duration: originalDurSec,
    segments: [{ key: '2-拼回', start: { after: 'outroFlash', addSec: 0 }, end: '放完', basis: '咔哒那一帧（54.65）起：闪白里拉出「新的世界」那一项，到原声放完；最后构图和第 0 镜一样，能接回开头循环' }],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutOutro);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
