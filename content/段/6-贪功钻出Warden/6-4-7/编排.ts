// 6-4-7 贪功（搬进古城4x 重做）：首帧硬切接 6-4-6，是 6-4-6 末帧的下一刻（二人站场子东半边，刚踩响第三次尖啸，黄叛在打量北墙头）。和 6-4-8、6-4-9 是一个不切的镜头，合成一段 6-4-7至9（../6-4-7至9/）。
// 刘心忠不耐烦地一挥手：「管他的，只要拿下这个家伙，就能回环卫城过贵族生活了！」（用户 10-12 改词，id 沿用；0.6 秒开口、配音长度不变），话没说完往西一跳（强者跳，离地 7 米、11 米远），重重落在幽匿块上——
// 落地振动 3 刻到感测体 (−868,−51,218)、1 刻到尖啸体 (−869,−51,218)：第四次尖啸（振动链见 ../6-4-6/追兵.ts，离第三次 11 秒，过了 10 秒警告冷却）。黄叛跟着一跳落在他东边（冷却里，只有咔嗒）。
// 二人落地一蹲，起步往西慢慢走，末帧 = `handoffs.六四八首`（第四次尖啸后 1.0 秒、1.6 米/秒往西走，离 刘心忠站位 / 黄叛站位 各差 1.2 米）。
// 走在幽匿块上每步都发振动，所以第三、四次之间他们站着说话，刘心忠一跳扑过去、落地那一下才踩响（布局文件 追兵站定 的说明）。
//
// 机位：开头硬切反打刘心忠（见下面「机位」），二人起跳时往左（西）摇着仰看这一跳，落地后镜头往东北挪到二人身后，越过肩头往西看（第四次尖啸体、监守者钻出处、北墙根羊毛 F1 都在画里），停在 6-4-8 首帧机位。
// 最后 0.4 秒淡进 6-4-8 的 `pursuers`，末帧机位直接用它的 `camera(0)`；6-4-8 第 0 帧不在 `handoffs.六四八首` 上就在加载时报错。
import { type Key, type VKey, sample, sampleV, track } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { mixPose } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { handoffs } from '../../../../world/地点/古城4x/布局.ts';
import { lookToward } from '../../../场/6-古城/6-4-6/走位.ts';
import { FPS, τ647, frameCount647, huangPanPose, liuXinzhongPose, liuStompJump, huangFollowJump, fourthShriek, startSec647 } from '../../../场/6-古城/6-4-6/追兵.ts';
import * as K648 from '../../../../world/地点/古城4x/6-4-8/编排.ts';
import { lineTable } from '../../../../world/配音/台词轨.tsx';

export { FPS };
export const frameCount = frameCount647;
const lastFrame = frameCount - 1;
export const τ = τ647;
// 第四次尖啸（段内）
export const shriekSec = fourthShriek.t - startSec647;
export const shriekFrame = shriekSec * FPS;
export const stompSec = liuStompJump.f1 / FPS - startSec647;
export const stompPos: V3 = liuStompJump.p1;
export const shrieker4Pos: V3 = fourthShriek.p;
// 台词落点（段内帧，A8 字幕读这里）：0.6 秒开口、有声 4.46 秒，5.06 秒说完；他 3.98 秒起跳，「……贵族生活了！」是在半空里喊完的
export const lineDuration = lineTable['6-4-7-刘心忠-贵族生活'].有声长;
export const lines = {
  贵族生活: { id: '6-4-7-刘心忠-贵族生活', 帧: 0.6 * FPS },
} as const;

// ---------- 二人 ----------
export const liuJumpSec = liuStompJump.f0 / FPS - startSec647;
const huangJumpSec = huangFollowJump.f0 / FPS - startSec647;
const bump = (t: number, a: number, b: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - a) / (b - a))));
// 6-4-6 末帧的「看」：黄叛看着北墙头、刘心忠看着黄叛（6-4-6/编排.ts 的 pursuers 末尾那几个权重都是 1），这里接着慢慢松开
const huangWallTarget: V3 = G4(-866, -42, 211);
// 衔接契约：6-4-8 的 pursuers(0) 必须站在 `handoffs.六四八首` 上，对不上就报错，不悄悄跳过下面 0.4 秒的淡进（架构评估报告第 13 条，用户 10-21 同意照报告建议做）
{
  const pose648 = K648.pursuers(0);
  const off = (['刘', '黄'] as const)
    .map((who) => [who, Math.hypot(pose648[who].loc[0] - handoffs.六四八首[who][0], pose648[who].loc[1] - handoffs.六四八首[who][1])] as const)
    .filter(([, dist]) => dist > 0.01);
  if (off.length) throw new Error(`6-4-7 接 6-4-8 对不上：6-4-8 第 0 帧${off.map(([who, dist]) => `${who}离 handoffs.六四八首.${who} ${dist.toFixed(3)} 米`).join('，')}`);
}
const blendInSec = 0.4; // 最后 0.4 秒淡进 6-4-8 的 pursuers
export const pursuers = (frame: number): { 刘: FigurePose; 黄: FigurePose } => {
  const t = frame / FPS;
  const chaseT = τ(frame);
  let huangPose = huangPanPose(chaseT);
  let liuPose = liuXinzhongPose(chaseT);
  // 黄叛：从看北墙头转回来看刘心忠（他开口了），起跳前松开
  const huangWallWeight = track([[0, 1], [0.6, 1], [1.2, 0]], t);
  const lookLiuWeight = track([[0.9, 0], [1.4, 1], [huangJumpSec - 0.6, 1], [huangJumpSec - 0.25, 0]], t);
  huangPose = lookToward(huangPose, huangWallTarget, huangWallWeight, 0.3);
  huangPose = lookToward(huangPose, [liuPose.loc[0], liuPose.loc[1], liuPose.loc[2] + 0.2], lookLiuWeight, 0.4);
  // 刘心忠：先还看着黄叛，挥手（0.6～1.7）「管他的」，转回来盯着西边，3.98 秒起跳
  liuPose = lookToward(liuPose, [huangPose.loc[0], huangPose.loc[1], huangPose.loc[2] + 0.2], track([[0, 1], [1.2, 1], [1.8, 0]], t), 0.4);
  const wave = bump(t, 0.6, 1.7);
  if (wave > 0) liuPose = { ...liuPose, armR: liuPose.armR + (110 - liuPose.armR) * wave, armRRoll: liuPose.armRRoll + 35 * Math.sin((t - 0.6) * 14) * wave };
  if (frame > lastFrame - blendInSec * FPS) {
    const poses648 = K648.pursuers(frame - lastFrame);
    const blendWeight = (frame - (lastFrame - blendInSec * FPS)) / (blendInSec * FPS);
    const blendPose = (from: FigurePose, to: FigurePose): FigurePose => {
      const mixed = mixPose(from, to, blendWeight);
      return { ...mixed, loc: [from.loc[0] + (to.loc[0] - from.loc[0]) * blendWeight, from.loc[1] + (to.loc[1] - from.loc[1]) * blendWeight, from.loc[2] + (to.loc[2] - from.loc[2]) * blendWeight] };
    };
    return { 刘: blendPose(liuPose, poses648.刘), 黄: blendPose(huangPose, poses648.黄) };
  }
  return { 刘: liuPose, 黄: huangPose };
};

// ---------- 机位 ----------
// 6-4-6 末帧是黄叛近景（越过刘心忠肩头），这里硬切反打刘心忠（下一刻，不跳时间）：机位在黄叛东北、离地 1.7 米，越过黄叛左肩看刘心忠挥手、说话、转回去盯西边；之后照旧（起跳时升上去仰看这一跳、落地后挪到 6-4-8 首帧机位）
const firstCam: Cam = { pos: G4(-851.35, -49.0, 229.35), tgt: G4(-854.5, -49.65, 224.5), lens: 30 }; // 黄叛身后 2.8 米、偏一侧 1.2 米、比他的头高 0.4 米：他的肩头只占画面右下一角
// 刘心忠起跳时升上去的机位：二人东南、离地 5.5 米，越过东边碎石堆往西看
const jumpCamPos = G4(-851.5, -45.5, 230.5);
// 末帧机位 = 6-4-8 首帧机位
const lastCam: Cam = K648.camera(0);
// 机位在二人南边，刘心忠蹲下起跳时往东上方升 3 米（越过脚边碎石堆看他落地那一踩），二人都往西北跳走（离镜头越来越远不会撞上），第四次尖啸响过 0.1 秒才往北挪到 6-4-8 首帧机位（早挪会被东边碎石堆挡住刘心忠）
const CAM_POS: VKey[] = [
  [0, firstCam.pos],
  [3.8 * FPS, firstCam.pos],
  [5.0 * FPS, jumpCamPos],
  [5.6 * FPS, jumpCamPos],
  [6.2 * FPS, lastCam.pos],
  [lastFrame, lastCam.pos],
];
// 目标：起跳时往左上摇着跟刘心忠（他身上方 1 米），落地后转到西边的尖啸体，末帧交给 末机
const liuWaistAt = (sec: number): V3 => {
  const loc = liuXinzhongPose(τ(sec * FPS)).loc;
  return [loc[0], loc[1], loc[2] + 1.2];
};
const CAM_TGT: VKey[] = [
  [0, firstCam.tgt],
  [3.4 * FPS, firstCam.tgt],
  [(liuJumpSec + 0.25) * FPS, liuWaistAt(liuJumpSec + 0.25)],
  [(liuJumpSec + 0.7) * FPS, liuWaistAt(liuJumpSec + 0.6)],
  [(stompSec + 0.05) * FPS, [liuWaistAt(stompSec)[0] - 2, liuWaistAt(stompSec)[1], liuWaistAt(stompSec)[2] - 0.3]],
  [(shriekSec + 0.3) * FPS, [shrieker4Pos[0], shrieker4Pos[1], shrieker4Pos[2] + 1.2]],
  [lastFrame, lastCam.tgt],
];
const LENS: Key[] = [[0, firstCam.lens], [3.4 * FPS, firstCam.lens], [(liuJumpSec + 0.6) * FPS, 22], [(stompSec + 0.1) * FPS, 30], [(shriekSec + 0.3) * FPS, 32], [lastFrame, lastCam.lens]];
export const camera = (f: number): Cam => ({ pos: sampleV(CAM_POS, f) as V3, tgt: sampleV(CAM_TGT, f) as V3, lens: sample(LENS, f) });
