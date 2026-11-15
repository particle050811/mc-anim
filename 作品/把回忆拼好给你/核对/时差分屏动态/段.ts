// 时差分屏动态核对：第 13 句分屏整句按歌放一遍（带原声），看风吹日历越吹越快、樱花树一棵棵冒出来、她换姿势的节奏。核对-时差分屏 只出静帧，看不出动。
// 帧数、原声入点从 分镜 推（窗口.ts），不写帧号；原声增益同验证片（场/1-隐世之境一楼/参数.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { originalGain } from '../../场/1-隐世之境一楼/参数.ts';
import { frameWindow } from './窗口.ts';

export default defineSeg({
  场: '核对',
  秒: frameWindow.帧数 / fps,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  声音: [{ 秒: 0, 长秒: frameWindow.帧数 / fps, 入点秒: frameWindow.起帧 / fps, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: originalGain }],
});
