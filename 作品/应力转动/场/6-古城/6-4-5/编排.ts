// 6-4-5 引祸：接 6-4-3c 末帧（6-4-4 是插进去的回放）。地点：兵营里 #210 箱北那块羊毛 C 上（../古城4x布局.ts 的 `archery`、`wool642.C`），追兵在东边 370 米外的城心传送门上。
// 李樱收刀入鞘，扭过身低头瞥脚边西北刚叫过的尖啸体（`archery.尖啸体`），再转回来望东边传送门（黄叛还在门框底梁上），说「到时候召唤出监守者了，有你们好受的。」（用户 10-12 改的字，id 沿用 6-4-5-李樱-会会你们；1.4 秒开口、配音长度不变）
// 说完转身往南一蹲，大跳出兵营南门：一跳 40 米、离地 7 米越过大道落在南边矮屋顶（`wool645.R1`，落地前 0.22 秒垫羊毛），再往东北一跳 39 米（R2，大道南墙头），从镜头南边飞过出画。R3～V（绕到场子西边屋顶 V，7-2-1 他在那里）不演，时刻照排，
// 6-4-6、6-4-7 画面里看得到的羊毛和远处的他按这个时刻画（见 `liYingDetour`）。全程只踩羊毛，不发振动，感测体不响。
// 6-4-5 末帧不是 6-4-6 首帧：两处隔 200 米，硬切，全局帧照旧连着。追兵等他跳走以后才在本段第 `handoffs.pursuerStart` 秒从传送门起跳（画外，6-4-6 接着演），见 ../6-4-6/走位.ts。
// 时间：段内第 f 帧 = 6-4-3 主时间线全局帧 `startGlobalFrame` + f（= 6-4-3 时间线.总帧数 − 1，时钟已回到原速），之后剧情时间照原速。
// 动作：
//   - 收刀：照 6-1-2 收刀（uchigatana_scrap，6-1-2/编排.ts 帧 129～135，值抄在下面）原速 0.25 秒，0.6 秒入鞘（收刀声），带收刀约束（见 `liying`）；之前 0.2 秒从 6-4-3 戒备过渡。
//   - 看：头按「看着哪一点」算（世界坐标方位角、仰角，减掉身体转了多少），开头是 6-4-3c 末帧头的朝向；身子跟着转、脚挪步（见「看哪儿」）。
//   - 跳：强者跳（../古城4x布局.ts 的 `eliteLeap`，重力 32 米/秒²），用户 10-18 定人跑跳 30 米/秒，离地照布局的 `woolLeapApex`（核对.py 查过同一条弧）。
//     动作和沿弧的快慢照 6-4-1 的重做（用户 10-18 定：优先观感、不必严格重力）：古城戏.ts 的蓄力蹬直、空中、落地压到底，每跳顶点停多久不一样（`withHang`），起落时刻不变。
// 机位两镜：1. 0～`turnEndSec`：兵营东墙外他东南偏东的中景（`firstCam`），看得见他整个身子转（6-4-4 回放硬切过来，不接 6-4-3c 的机位）。
//   2. `turnEndSec` 硬切到大道墙豁口（兵营东南 20 米、豁口 x −1078～−1067 正好空着）：低机位侧面看这一跳全程，镜头跟着摇，跟着他起跳升高（R1 矮屋顶在南边一排楼后面，
//      机位不升就看不见他落上去、再起跳）；再一跳往东北从镜头南边飞过出画。机位和弹道对着新世界方块核过（工具/机位核对）。
import { type Key, sample, sampleV, track } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { G4 } from '../../../地点/古城4x.tsx';
import type { Cam } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import { FPS, PLACE_BEFORE, airPose, groundPose, landPose, mixPose, nearYaw, pivotStep, standAt, takeoffPose, yawTo } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import * as choreo643 from '../6-4-3/编排.ts';
import * as timeline643 from '../6-4-3/时间线.ts';
import { allWool, elite, eliteLeap, feetOnWool, withHang, woolBlockAt, wool645, woolLeapApex, liYingDeflectFeet, huangPanArcheryFeet, archery, woolOrder, type WoolName, type 跳 } from '../../../地点/古城4x/布局.ts';
import { lineTable } from '../../../配音/台词轨.tsx';
import type * as THREE from 'three';
import { sheathConstraint as 收刀约束, type SheathTiming } from '@库/物品/拔刀剑收刀.ts';

export { FPS };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// 6-4-3c 末帧（主时间线的全局帧）
export const startGlobalFrame = timeline643.总帧数 - 1;
export const globalFrameAt = (f: number) => startGlobalFrame + f;
export const storySecAt = (f: number) => choreo643.storySecAt(globalFrameAt(f));
export const FOOT: V3 = liYingDeflectFeet;
const eye: V3 = [FOOT[0], FOOT[1], FOOT[2] + 1.62];

// ---------- 时刻（段内秒） ----------
export const sheatheStartSec = 0.15;
const scrapStartSec = 0.35;
export const sheathedSec = 0.6; // 刀完全收进鞘里（scrap 第 135 帧），收刀声
const settleSec = 1.0;
export const turnEndSec = 2.95; // 也是切第二镜
const crouchEndSec = 3.25; // 第一跳离地
// 台词落点（段内帧，A8 字幕读这里）：1.4 秒开口，有声 2.95 秒、说到 4.35 秒，「有你们好受的」落在他蹲下、蹬起那一下
export const lineDuration = lineTable['6-4-5-李樱-会会你们'].有声长;
export const lines = { 会会你们: { id: '6-4-5-李樱-会会你们', 帧: 1.4 * FPS } } as const;

// ---------- 李樱绕行：C → R1 → … → V（追兵钟 = 段内秒） ----------
const landAbsorbSec = elite.landingSquatSec;
export const liYingDetour: { name: WoolName; jump: 跳 }[] = (() => {
  const out: { name: WoolName; jump: 跳 }[] = [];
  let pos = FOOT;
  let t = crouchEndSec;
  for (const k of Object.keys(wool645) as (keyof typeof wool645)[]) {
    const nextPos = feetOnWool(wool645[k]);
    const jump = withHang(eliteLeap(pos, nextPos, woolLeapApex[k] ?? elite.离地, t * FPS, FPS), out.length);
    out.push({ name: k, jump: jump });
    pos = nextPos;
    t = jump.f1 / FPS + landAbsorbSec;
  }
  return out;
})();
export const jump1 = liYingDetour[0].jump;
export const jump2 = liYingDetour[1].jump;
// 垫羊毛的那一帧（落地前 0.22 秒）
const placeWoolFrame = (J: 跳) => J.f1 - PLACE_BEFORE * FPS;
export const placeR1Frame = placeWoolFrame(jump1);
export const placeR2Frame = placeWoolFrame(jump2);
// 李樱到第 t 秒（追兵钟 = 本段秒，可以超过本段，6-4-6、6-4-7 接着用）已经垫好的羊毛（名字，给 古城4x画布 的 羊毛）和正在长出来的那块
const woolBefore = woolOrder.slice(0, woolOrder.indexOf('C') + 1);
export const woolAt = (t: number): { 羊毛: WoolName[]; growingWool: { w: WoolName; k: number }[] } => {
  const frame = t * FPS;
  const placed: WoolName[] = [...woolBefore];
  const growing: { w: WoolName; k: number }[] = [];
  for (const { name: name, jump: jump } of liYingDetour) {
    const pf = placeWoolFrame(jump);
    if (frame >= pf + 2) placed.push(name);
    else if (frame >= pf) growing.push({ w: name, k: (frame - pf + 1) / 3 });
  }
  return { 羊毛: placed, growingWool: growing };
};
// 7-2/几何.ts 还在用的老名字：6-4-5 以后场景里的全部羊毛（李樱绕到 V 为止垫的；场景坐标的羊毛方块底面中心）
export const allWoolAfter: V3[] = woolAt(99).羊毛.map((k) => woolBlockAt(allWool[k]));

// ---------- 李樱 ----------
const guard0 = choreo643.liying(startGlobalFrame); // 6-4-3c 末帧：握刀戒备
const lookAtPoint = (point: V3) => {
  const delta = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  return { yaw: yawTo(delta[0], delta[1]), pitch: (Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) * 180) / Math.PI };
};
const huangPanEye: V3 = [huangPanArcheryFeet[0], huangPanArcheryFeet[1], huangPanArcheryFeet[2] + 1.6];
const lookHuangPan = lookAtPoint(huangPanEye);
const guard = { ...guard0, pose: { ...guard0.pose, loc: FOOT } };
const HEADING = guard.pose.yaw! + 10; // 戒备时身子比朝向往右拧 10°（6-4-3/编排.ts 的 AFTER）
// 收刀：6-1-2/编排.ts 的 uchigatana_scrap 关键帧（6-1-2 的帧号 129～135；转身、扭转是相对朝向的角度）
const ARM_R: Key[] = [[129, 135], [130, 101], [131, 97], [133, 51], [135, 25]];
const ARM_R_ROLL: Key[] = [[129, 47], [130, 47], [131, 76], [133, 101], [135, 74]];
const ARM_L: Key[] = [[129, -33], [130, -26], [131, -29], [133, 4], [135, -50]];
const ARM_L_ROLL: Key[] = [[129, -7], [130, -25], [131, -49], [133, -36], [135, 4]];
const ELBOW_L: Key[] = [[129, 61], [130, 38], [131, 34], [133, 77], [135, 78]];
const YAW: Key[] = [[129, -28], [130, -17], [131, -4], [133, 11], [135, 29]];
const TWIST: Key[] = [[129, 23], [131, 21], [133, 20], [135, 18]];
const BLADE: Key[] = [[129, 228], [130, 128], [131, 106], [133, 127], [135, 122]];
const BLADE_SIDE: Key[] = [[129, -29], [130, -52], [131, -30], [133, -28], [135, 11]];
const scrapFrame = (t: number) => 129 + Math.min(6, Math.max(0, (t - scrapStartSec) * FPS));
const scrapPose = (o: number): FigurePose => ({
  ...guard.pose,
  armR: sample(ARM_R, o),
  armRRoll: sample(ARM_R_ROLL, o),
  elbowR: 0,
  armL: sample(ARM_L, o),
  armLRoll: sample(ARM_L_ROLL, o),
  elbowL: sample(ELBOW_L, o),
  yaw: HEADING + sample(YAW, o),
  twist: sample(TWIST, o),
});

// 看哪儿（世界方位角、仰角）：开头 = 6-4-3c 末帧头的朝向（望着传送门）；收完刀扭身低头看脚边西北的尖啸体，再转回来望东边的传送门（黄叛），转身时看着要跳的方向。
// 转头带着身子转（用户 10-19：「你转头不转身体 很诡异」）：头先到，胸对髋拧一点（`twistFollow`），身子（连脚，挪步见 `pivotStep`）晚 0.1～0.2 秒跟上；
// 看尖啸体时身子只转到离它 50°（余下的靠拧胸、扭头），看传送门、转向起跳时身子转正
const startLook = { yaw: guard.pose.yaw! + (guard.pose.twist ?? 0) + guard.pose.headYaw, pitch: guard.pose.headPitch + guard.pose.pitch };
const shriekerTop: V3 = G4(archery.尖啸体[0] + 0.5, archery.尖啸体[1] + 0.5, archery.尖啸体[2] + 0.5);
const lookShrieker = lookAtPoint(shriekerTop);
const jump1Yaw = nearYaw(HEADING, jump1.yaw);
const near = (a: number, b: number) => nearYaw(a, b);
const shriekerYaw = near(startLook.yaw, lookShrieker.yaw);
const portalYaw = near(startLook.yaw, lookHuangPan.yaw);
const LOOK_YAW: [number, number][] = [
  [0, startLook.yaw], [0.8, portalYaw], [1.0, portalYaw], [1.3, shriekerYaw], [2.05, shriekerYaw], [2.35, portalYaw], [2.55, portalYaw], [2.85, jump1Yaw], [turnEndSec, jump1Yaw],
];
const LOOK_PITCH: [number, number][] = [
  [0, startLook.pitch], [0.8, lookHuangPan.pitch], [1.0, lookHuangPan.pitch], [1.3, lookShrieker.pitch], [2.05, lookShrieker.pitch], [2.35, lookHuangPan.pitch], [2.55, lookHuangPan.pitch], [2.85, 0],
];
// 身子（整个人的 yaw）：收刀那一秒照收刀动作（`scrapPose`），之后按这张表；相邻两点不同就是在挪步转身
const BODY_YAW: [number, number][] = [
  [settleSec, HEADING], [1.05, HEADING], [1.55, shriekerYaw - 50], [2.15, shriekerYaw - 50], [2.5, portalYaw], [2.6, portalYaw], [turnEndSec, jump1Yaw],
];
const bodyYawAt = (t: number) => track(BODY_YAW, t);
const bodyStep = (pose: FigurePose, t: number): FigurePose => {
  for (let i = 0; i + 1 < BODY_YAW.length; i++) {
    const [t0, y0] = BODY_YAW[i];
    const [t1, y1] = BODY_YAW[i + 1];
    if (t >= t0 && t < t1 && Math.abs(y1 - y0) > 1) return pivotStep(pose, (t - t0) / (t1 - t0), y1 > y0);
  }
  return pose;
};
const twistFollow = (offset: number) => Math.max(-35, Math.min(35, 0.45 * offset));
// 收刀那一秒：身子照收刀动作，只把头转到看着的方向；之后胸、头按 看哪儿 和身子差多少分
const applyLook = (pose: FigurePose, t: number, follow = 0): FigurePose => {
  const wy = track(LOOK_YAW, t);
  const wp = track(LOOK_PITCH, t);
  const twist = lerp(pose.twist ?? 0, twistFollow(wy - (pose.yaw ?? 0)), follow);
  return { ...pose, twist, headYaw: Math.max(-60, Math.min(60, wy - (pose.yaw ?? 0) - twist)), headPitch: wp - pose.pitch };
};

const standPose = (yaw: number) => standAt(FOOT, yaw);
// 鞘、鞘刀：收刀约束给的鞘（腰上的局部变换）和鞘里的刀（鞘坐标系里），只在收刀那几帧有
type LiYingPose = { pose: FigurePose; bladeOn: boolean; blade: number; bladeSide: number; sheathedState?: THREE.Matrix4; sheathBlade?: THREE.Matrix4 };
const sheathedState = { bladeOn: false, blade: 0, bladeSide: 0 };
// 绕行里第 t 秒（追兵钟）的姿势：空中 airPose（落地前右手往脚下一挥垫羊毛），落地一蹲就是下一跳的蓄力，到 V 以后站着望场子
export const detourPose = (t: number): FigurePose => {
  const frame = t * FPS;
  for (let i = 0; i < liYingDetour.length; i++) {
    const jump = liYingDetour[i].jump;
    if (frame < jump.f1) return airPose(jump, frame);
    const nextJump = liYingDetour[i + 1]?.jump;
    if (nextJump && frame < nextJump.f0) return groundPose(jump.p1, jump.yaw, nextJump.yaw, frame - jump.f1, nextJump.f0 - jump.f1);
  }
  const lastJump = liYingDetour[liYingDetour.length - 1].jump;
  const sinceLand = frame - lastJump.f1;
  // 到 V 以后：落地卸力，站起来面朝东边的场子（7-2-1 他在这里远望）
  const yaw = nearYaw(lastJump.yaw, yawTo(60, 13));
  if (sinceLand < 8) return landPose(lastJump.p1, lastJump.yaw, sinceLand, 8);
  return mixPose(landPose(lastJump.p1, lastJump.yaw, 8, 8), standAt(lastJump.p1, yaw), Math.min(1, (sinceLand - 8) / 12));
};

// 原来的关键帧（不加收刀约束）：收刀那几帧刀和鞘各走各的，刀横着穿过身体从侧面插进鞘（和 6-1-2 修之前一样）
const liyingRaw = (segFrame: number): LiYingPose => {
  const t = segFrame / FPS;
  if (t <= sheatheStartSec) return guard;
  if (t < settleSec) {
    // 戒备 → scrap 129（0.15～0.35）→ scrap 129～135（0.35～0.6，入鞘）→ 按刀站定（0.6～1.0）
    const scrapKey = scrapFrame(t);
    let pose = scrapPose(scrapKey);
    const w0 = track([[sheatheStartSec, 0], [scrapStartSec, 1]], t);
    if (w0 < 1) pose = mixPose(guard.pose, pose, w0);
    const w1 = track([[sheathedSec, 0], [settleSec, 1]], t);
    if (w1 > 0) pose = mixPose(pose, standPose(HEADING), w1);
    const leg = track([[0.3, 0], [settleSec, 1]], t);
    pose = {
      ...pose,
      loc: FOOT,
      pitch: track([[0, guard.pose.pitch], [sheathedSec, -6], [settleSec, 0]], t),
      legR: guard.pose.legR * (1 - leg),
      legL: guard.pose.legL * (1 - leg),
      kneeR: (guard.pose.kneeR ?? 0) * (1 - leg),
      kneeL: (guard.pose.kneeL ?? 0) * (1 - leg),
    };
    const on = t < sheathedSec;
    const blend = (a: number, b: number) => a + (b - a) * w0;
    return { pose: applyLook(pose, t, w1), bladeOn: on, blade: blend(guard.blade, sample(BLADE, scrapKey)), bladeSide: blend(guard.bladeSide, sample(BLADE_SIDE, scrapKey)) };
  }
  if (t < turnEndSec) return { pose: bodyStep(applyLook(standPose(bodyYawAt(t)), t, 1), t), ...sheathedState };
  if (segFrame < jump1.f0) {
    const crouchProgress = (t - turnEndSec) / (crouchEndSec - turnEndSec);
    return { pose: takeoffPose(FOOT, jump1Yaw, crouchProgress), ...sheathedState };
  }
  const detour = detourPose(t);
  return { pose: segFrame < jump1.f1 ? { ...detour, yaw: jump1Yaw } : detour, ...sheathedState };
};

// ---------- 段长、机位 ----------
// 第二跳 4.95 秒蹬起、从镜头南边飞过，5.6 秒出画：段长 134 帧
// 收刀约束（同 6-1-2 的修法，见 6-1-2/收刀.ts）：左手把鞘转过来迎刀，刀尖落进鞘口、顺着鞘的轴线滑进去，右手、左手用 IK 追刀柄和鞘口。
// 节奏按段内帧：0.15 秒起从戒备姿势收，0.41 秒刀尖进鞘口，0.6 秒入鞘（收刀声那一刻，不挪），之后 0.4 秒鞘转回腰上、右手回到按刀（站定）。
// 收刀只有 0.45 秒，不学 6-1-2 新版先把刀横在右侧停一拍，走原版路线（从收势经身前翻下来对鞘口）
export const sheatheRhythm645: SheathTiming = { start: sheatheStartSec * FPS, tipIn: 0.41 * FPS, sheathed: sheathedSec * FPS, release: [sheathedSec * FPS, settleSec * FPS] };
// 收刀修前：不加约束（核对穿模用）
export const liying = (segFrame: number, rawSheathe = false): LiYingPose => {
  const raw = liyingRaw(segFrame);
  if (rawSheathe) return raw;
  const constrained = 收刀约束(raw.pose, segFrame, sheatheRhythm645, (t) => {
    const rawAt = liyingRaw(t);
    return [rawAt.pose, rawAt.blade, rawAt.bladeSide];
  });
  return { ...raw, bladeOn: constrained.bladeOut ?? raw.bladeOn, sheathedState: constrained.sheath, sheathBlade: constrained.blade };
};

export const frameCount = 134;
// 第一镜：6-4-3c 末帧的机位（合并前用暂代的：他身后偏南、高出头顶一点往东看）
// 第一镜（用户 10-19：原来身后越肩的机位看不出身子转，「把这个镜头改掉」）：兵营东墙外、他东南 6 米、比脚底高 1.6 米的中景，往西北看：
// 开头他侧着身子收刀，扭身看尖啸体（尖啸体在他身后的画里）、转回来望传送门（画外右边），再转过来朝镜头这边要起跳，整个身子怎么转都看得见。
// 他东边紧挨着一格高的东墙，机位偏南到视线从墙南头 (−1086, 195) 过去，不挡腿；南门柱子 (−1086, 198) 在视线东边。镜头不动，焦距 30 → 32 慢慢推一点
const firstCamPos: V3 = G4(-1083.0, -44.4, 199.8);
const firstCamTgt: V3 = [FOOT[0], FOOT[1], FOOT[2] + 0.95];
export const firstCam = (segFrame: number): Cam => ({ pos: firstCamPos, tgt: firstCamTgt, lens: lerp(30, 32, Math.min(1, segFrame / (turnEndSec * FPS))) });
// 第二镜：大道墙豁口里、离地 2.4 米，往西南看兵营和墙头；跟着他摇（目标跟着他腰），焦距见 LENS2。
// 他蹬起以后机位升到离地 11 米（和他这一跳的顶点一样高，不俯拍他的跳），越过南边那排楼看得见 R1 屋顶
const craneKeys: Key[] = [[80, 0], [104, 1]];
const sideCamPos = (segFrame: number): V3 => sampleV([[80, G4(-1067.5, -48.6, 206.5)], [104, G4(-1072, -40, 212)]], segFrame) as V3;
const waistAt = (t: number): V3 => {
  const loc = detourPose(t).loc;
  return [loc[0], loc[1], loc[2] + 1];
};
const cut2Frame = turnEndSec * FPS;
// 镜头目标：蹲着的时候对着他（兵营东墙后面露出上半身），起跳以后跟着他的腰（前后 3 帧平均），往上留一点头顶空间；
// 焦距 32mm（太广了在大洞里就是一个小点），第二跳他离镜头 20 米上下，收到 28mm
const smoothedWaist = (frame: number): V3 => {
  const sum: V3 = [0, 0, 0];
  for (let k = -3; k <= 3; k++) {
    const waist = waistAt((frame + k) / FPS);
    for (let i = 0; i < 3; i++) sum[i] += waist[i] / 7;
  }
  return sum;
};
const LENS2: Key[] = [[cut2Frame, 32], [jump1.f1, 30], [frameCount - 1, 28]];
export const camera = (segFrame: number): Cam => {
  if (segFrame < cut2Frame) return firstCam(segFrame);
  const target = smoothedWaist(Math.max(segFrame, cut2Frame + 3));
  // 机位还在低处时，他跳得越高，目标越往他和地面中间压（离地每高 1 米压 0.6 米）：只跟着他仰拍，画面里就只剩洞顶，看不出这一跳有多高；
  // 压下来兵营和墙头一直在画面下半边。机位升到和他一样高就不用压了，再压他就出了画面上沿
  const heightAboveFoot = Math.max(0, target[2] - FOOT[2] - 1);
  const press = 0.6 * (1 - sample(craneKeys, segFrame));
  return { pos: sideCamPos(segFrame), tgt: [target[0], target[1], target[2] + 0.6 - press * heightAboveFoot], lens: sample(LENS2, segFrame) };
};
