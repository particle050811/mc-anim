// 正片开场（第 0 镜前奏、第 1 句；段 2-选择世界、2-初入）的事件和段窗口。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';

export const eventDefs = {
  // 第 0 镜（前奏）、第 1 句（开场与片尾这一路）：1.81 = 第 4 拍
  开场光标入: { 在: { beat: 1 }, 依据: '第 0 镜：鼠标从右下滑进来（演绎，Agent 暂定：第一帧没有光标，和片尾同构图、能循环）' },
  开场光标到: { 在: { beat: 3 }, 依据: '第 0 镜：光标擦过「新的世界」那一项停到图标上，图标蒙灰、出播放箭头（原版指着那一项的样子；演绎，Agent 暂定）' },
  开场鼓点: { 在: { beat: 4 }, 依据: '三稿第 0 镜 1.81：鼓点一进，点下「新的世界」的图标（原版点图标直接进世界），镜头钻进图标' },
  第1句加入游戏: { 在: { beat: 5 }, 依据: '三稿第 1 句：钻进图标落到新世界，聊天栏一行黄字「Steve加入了游戏」（落在钻完后的第一拍，Agent 暂定）' },
  第1句起步: { 在: { beat: 7 }, 依据: '第 1 句：你朝樱花林那边走几步（唱到「渺小」时已经在走），镜头跟着往前、往下落（演绎，Agent 暂定）' },
  第1句剖开: { 在: { beat: 10 }, 依据: '第 1 句尾：镜头落到地面高度、你停下，白天里你脚下往前的地一排排撤掉，露出地面剖面，第 2 句在剖面里一镜拍完（演绎，Agent 暂定）' },
  第1句推完: {
    在: { 句: 2, 点: '起' },
    依据: '第 1 句的推镜推到头：第 2 句首字 4.95 接 2-第一晚，一镜不切（同一个机位）；天从这一帧起边挖边黑，填土那一拍黑透（核查 10-24：原来入夜挤在第 1 句最后一秒，和落镜、撤排、换歌词叠在一起）',
  },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片开头：第 0 镜（前奏，原版「选择世界」界面）和第 1 句（新世界）。2-初入 从钻进图标那一刻接着 2-选择世界，一镜不切 */
export const mainCutOpeningScene = arrangeSegs(
  {
    名: '正片开场',
    时长: originalDurSec,
    segments: [
      { 键: '2-选择世界', 起: { 秒: 0 }, 止: { beat: 4 }, 依据: '三稿第 0 镜 0–1.81：前奏，高考后你打开一年没进的那个世界（用户 10-24 改成原版「选择世界」界面）；止：1.81 鼓点（第 4 拍），镜头开始钻进图标' },
      {
        键: '2-初入',
        止: { 句: 2, 点: '起' },
        依据: '三稿第 1 句 1.54–4.65（画面从 1.81 起）：钻进图标落到新世界、走几步、剖开地面；止：第 2 句首字 4.95，2-第一晚 接着同一个镜头（主会话分的窗口 [1.81, 第 2 句起)）',
      },
    ],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutOpeningScene);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
