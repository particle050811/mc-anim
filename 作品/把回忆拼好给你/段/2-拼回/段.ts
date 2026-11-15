// 正片片尾（54.65 咔哒到原声放完）：闪白里从「选择世界」界面「新的世界」那一格图标跟前往外拉（开头钻进图标倒着走），新合照的碎片跟着吸进图标框，
// 换掉那张褪色的旧图标；55.50「啪」地回色，构图回到第 0 镜。不署名（用户 10-24「片尾署名删掉」）。最后一帧和第 0 镜第一帧同构图，能接回开头循环。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片片尾.ts';
import { originalGain } from '../../场/2-选择世界/参数.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { groupPhotoClickSound } from '../../场/2-隐世之境/合照声音.ts';

const clock = segClock('2-拼回');
/** 15 尾 54.65 的快门声：主音前那一小截（文件开头 起音秒，约 0.13 秒）在上一段 2-合照 段尾，主音起（段头）和后半的卷片声在这里放完 */
const clickTail = clipToSegment(clock.sceneWindow, groupPhotoClickSound);
if (!clickTail) throw new Error('15 尾的咔哒没有拖进 2-拼回 的窗口');

export default defineSeg({
  场: '2-选择世界',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  // 原声放到最后一个整帧（原版音频 56.0 秒时已淡到 −40 dB），段在一串歌的末尾，不另淡出
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: originalGain }, clickTail],
});
