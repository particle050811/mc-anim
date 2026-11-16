// 验证片（章 1，段 1-一如既往，第 13–15 句）的事件和段窗口。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';

export const eventDefs = {
  line13VocalIn: { 在: { 句: 13, points: '开口' }, basis: '歌词换第 13 句「我们的爱总有时差」，从前导音起淡入' },
  firstBlink: { 在: { sec: 42.0 }, basis: '第 13 句头两个字之间，不卡拍（演绎，暂定）' },
  rightClick: { 在: { after: 'tame', addSec: -1 / 20 }, basis: '右键递蛋糕、挥手比驯服早 1 刻起，驯服的反馈落在下拍上（暂定）' },
  tame: { 在: { measure: 25 }, basis: '第 25 小节下拍（乐句下拍）：头顶冒爱心、聊天栏弹出两行、蛋糕被吃掉，她抬头看你' },
  lookUpDone: { 在: { after: 'tame', addSec: 0.5 }, basis: '驯服起抬头看你的脸，半秒到位（暂定）' },
  line14VocalIn: { 在: { 句: 14, points: '开口' }, basis: '歌词换第 14 句「也为你骗自己放下」，从前导音起淡入' },
  gazeAway: { 在: { 句: 14, points: '起' }, basis: '第 14 句首字主音：视线轻轻别开（演绎，暂定）' },
  gazeAwayDone: { 在: { measure: 27 }, basis: '第 27 小节下拍（乐句下拍）' },
  secondBlink: { 在: { measure: 28 }, basis: '第 28 小节下拍（断拍回落）' },
  line15VocalIn: { 在: { 句: 15, points: '开口' }, basis: '歌词换第 15 句「爱炙热的你却忘了爱自己」，没有前导音，从句首起淡入' },
  gazeBack: { 在: { 句: 15, points: '起' }, basis: '第 15 句起：转回来看你（演绎，暂定）' },
  gazeBackDone: { 在: { beat: 115 }, basis: '第 115 拍' },
  chatFadeOut: { 在: { after: 'tame', addSec: 180 / 20 }, basis: '原版聊天满亮 180 刻，之后按 ((1 − 刻/200)·10)² 淡掉' },
  chatGone: { 在: { after: 'tame', addSec: 200 / 20 }, basis: '原版聊天第 200 刻消失' },
  smilePushIn: { 在: { measure: 31 }, basis: '第 31 小节下拍（乐句下拍，长音约 52.95 起）：换成微笑，镜头开始推向她的脸' },
  thirdBlink: { 在: { after: 'smilePushIn', addSec: 0.7 }, basis: '微笑以后眨一次（演绎，暂定）' },
  clickFreeze: { 在: { measure: 32 }, basis: '第 32 小节下拍（断拍回落，片内最后一个强拍）：咔哒、闪白、定格，歌词淡出' },
  vocalEnd: { 在: { 句: 15, points: '止' }, basis: '第 15 句人声落下，只剩回声' },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 验证片：一段，第 13–15 句 */
export const validationCut = arrangeSegs({
  name: '验证片',
  duration: originalDurSec,
  segments: [
    {
      key: '1-一如既往',
      start: { sec: 41.417 },
      end: '放完',
      basis: '起：第 12 句止（41.36）和第 13 句前导音（41.58）之间的换气，伴奏不停，原声开头淡入；止：原声放完（56.0 时已淡到 −40 dB）',
    },
  ],
}, eventTable);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(validationCut);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
export type EventName = keyof typeof eventDefs;
