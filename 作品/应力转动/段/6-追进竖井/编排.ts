// 6-3-10 追进竖井：戏、时刻、机位都在 6-3-8/编排.ts 那条共用时间线上，这里只把这一段的具名常量取出来（段内帧）。
// 原来的铁链计划（定计、铁链、恼鬼）用户 10-12 删了，这一段只剩坑口：两人和一群卫兵跑到坑口，卫兵围住停下，只有两人跳进竖井
import { cues, segmentFrames, segmentTable, cutFrameOf, FPS } from '../../地点/边城/6-3-8/编排.ts';

export const frameCount = segmentFrames('6-3-10');
const toSegFrame = (s: number) => cutFrameOf(Math.round(s * FPS))! - segmentTable['6-3-10'].起;
export const liuEntersFrame = toSegFrame(cues.刘入井);
export const huangEntersFrame = toSegFrame(cues.黄入井);
