// 7-1-4 逃：本段机位。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts），本段第 0 帧接 7-1-3 末帧的下一帧。
// 戏：监守者扑到丘脚，刘心忠正好蹬地一跳 25 米上东墙脊（7 格高，监守者够不着），它脚下不停接着往东追。
// 一个镜头：监守者来路上贴地，看点在它和丘顶上的刘心忠之间，扑上去和蹬地跳走在同一个画面里（跟在它身后，它在丘脚转身时机位会钻进土丘）。
import * as play from '../../地点/古城4x/7-1/戏.ts';
import * as timeline from '../../地点/古城4x/7-1/时间线.ts';
import { camPoses, type ShotCam } from '../../地点/古城4x/7-1/机位.ts';
import type { V3 } from '@engine/model/parts.tsx';
export const 号 = '7-1-4' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(号);
export const t于 = (f: number) => timeline.tAt(号, f);
const wardenAndLiu = (frame: number): V3 => {
  const t = t于(frame);
  const liu = play.liuXinzhongPos(t);
  const chest = play.wardenChest(t);
  return [liu[0] * 0.55 + chest[0] * 0.45, liu[1] * 0.55 + chest[1] * 0.45, (liu[2] + 1.0) * 0.55 + chest[2] * 0.45];
};
const shots: ShotCam[] = [{ start: 0, pos: [[0, [-143.5, 14.5, 1.0]], [END - 1, [-143.3, 14.3, 1.0]]], tgt: wardenAndLiu, lens: [[0, 20], [END - 1, 21]] }];
export const { 镜号, camera } = camPoses(shots);
