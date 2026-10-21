// 7-1-7 骏马：本段机位和变速。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts），本段第 0 帧接 7-1-6 末帧的下一帧。
// 戏：监守者从 C1 扑向落在 C2 的刘心忠、挥臂扑空，刘心忠闪避 10 米、半空里甩出护盾；它压到盾前一拍接一拍地拍（冷却一好就拍，第三拍拍碎），
//   刘心忠趁这工夫召出幽灵马、翻身上马；黄叛在高台上接着开鼓风机射风矢，第一支和第二拍同一刻钉上它、第二支在第三拍之前（伤害见 ../7-1/戏/伤害.ts）；
//   碎的那一下马一跃跳上北墙头（6 格高，原版跳不上，默认一跃而上）；它照样追到墙脚下，收在马落上墙头（末帧 = 衔接.七三首，第 3 场接着追）。
// 演法（用户 10-17 嫌僵、10-18 嫌像回合制）：每个镜头里攻守两边同时在动，打中护盾定 1 帧，不慢放（用户 10-18「我没有要求就别放慢」）。
// - 扑空：监守者扑来的路南边低处，它从画面右边冲进来、爪子扫过刘心忠刚离开的地方，镜头跟着他往西甩，他半空里甩出护盾；
// - 刘心忠身后越肩往东：落地召马，监守者在盾前拍第一下；护盾南边低处：第二拍和黄叛第一箭同一刻，马在刘心忠身边冒出来；
// - 第三拍拍碎：监守者身后越肩，刘心忠上马，第二箭钉上，碎的那一下马正好起跳；马一跃上墙：墙头落点旁边往下看，它追到墙脚。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import { lerpV, ss } from '../../../../world/地点/古城4x/7-1/戏/公用.ts';
import * as play from '../../../../world/地点/古城4x/7-1/戏.ts';
import * as timeline from '../../../../world/地点/古城4x/7-1/时间线.ts';
import { 建变速 } from '../../../../world/地点/古城4x/7-1/变速.ts';
import { 建机位, type 变速镜 } from '../../../../world/地点/古城4x/7-1/变速段.tsx';
export const 号 = '7-1-7' as const;
export const FPS = timeline.FPS;

const startT = timeline.segmentStartT(号);
const endT = timeline.segmentEndT(号);
const swingT = timeline.lungeSwingT;
const shieldHits = play.shieldSwingTs.map((s) => s + 0.1 + 0.002); // 打中护盾（../7-1/声音.tsx 的 force_impact）
export const 变速 = 建变速(
  startT,
  endT,
  [[startT, 1]],
  shieldHits,
);
export const END = 变速.总帧数;
export const t于 = 变速.剧情时间;

const horsePos = (t: number): V3 => play.horseState(t)?.p ?? play.liuXinzhongPos(t);
const steady = (t0: number, t1: number, p0: V3, p1: V3, tgt: V3, lens: number) => (t: number) => ({ pos: lerpV(p0, p1, ss((t - t0) / (t1 - t0))), tgt, lens });
const cuts = [startT, timeline.shieldT + 0.08, shieldHits[0] + 0.6, timeline.mountT - 0.03, shieldHits[2] + 0.32];
const shots: 变速镜[] = [
  // 扑空：监守者扑来的路南边 5 米低处（两人中间那一片地面高低不平，放不下机位），先瞄它要扫的地方，扫空以后看点跟着刘心忠往西甩，他半空里甩出护盾就切
  //   （再往后他落向护盾点，被中央台北半的墙挡住）
  {
    起: cuts[0],
    cam: (t) => {
      const follow = ss((t - (swingT + 0.15)) / 0.45);
      const liu = play.liuXinzhongPos(t);
      return { pos: [-150.5, 15.0, 1.5], tgt: lerpV([-154.6, 19.5, 0.9], [liu[0], liu[1], liu[2] + 1.0], follow), lens: 16 };
    },
  },
  // 刘心忠身后越肩往东：他从半空落下、召马，监守者在盾前拍第一下
  { 起: cuts[1], cam: steady(cuts[1], cuts[2], [-168.2, 18.3, 1.0], [-167.6, 18.4, 0.9], [-158.5, 19.8, 1.4], 16) },
  // 护盾南边低处：第二拍，黄叛第一箭同一刻钉上；马在刘心忠身边冒出来
  { 起: cuts[2], cam: steady(cuts[2], cuts[3], [-161.0, 15.7, 0.6], [-161.3, 16.0, 0.6], [-162.4, 19.6, 1.1], 14) },
  // 监守者身后越肩：刘心忠上马，第二箭钉上，第三拍拍碎，马同一刻起跳
  { 起: cuts[3], cam: steady(cuts[3], cuts[4], [-158.6, 21.7, 2.4], [-159.0, 21.6, 2.3], [-164.6, 20.4, 0.9], 15) },
  // 北墙头、落点西边 4 米往下看：马从墙脚朝镜头一跃上来
  {
    起: cuts[4],
    cam: (t) => {
      const h = horsePos(t);
      return { pos: [-169.0, 28.3, 7.1], tgt: [h[0], h[1], h[2] + 1.0], lens: 14 };
    },
  },
];
export const camera = 建机位(变速, shots);
export const 镜号 = (frame: number) => cuts.filter((c) => t于(frame) >= c).length - 1;
