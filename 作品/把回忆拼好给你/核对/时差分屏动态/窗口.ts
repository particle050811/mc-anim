// 时差分屏动态核对放的那一截歌（纯数据，段.ts 也读）：第 13 句分屏整句，从前导音 41.58（分屏起）到句止 44.97，歌曲帧 [起帧, 止帧)。
import { toSongFrame, lineAt } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第13至14句.ts';

const startFrame = mainCutEvents.splitScreenStart.帧;
const endFrame = toSongFrame(lineAt(13).止);

export const frameWindow = { 起帧: startFrame, 止帧: endFrame, 帧数: endFrame - startFrame } as const;
