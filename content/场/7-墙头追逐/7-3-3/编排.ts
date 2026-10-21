// 7-3-3 音波：本段机位和变速。戏全在 ../7-3/戏.ts（见 ../7-3/时间线.ts），从 7-3-2 硬切过来，收在马落到墙外大道冲起来，硬切 7-4-1。
// 音波慢放特写（用户 10-19 定：保留音波慢放特写）：变速照原来那一镜，音爆放出前慢到 1/4、打中定住 1 帧，放出后 0.25 秒回到原速。
//   镜 1 墙外北边、比塔顶低一点侧着看（音爆那条线横在画里，烟团在画右边、不挡它）：塔顶马上的人、沿墙头冲过来的它一个画面，第三炮炸在它身上，它冲出烟团、到塔脚刹住，
//     杖一推出护盾，它放出音爆、穿过护盾打中他，黄叛的风矢同一刻钉在它身上；三个伤害数字都在这一镜里弹出来再切。整镜慢慢推近。
//   镜 2 塔顶东南、顺着击退的方向（音爆线在马后面）：马被冲得横滑到镜头跟前，他稳住、拨马朝东北一跃。
//   镜 3 墙外大道南沿、落点西南（切在跃到半空）：马落到大道，从镜头跟前往东冲走，切。
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { addOffset } from '../../../../world/地点/古城4x/7-1/机位.ts';
import { lerpV, ss } from '../../../../world/地点/古城4x/7-1/戏/公用.ts';
import { 建变速 } from '../../../../world/地点/古城4x/7-1/变速.ts';
import { 建机位 } from '../../../../world/地点/古城4x/7-1/变速段.tsx';
import * as play from '../../../../world/地点/古城4x/7-3/戏.ts';
import * as timeline from '../../../../world/地点/古城4x/7-3/时间线.ts';
import { G4 } from '../../../../world/地点/古城4x.tsx';
export const 号 = '7-3-3' as const;
export const FPS = timeline.FPS;

const startT = timeline.segmentStartT(号);
const endT = timeline.segmentEndT(号);
const fireT = timeline.sonicBoomFireT;
// 定在放出后 0.02 秒：音波粒子（第 34 刻一次撒满整条线）已经出来
const stopT = fireT + 0.02;
export const 变速 = 建变速(
  startT,
  endT,
  [
    [startT, 1],
    [fireT - 0.06, 1],
    [fireT - 0.01, 1 / 4, true],
    [stopT, 1 / 4],
    [fireT + 0.08, 1 / 4],
    [fireT + 0.25, 1, true],
  ],
  [stopT],
);
export const END = 变速.总帧数;
export const T于 = 变速.剧情时间;

const cuts = [startT, timeline.hitT + 0.3, timeline.leap3T + 0.45]; // 箭的暴击数字、他头上的数字在同框镜头里弹出来再切
const horseAtFire = play.horseState(fireT).p;
const horseChest = (t: number) => addOffset(play.horseState(t).p, [0, 0, 2.2]);
// 镜 1：塔脚下的它紧贴塔的西墙，马背后（东南）看过去被塔身挡住，只有从北边看得见；从上往下看人和它离得太开、它又小，所以放低。
// 镜头朝着「看他眼睛」和「看它胸口」两个方向的角平分线，它冲过来时跟着转，人和它始终一左一右在画里
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
const between = (from: V3, a: V3, b: V3, w: number): V3 => {
  const da = unit([a[0] - from[0], a[1] - from[1], a[2] - from[2]]);
  const db = unit([b[0] - from[0], b[1] - from[1], b[2] - from[2]]);
  return addOffset(from, lerpV(da, db, w));
};
const shot1Pos = (t: number) => lerpV(addOffset(horseAtFire, [-2.6, 14.0, -1.2]), addOffset(horseAtFire, [-2.6, 12.6, -1.5]), ss((t - cuts[0]) / (cuts[1] - cuts[0])));
const shots: { 起: number; cam: (t: number) => Cam }[] = [
  {
    起: cuts[0],
    cam: (t) => ({ pos: shot1Pos(t), tgt: between(shot1Pos(t), play.liuEye(t), play.wardenChest(t), 0.5), lens: 17 }),
  },
  {
    起: cuts[1],
    cam: (t) => ({ pos: addOffset(timeline.slideEnd, [timeline.knockDir[0] * 5, timeline.knockDir[1] * 5 - 4, 2.4]), tgt: horseChest(t), lens: 16 }),
  },
  {
    起: cuts[2],
    cam: (t) => ({ pos: G4(-816.5, -48.5, 202.5) as V3, tgt: horseChest(t), lens: 16 }),
  },
];
export const camera = 建机位(变速, shots);
