// 6-4-8 钻出：全部时间轴和机位，纯函数，输入帧号 f（0 起，24 帧/秒）。地理见 ../古城4x布局.ts。
// 戏：接 6-4-7 的第四次尖啸。场子东半边，二人往西走（`handoffs.六四八首`：1.6 米/秒，第 18 帧停到 `liuXinzhongSpot` / `huangPanSpot`），刘心忠在前，黄叛在他左后方（南边）；尖啸体 (−869, −51, 218) 头上的声波环还在往上飘。
//   刘心忠前面 7 格的幽匿块地面冒起碎屑，监守者照原版钻出动画爬出来：手先撑出地面、触角、头、肩，撑着地面停一下，再整个爬出来、站直。
//   钻出提速（用户 10-12：「要以迅雷不及掩耳之势爬出来，让对面没反应过来」）：原版钻出动画 6.68 秒整段按同一个倍数快放到 1.75 秒（先后、停顿比例照原版）。
//   二人（用户 10-18 嫌「完全站着看着监守者出来 一点反应都没有」）：手撑出地面 0.2 秒后一激灵，一蹲往后急退、岔开拉开距离，空中就把家伙举起来，
//   落地黄叛搭箭拉满瞄着它、刘心忠右脚一踏举杖戒备，监守者刚站直就听见这一踏、触角一抖、头转向刘心忠；二人交换一个眼神。见下面「二人」和 二人.ts。声音见 声音.tsx。
// 依据：
//   - 钻出动画（`WardenAnimation.EMERGE`）、钻出时脚下每刻 30 个方块碎屑、心跳每 2 秒一次：见 模型/角色/监守者.tsx。碎屑只在动画前 4.5 秒撒，快放后只撒 1.18 秒，
//     每刻 15 个（照搬 30 个会糊满画面），单个粒子的大小、寿命、下落不改（物理不跟着快放）。
//   - 落点：尖啸体召唤监守者时落在周围水平 ±5 格、上下 ±6 格内的实心地面上（`SpawnUtil.trySpawnMob(…, 20, 5, 6, ON_TOP_OF_COLLIDER)`）；这里在第四次尖啸体西边 4.5 格（布局文件 `wardenEmerge`），正挡在二人往西走的路上。
//   - 尖啸声波环：一次 10 个、每 5 刻一个，持续 3.75 秒（模型/特效/尖啸声波.tsx）；本段开头是第四次尖啸后约 1 秒。
//   - 监守者钻出期间不听振动（`Warden$VibrationUser.canReceiveVibration` 要 !isDiggingOrEmerging），二人急退落地它听不到；站直后才收到刘心忠那一踏，触角抖、发亮一下（实体事件 61），之后 40 刻不再听。
// 机位：一个连续镜头。二人身后（正东）离地 9 格的高机位（低了会被碎石和刘心忠挡住），越过头顶看刘心忠前方的地面；监守者往上爬时镜头往前推、往上仰，二人急退时镜头跟着往后退、往下压，最后二人一左一右在前景下方，监守者在画面中上站直，背后是北墙和中央台。
import { type Key, sample, sampleV, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { WARDEN } from '@库/生物/监守者.tsx';
import { walkPose } from '../../../角色/追兵.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { bowTextureFor } from '@库/物品/弓.tsx';
import type { Cam } from '../6-4-1/古城画面.tsx';
import { FPS, blockCenter, nearYaw, yawTo } from '../6-4-1/古城戏.ts';
import { G4 } from '../../古城4x.tsx';
import { allWool, liuXinzhongSpot, shrieks, wardenEmerge, handoffs, huangPanSpot, woolBlockAt, woolOrder, eliteLeap, leapFeetAt, type 跳 } from '../布局.ts';
import { bump, crouchBy, elevationTo, glanceAt, hopAir, hopTo, huangAimPose, landingCushion, lerp, liuGuardPose, pulse, rampIn, ss, startle, stepLeg, yawToWarden } from './二人.ts';

export { FPS };
export const EMERGE0 = 12; // 第 12 帧开始钻出（开头半秒地面先静着，声波环还在飘）
// 钻出用多少秒（画面时间）：原版 6.68 秒快放到 1.75 秒，见文件头
export const emergeDurationSec = 1.75;
export const emergeSpeedup = WARDEN.emergeSec / emergeDurationSec;
const TAIL = 20; // 站直以后再留 0.83 秒（触角一抖、头转向刘心忠、二人交换眼神）
export const END = EMERGE0 + Math.ceil(emergeDurationSec * FPS) + TAIL;
// 开始钻出以后过了几秒（画面时间、真实时间：人、碎屑、心跳都按它走）
export const emergeSec = (f: number) => (f - EMERGE0) / FPS;
// 钻出动画放到第几秒（动画时间，快放 钻出倍速）
export const emergeAnimSec = (f: number) => emergeSec(f) * emergeSpeedup;
// 碎屑撒多久（画面时间）：原版钻出动画前 4.5 秒在撒，跟着动画快放
export const crumbSec = WARDEN.emergeParticles.durationSec / emergeSpeedup;
// 游戏时间（秒，驱动待机晃动、斑纹、心跳）：末帧定在 11.1167 秒，6-4-9 接着这个时间走，它按心跳排的切点（心脏那一镜）跟着这个钟。
const lastFrameGameSec = 3.2 + 190 / FPS;
export const gameSecAt = (f: number) => lastFrameGameSec - (END - 1 - f) / FPS;

export const WARDEN_AT = wardenEmerge;
// 监守者面朝东（朝着二人）：实体正面朝 -Y，转 yaw 让正面对准二人中间
const PAIR_MID: V3 = [(liuXinzhongSpot[0] + huangPanSpot[0]) / 2, (liuXinzhongSpot[1] + huangPanSpot[1]) / 2, 0];
export const WARDEN_YAW = (Math.atan2(PAIR_MID[1] - WARDEN_AT[1], PAIR_MID[0] - WARDEN_AT[0]) * 180) / Math.PI + 90;

// 头转向某处（脚底）的 头偏（实体约定：正 = 往它自己的右手边转；夹 ±40°，同 7-1/戏/监守者.ts）
export const wardenHeadYawTo = (p: number[]) => -Math.max(-40, Math.min(40, nearYaw(0, yawTo(p[0] - WARDEN_AT[0], p[1] - WARDEN_AT[1]) - (WARDEN_YAW - 180))));
// 触角：站直后 0.1 秒（画面时间）收到刘心忠那一踏的振动（`liuPlantSec` 起飞，10 格 = 10 刻 = 0.5 秒），亮一下、0.5 秒暗下去；头跟着转向他（0.25 秒），低头盯着
export const tendrilSec = emergeDurationSec + 0.1;
export const warden = (frame: number) => {
  const t = emergeSec(frame);
  const animSec = emergeAnimSec(frame);
  const tendril = t > tendrilSec ? Math.max(0, 1 - (t - tendrilSec) / 0.5) : 0;
  const turn = ss(rampIn(t, tendrilSec + 0.05, tendrilSec + 0.3));
  // 钻出前：整个埋在地下（钻出动画第 0 秒的姿势）
  return {
    秒: gameSecAt(frame),
    钻出: animSec <= WARDEN.emergeSec ? Math.max(0, animSec) : undefined,
    触角: tendril,
    头偏: wardenHeadYawTo(liuPoseAt(frame).loc) * turn,
    headPitch: animSec > WARDEN.emergeSec ? 8 + 4 * turn : 0,
  };
};

// 地上的羊毛：李樱 6-4-1～6-4-5 一路垫的（羊毛名，给 古城4x画布 的 `羊毛`）；7-2-2至3 的 X 还没垫。F1 在钻出点西北 6 米
export const woolNames = woolOrder.slice(0, woolOrder.indexOf('V') + 1);
// 同一批羊毛的方块底面中心（场景坐标，给老的 羊毛们 blocks 用）
export const WOOL: V3[] = woolNames.map((n) => woolBlockAt(allWool[n]));
// 第四次尖啸体 (−869, −51, 218)：尖啸在本段开头前 1 秒
export const SHRIEKER: V3 = blockCenter(shrieks.第四次);
export const shriekSec = (f: number) => f / FPS + 1.0;

// ---------- 二人 ----------
// 往西走（`handoffs.六四八首`：1.6 米/秒，第 18 帧停到站位；f < 0 照同一速度往回推，6-4-7 末 0.4 秒淡进来用），地面一翻涌就低头看、转过去；
// 手撑出地面 0.2 秒后一激灵（黄叛先、刘心忠晚 0.06 秒），一蹲往后急退（强者的闪避小跳：离地 1.5 米、三四米远、0.6 秒，刘心忠退往东北、黄叛退往东南，岔开拉开），
// 空中就把家伙举起来：黄叛弓举到身前、落地搭箭拉满瞄着它，刘心忠落地右脚往前一踏、举杖戒备（这一踏的振动 0.5 秒后到，监守者刚站直就听见，触角一抖）；
// 站定后交换一个眼神（刘心忠扭头看黄叛、点一下头，黄叛飞快瞟他一眼又盯回去）。姿势零件见 二人.ts。
const handoff = handoffs.六四八首;
const FACE_W = yawTo(-1, 0);
const walkDist = (handoff.walkSpeed * handoff.停帧) / FPS; // 1.2
const hopApex = 1.5; // 强者跳的最低离地（古城4x布局/强者.ts 的 eliteLeap 最低 1.5）
const beats = {
  黄: { jolt: 0.84, crouch: 0.96, takeoff: 1.08, raise: [1.25, 1.7], draw: [1.95, 2.55] },
  刘: { jolt: 0.9, crouch: 1.02, takeoff: 1.14, guard: [1.14, 1.6], plant: [1.55, 1.85] },
  glanceLiu: [2.42, 2.82],
  nod: [2.64, 2.9],
  glanceHuang: [2.5, 2.72],
};
export const hops = {
  刘: eliteLeap(liuXinzhongSpot, hopTo.刘, hopApex, beats.刘.takeoff * FPS),
  黄: eliteLeap(huangPanSpot, hopTo.黄, hopApex, beats.黄.takeoff * FPS),
};
// 刘心忠右脚往前一踏落地那一刻（秒）：振动按 1 格/刻飞到监守者（`warden` 的触角就在这时亮）
export const liuPlantSec = beats.刘.plant[1];
const feetAt = (who: '刘' | '黄', frame: number): V3 => {
  const spot = who === '刘' ? liuXinzhongSpot : huangPanSpot;
  const hop = hops[who];
  if (frame < hop.f0) {
    const walked = walkDist * Math.min(1, frame / handoff.停帧);
    return [spot[0] + walkDist - walked, spot[1], spot[2]];
  }
  return leapFeetAt(hop, frame);
};
const walkAmp: Key[] = [[0, 1], [EMERGE0 + 6, 0], [END, 0]];
// 头看监守者：先低头看翻涌的地面，跟着它往上爬抬起头（看点从地面升到头的高度）
const lookWeight = (f: number) => ss(rampIn(emergeSec(f), 0.08, 0.45));
const lookPitchAt = (feet: number[], f: number) => elevationTo(feet, 2.6 * ss(rampIn(emergeSec(f), 0.1, 1.5))) * lookWeight(f);
const bodyYaw = (feet: number[], f: number) => lerp(FACE_W, nearYaw(FACE_W, yawToWarden(feet)), lookWeight(f));
// 站着的那些喘气、晃动在走路停下以后才加进来
const settle = (f: number) => ss(rampIn(f, handoff.停帧, handoff.停帧 + 8));
const airAndLand = (pose: FigurePose, s: number, b: { jolt: number; crouch: number; takeoff: number }, hop: 跳, rightTuck = 1) => {
  let p = startle(pose, bump(s, b.jolt, b.crouch + 0.02));
  p = crouchBy(p, ss(rampIn(s, b.crouch, b.takeoff)) * (s < b.takeoff ? 1 : 0));
  const landSec = hop.f1 / FPS;
  if (s >= b.takeoff && s < landSec) p = hopAir(p, (s - b.takeoff) / hop.T, rightTuck);
  return crouchBy(p, landingCushion(s - landSec));
};
export const liuPoseAt = (frame: number): FigurePose => {
  const s = frame / FPS;
  const b = beats.刘;
  const feet = feetAt('刘', frame);
  const yaw = bodyYaw(feet, frame);
  const g = ss(rampIn(s, b.guard[0], b.guard[1]));
  let pose = liuGuardPose(feet, yaw, s, g, lookPitchAt(feet, frame), settle(frame));
  const amp = sample(walkAmp, frame);
  if (amp > 0) {
    const walk = walkPose(feet, yaw, (walkDist * Math.min(1, frame / handoff.停帧)) * 4, amp, 0);
    pose = { ...pose, legR: walk.legR, legL: walk.legL, kneeR: walk.kneeR, kneeL: walk.kneeL, armR: walk.armR, armL: walk.armL };
  }
  pose = airAndLand(pose, s, b, hops.刘, -0.6);
  pose = stepLeg(pose, rampIn(s, b.plant[0], b.plant[1]), 'R', 0.6);
  pose = glanceAt(pose, feet, feetAt('黄', frame), pulse(s, beats.glanceLiu[0], beats.glanceLiu[1], 0.1, 0.14));
  pose.headPitch -= 9 * bump(s, beats.nod[0], beats.nod[1]);
  return pose;
};
export const huangPoseAt = (frame: number): FigurePose => {
  const s = frame / FPS;
  const b = beats.黄;
  const feet = feetAt('黄', frame);
  const yaw = bodyYaw(feet, frame);
  const r = ss(rampIn(s, b.raise[0], b.raise[1]));
  let pose = huangAimPose(feet, yaw, s, r, bowDrawAt(frame), lookPitchAt(feet, frame), settle(frame));
  const amp = sample(walkAmp, frame);
  if (amp > 0) {
    const walk = walkPose(feet, yaw, (walkDist * Math.min(1, frame / handoff.停帧)) * 4 + 1.3, amp, 0);
    pose = { ...pose, legR: walk.legR, legL: walk.legL, kneeR: walk.kneeR, kneeL: walk.kneeL, armR: walk.armR, armL: walk.armL };
  }
  pose = airAndLand(pose, s, b, hops.黄);
  return glanceAt(pose, feet, feetAt('刘', frame), pulse(s, beats.glanceHuang[0], beats.glanceHuang[1], 0.06, 0.08));
};
export const pursuers = (frame: number): { 刘: FigurePose; 黄: FigurePose } => ({ 刘: liuPoseAt(frame), 黄: huangPoseAt(frame) });
// 拉弓 0～1（落地以后搭箭拉满）；弓的贴图照原版三档
export function bowDrawAt(frame: number) {
  return ss(rampIn(frame / FPS, beats.黄.draw[0], beats.黄.draw[1]));
}
export const bowAt = (frame: number) => bowTextureFor(bowDrawAt(frame) > 0.05, bowDrawAt(frame));

// ---------- 机位 ----------
const wardenPos: V3 = WARDEN_AT;
// 钻出提速以后，镜头跟着它往上爬的那几个点按同一个倍数挪（钻出后第 20、30、120 帧 → 第 5、8、31 帧，钻出动画里是同一个时刻），6-4-9 首帧接本段末帧
const remapEmerge = (origFrame: number) => EMERGE0 + Math.round(origFrame / emergeSpeedup);
// 二人往后急退（第 27～42 帧）正冲着镜头来，镜头跟着往后退 4 格、往北 1.5 格，看点压到监守者身前偏南的地面（第 30～56 帧），三个人都留在画面里，监守者还是那么大（用户 10-18 要二人有反应）
const CAM_POS: VKey[] = [
  [0, G4(-847.0, -41.8, 223.8)],
  [remapEmerge(30), G4(-847.2, -41.8, 223.8)],
  [30, G4(-847.6, -42.0, 223.75)],
  [56, G4(-844.4, -42.4, 222.2)],
  [END, G4(-844.2, -42.4, 222.1)],
];
const CAM_TGT: VKey[] = [
  [0, [wardenPos[0], wardenPos[1], wardenPos[2] + 0.3]],
  [remapEmerge(30), [wardenPos[0], wardenPos[1], wardenPos[2] + 0.8]],
  [30, [wardenPos[0] + 0.6, wardenPos[1], wardenPos[2] + 1.3]],
  [56, [wardenPos[0] + 3.8, wardenPos[1] - 1.2, wardenPos[2] + 0.1]],
  [END, [wardenPos[0] + 4, wardenPos[1] - 1.2, wardenPos[2]]],
];
// 镜头随监守者往上爬推近（焦距拉长），最后监守者占画面中间三分之一高
// 焦距推得近（27/36/40）：监守者在 25 米外只占画面一小块、又在刘心忠身后，气势出不来。6-4-9 首帧接本段末帧的机位
const LENS: Key[] = [[0, 24], [remapEmerge(20), 27], [remapEmerge(120), 36], [END, 40]];
export const camera = (f: number): Cam => ({ pos: sampleV(CAM_POS, f) as V3, tgt: sampleV(CAM_TGT, f) as V3, lens: sample(LENS, f) });
