// 7-1-3 秒杀：本段机位和变速。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts），本段第 0 帧接 7-1-2 末帧的下一帧。
// 戏：五只恼鬼四面俯冲，监守者每 0.9 秒（攻击冷却）拍飞一只、边拍边追着黄叛的落地声走；黄叛趁它拍恼鬼跳去南台顶、半空里再射一支火把；最后刘心忠「一百级的恼鬼……」，监守者掉头扑他。
// 演法（用户 10-17 嫌缠斗僵、10-18 嫌像回合制）：一拍一个镜头，切在拍之前 0.45 秒；每个镜头里攻守两边同时在动——
//   拍 1 监守者脚下仰拍，恼鬼从黄台上黄叛那边俯冲下来；拍 2 黄叛东边，他蹲下蹬地跳走的同时监守者在下面拍；拍 3 监守者北边，它在近处拍、半空的黄叛在远处回身放箭；
//   拍 4 监守者东北贴地，它边走边拍，南台顶上的黄叛在后面放箭；拍 5 刘心忠身后，最后一只在远处被拍飞；收在刘心忠侧面，他喊、监守者朝他扑过来。
// 打中定住 1 帧（用户 10-18「一帧差不多了吧」），不慢放（用户 10-18「我没有要求就别放慢」）。
import type { V3 } from '@engine/model/parts.tsx';
import type { Cam } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { lerpV, ss } from '../../地点/古城4x/7-1/戏/公用.ts';
import * as play from '../../地点/古城4x/7-1/戏.ts';
import * as timeline from '../../地点/古城4x/7-1/时间线.ts';
import { 建变速 } from '../../地点/古城4x/7-1/变速.ts';
import { 建机位, type 变速镜 } from '../../地点/古城4x/7-1/变速段.tsx';
export const 号 = '7-1-3' as const;
export const FPS = timeline.FPS;

const [s1, s2, s3, s4, s5] = play.swingTs; // 攻击动画起点；打中在 +0.1（../7-1/声音.tsx 的 attack_impact、恼鬼同一刻死）
const hitT = (s: number) => s + 0.1 + 0.002;
const startT = timeline.segmentStartT(号);
const endT = timeline.segmentEndT(号);
play.checkVexSwings();
export const 变速 = 建变速(
  startT,
  endT,
  [[startT, 1]],
  [s1, s2, s3, s4, s5].map(hitT),
);
export const END = 变速.总帧数;
export const t于 = 变速.剧情时间;

const head = (p: V3, h: number): V3 => [p[0], p[1], p[2] + h];
// 机位在 t0～t1 之间从 p0 慢慢挪到 p1；看点是几个主体按权重的中点（主体随场时刻动）
const drift = (t0: number, t1: number, p0: V3, p1: V3, look: (t: number) => V3, lens: number) => (t: number): Cam => ({ pos: lerpV(p0, p1, ss((t - t0) / (t1 - t0))), tgt: look(t), lens });
const between = (a: (t: number) => V3, b: (t: number) => V3, k: number) => (t: number) => lerpV(a(t), b(t), k);
const huangHead = (t: number) => head(play.huangPanPos(t), 1.4);
const liuHead = (t: number) => head(play.liuXinzhongPos(t), 1.5);
const wardenChest = (t: number) => play.wardenChest(t);
// 拍哪一下的接触点（恼鬼被拍中那一刻的位置）
const contactOf = (s: number): V3 => {
  const i = play.vexDeathTs.findIndex((d) => Math.abs(d - (s + 0.1)) < 1e-6);
  return play.vexState(i, s + 0.1).p;
};
const fixed = (p: V3) => () => p;
const cuts = [startT, s2 - 0.45, s3 - 0.45, s4 - 0.45, s5 - 0.45, timeline.impossibleT - 0.05];
const shots: 变速镜[] = [
  // 拍 1：监守者东北脚下仰拍，恼鬼从黄台那边俯冲下来，黄叛在台上拉弓
  { 起: cuts[0], cam: drift(cuts[0], cuts[1], [-146.2, 23.6, 0.4], [-146.6, 23.2, 0.4], between(fixed(contactOf(s1)), huangHead, 0.4), 16) },
  // 拍 2：监守者东北半高处，下面它拍从北边冲来的那只，上面黄台上的黄叛蹲下蹬地往南跳走（机位再往南，接触点会被黄台北沿挡住）
  { 起: cuts[1], cam: drift(cuts[1], cuts[2], [-144.5, 22.5, 4.5], [-144.8, 22.2, 4.4], between(fixed(contactOf(s2)), huangHead, 0.42), 16) },
  // 拍 3：监守者北边半高处往南仰看，近处它拍从西边冲来的那只，远处半空的黄叛在最高点回身朝这边放火把箭（南边、东边机位都被黄台、南台挡住）
  { 起: cuts[2], cam: drift(cuts[2], cuts[3], [-149.0, 29.0, 4.0], [-149.3, 28.7, 4.1], between(wardenChest, huangHead, 0.3), 15) },
  // 拍 4：监守者东北贴地，它边往东南走边拍，南台顶上的黄叛在后面放箭
  { 起: cuts[3], cam: drift(cuts[3], cuts[4], [-143.0, 22.6, 0.8], [-142.8, 22.4, 0.8], between(fixed(contactOf(s4)), huangHead, 0.3), 16) },
  // 拍 5：刘心忠身后越肩，最后一只在远处被拍飞
  { 起: cuts[4], cam: drift(cuts[4], cuts[5], [-133.4, -2.2, 8.3], [-133.6, -2.0, 8.2], between(liuHead, fixed(contactOf(s5)), 0.75), 28) },
  // 刘心忠侧面：「一百级的恼鬼……」，监守者掉头朝他扑过来，南台顶上黄叛伸手
  { 起: cuts[5], cam: drift(cuts[5], endT, [-129.4, 4.2, 7.7], [-129.8, 4.0, 7.6], between(liuHead, wardenChest, 0.45), 20) },
];
export const camera = 建机位(变速, shots);
export const 镜号 = (frame: number) => cuts.filter((c) => t于(frame) >= c).length - 1;
