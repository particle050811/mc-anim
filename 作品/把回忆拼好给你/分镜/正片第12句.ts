// 正片第 12 句（段 2-空床）的事件和段窗口；第 12 句歌词进、横移起在 歌词.ts。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';

export const eventDefs = {
  // 第 12 句（卧室侧剖面，整句一个镜头）：38.46 = 第 90 拍，39.31 = 第 92 拍（第 23 小节），41.01 = 第 96 拍（第 24 小节）
  smoothBlanket: { 在: { beat: 90 }, basis: '三稿 38.46：服务器还开着、你下线后的第一夜，她把你那张空床的被子抚平，不冒气泡' },
  sitBedEdge: { 在: { beat: 92 }, basis: '三稿 39.31：她在你床沿坐下，面朝卧室门口；她自己那张女仆床就在旁边，一直空着' },
  windowLightStep2: { 在: { beat: 93 }, basis: '三稿 39.31–41.01 窗光从月光一路扫到天亮、她一动不动：光斑按拍一档一档挪（平涂、不出渐变），第二档（Agent 暂定）' },
  windowLightStep3: { 在: { beat: 94 }, basis: '窗光第三档：月亮低了，光斑爬上后墙右边（Agent 暂定）' },
  moonset: { 在: { beat: 94.5 }, basis: '窗光第四档：月亮落了，屋里最暗、后窗的天开始发白；半拍后天亮（天亮前那一下暗得短，窗光一档比一档换得快）（Agent 暂定）' },
  dawnTurnHead: { 在: { beat: 95 }, basis: '三稿 41.01：天一亮，她猛地转头看门口，没有人。核查 10-24「天亮转头到横移起要多给点时间」：提前一拍到 40.59，横移起 前停一拍半（0.64 秒）看清门口空着（Agent 暂定）' },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片第 12 句：一段，卧室侧剖面整句一个镜头，止在第 13 句前导音（分屏从那一帧起） */
export const mainCutSentences12 = arrangeSegs(
  {
    name: '正片第12句',
    duration: originalDurSec,
    segments: [
      {
        key: '2-空床',
        start: { 句: 12, points: '起' },
        end: { 句: 13, points: '前导' },
        basis: '起：第 12 句首字（38.43）；止：第 13 句前导音（41.58），分屏那一路从这一帧起，第 12 句末镜头往右横移出屋、接进分屏',
      },
    ],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutSentences12);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
