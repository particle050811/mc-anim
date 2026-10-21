// 7-1-5 风矢：本段机位和变速。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts），本段第 0 帧接 7-1-4 末帧的下一帧。
// 戏：监守者已经堵在东墙脚、仰头够不着墙脊上的刘心忠；黄叛「怪物受死！」拉满弓跳回黄叛高台，最高点松手，风矢钉进监守者后背（命中声在前，0.3 秒后才传来弓弦声）；
//   它一红、不倒，刘心忠就在这时从墙脊回身一蹬，朝它头顶扑回来。
// 镜 1 南台顶上黄叛身后越肩往东：他喊、蹬地拉弓，远处墙脚是监守者、墙脊上是刘心忠；
//   镜 2 土丘顶上往东北（监守者后背斜对着）：风矢钉上（定 1 帧），墙脊上刘心忠蹬地扑回来、从它头顶上越过去，
//   离得近框不进两人，所以站远到丘顶。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { lerpV, ss } from '../../../../world/地点/古城4x/7-1/戏/公用.ts';
import * as play from '../../../../world/地点/古城4x/7-1/戏.ts';
import * as timeline from '../../../../world/地点/古城4x/7-1/时间线.ts';
import { 建变速 } from '../../../../world/地点/古城4x/7-1/变速.ts';
import { 建机位, type 变速镜 } from '../../../../world/地点/古城4x/7-1/变速段.tsx';
export const 号 = '7-1-5' as const;
export const FPS = timeline.FPS;
const startT = timeline.segmentStartT(号);
const endT = timeline.segmentEndT(号);
const hitT = play.windArrowShot.中;
export const 变速 = 建变速(startT, endT, [[startT, 1]], [hitT]);
export const END = 变速.总帧数;
export const t于 = 变速.剧情时间;
export const 镜1止t = play.windArrowReleaseT;
// 丘顶（脚底 y −44）东北沿、眼高：监守者在东北 18 格，刘心忠扑到最高时仰角 +19°
const shot2Pos = G4(-855, -42.4, 236.5);
const huangHead = (t: number): V3 => {
  const p = play.huangPanPos(t);
  return [p[0], p[1], p[2] + 1.4];
};
const liuHead = (t: number): V3 => {
  const p = play.liuXinzhongPos(t);
  return [p[0], p[1], p[2] + 1.3];
};
// 镜 1 机位在南台顶（台面脚底 y −38）黄叛西边 4 格、高 3：再低，台东沿的台阶挡住墙脚的监守者（工具/机位核对/核对.py）
const shot1From = G4(-875.5, -35.0, 233.6);
const shot1To = G4(-875.3, -35.0, 233.8);
const shots: 变速镜[] = [
  { 起: startT, cam: (t): Cam => ({ pos: lerpV(shot1From, shot1To, ss((t - startT) / (镜1止t - startT))), tgt: lerpV(huangHead(t), play.wardenChest(t), 0.5), lens: 22 }) },
  { 起: 镜1止t, cam: (t): Cam => ({ pos: shot2Pos, tgt: lerpV(play.wardenChest(t), liuHead(t), 0.5), lens: 16 }) },
];
export const camera = 建机位(变速, shots);
export const 镜号 = (frame: number) => (t于(frame) >= 镜1止t ? 1 : 0);
