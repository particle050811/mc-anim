// 2-教堂 的场时间线：本场的事件（秒，或接在别的事件后面），本场各段按 [起事件, 止事件) 取窗口（engine/段/窗口段.ts）。纯模块。
import { defineSceneTimeline } from '@engine/段/窗口段.ts';
import { danceEndSec } from '../../角色/动作/忘情牛肉面时长.ts';

export default defineSceneTimeline({
  scene: '2-教堂',
  events: {
    开始: { 在: { sec: 0 }, basis: '第 6 幕开头：切进中殿' },
    danceStart: { 在: { after: '开始', addSec: 0 }, basis: '一进来就起跳（用户 11-11「直接跳」）' },
    结束: { 在: { after: 'danceStart', addSec: danceEndSec }, basis: '照 BV1UFH76QETS 最左舞者跳一遍，原片第 423 帧结束即切，不接续编' },
  },
});
