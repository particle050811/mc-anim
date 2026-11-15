// 2-教堂 的场时间线：本场的事件（秒，或接在别的事件后面），本场各段按 [起事件, 止事件) 取窗口（engine/段/窗口段.ts）。纯模块。
// 镜头结构照分镜第 9 节「跳一遍」：一进来就是中殿里跳一遍、收住停 2 秒。外立面全景用户 11-11 说「意义不明 去掉 直接跳」，删了。
import { defineSceneTimeline } from '@engine/段/窗口段.ts';
import { onePassSec } from '../../角色/动作/忘情牛肉面时长.ts';

export default defineSceneTimeline({
  场: '2-教堂',
  事件: {
    开始: { 在: { 秒: 0 }, 依据: '第 6 幕开头：切进中殿' },
    danceStart: { 在: { after: '开始', addSec: 0 }, 依据: '一进来就起跳（用户 11-11「直接跳」）' },
    danceDone: { 在: { after: 'danceStart', addSec: onePassSec }, 依据: '忘情牛肉面一遍（角色/动作/忘情牛肉面.ts 的 一遍秒）' },
    结束: { 在: { after: 'danceDone', addSec: 2 }, 依据: '分镜 6-03 收在最后站姿上停 2 秒' },
  },
});
