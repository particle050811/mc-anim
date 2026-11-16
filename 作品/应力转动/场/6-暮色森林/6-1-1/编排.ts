// 6-1-1 进入森林：全部时间轴与姿态，纯函数，输入编排时间 t（秒，= 段内秒 + `T0`：原来按 1/24 秒一格排、第 1 格是段首，常数照原来的格写成 n / 24）。
// 注释里的「帧」「f」是这种格。
// 场景坐标 Z 朝上，1 = MC 一格。前半段在主世界传送门海岛（模型/场景/传送门海岛.tsx），后半段在暮色森林返回传送门（模型/场景/娜迦庭院.tsx）。
// 最后一帧和 6-1-2 第 1 帧完全一样（机位、落脚点、落地姿势直接调 6-1-2 的函数）。
// 人不能停在传送门方块上（用户 10-01：站在门上会被传回去），所以带着往前上方的冲劲从门里跃出。台词见 声音.tsx。
// 镜头：A（f1–128）海岛空中侧拍一镜到底；D1（f129–159）暮色直道上迎面看门；
// D2（f160–169）九胡飞到最高点时切到 6-1-2 第 1 帧机位（门西边高处往东看），最后一帧接 6-1-2。
import { type Key, type VKey, sample, sampleV, track } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { type FigurePose, standPose } from '@库/角色/骨架.tsx';
import { PORTAL_ISLAND } from '../../../地点/传送门海岛.tsx';
import { NAGA_COURTYARD } from '../../../地点/娜迦庭院.tsx';
import * as choreo612 from '../6-1-2/编排.ts';
import { pickTier } from '@engine/段/按时取值.ts';
import { smoothstep01, lerp, lerpV } from '@engine/core/数学.ts';

// 时间轴（秒）
const W0 = 12 / 24; // 开头先看着手里的钻石，这一刻开始往后引手
const REL = W0 + 12 / 24; // 钻石出手
const LAND = REL + 22 / 24; // 钻石落进水里
export const STRIKE = LAND + 18 / 24; // 闪电劈下，水面变成传送门
const BEAT = STRIKE + 20 / 24; // 闪电闪完、定了定神：李樱回头看一眼九胡，她点头
const LY_UP = BEAT + 15 / 24; // 李樱起跳
const LY_IN = LY_UP + 13 / 24; // 李樱碰到传送门，消失
const JH_UP = LY_UP + 11 / 24; // 九胡起跳（李樱还在半空，她就跟上了）
const JH_IN = JH_UP + 14 / 24; // 九胡碰到传送门，消失
export const CUT = JH_IN + 5 / 24; // 切到暮色森林
const LY_POP = CUT + 14 / 24; // 李樱从返回传送门里弹出来（之前 14 格门上先聚紫光）
const JH_POP = LY_POP + 8 / 24; // 九胡隔 8 格弹出来
const POP_N = 18 / 24; // 弹出来到落地 0.75 秒
export const D2 = JH_POP + 9 / 24; // 九胡飞到最高点，切到 6-1-2 的机位（第 1 场段界：6-1-2 从这一镜起，见 6-1/段界.ts）
// 九胡落地：这一刻起由 6-1-2 段首接着演（同一时刻、同一机位、同一落地姿势）
export const LAST = JH_POP + POP_N;
// 段首（段内第 0 秒）在编排时间里的时刻：关键帧表是从这里写起的
export const T0 = 1 / 24;
export const segSec = (t: number) => t - T0;
const F612 = choreo612.STORY_T0; // 6-1-2 段首的剧情时间
export const world = (t: number): 'island' | 'tf' => (t < CUT ? 'island' : 'tf');
export const portalActive = (t: number) => t >= STRIKE;

// ---------- 主世界：海岛 ----------
const [PX, PY, PZ] = PORTAL_ISLAND.pool;
const grassZ = PORTAL_ISLAND.grass;
const PORTAL_Z = grassZ - 0.19; // 传送门方块顶面（比草地低 3/16 格）
// 二人站在水池东边花圈外面朝水池，太阳低垂在西边正照脸上；李樱离水池近、九胡在他右后方（镜头这侧），侧面看两人不互相挡
const LY0: V3 = [PX + 2.7, PY + 0.25, grassZ];
const JH0: V3 = [PX + 4.05, PY - 0.75, grassZ];
const yawTo = (from: number[], to: number[]) => (Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * 180) / Math.PI;
const LY_YAW0 = yawTo(LY0, [PX, PY]);
// 落点：都落在 2×2 传送门的中间一带
const LY_LAND: V3 = [PX + 0.2, PY + 0.25, PORTAL_Z];
const JH_LAND: V3 = [PX + 0.15, PY - 0.3, PORTAL_Z];
const JH_YAW0 = yawTo(JH0, JH_LAND);

// MC 的跳跃：起跳 0.42 格/刻、重力 0.08 格/刻²，约 1.25 格高；重力 32 格/秒²
const JUMP_G = 32;
const hop = (start: number[], end: number[], dur: number, t: number, gravity = JUMP_G): V3 => {
  const vz = (end[2] - start[2] + (gravity * dur * dur) / 2) / dur;
  const k = t / dur;
  return [lerp(start[0], end[0], k), lerp(start[1], end[1], k), start[2] + vz * t - (gravity * t * t) / 2];
};

const LY_ARM_R: Key[] = [[1 / 24, 28], [W0, 28], [W0 + 7 / 24, -55], [REL, 72], [REL + 4 / 24, 100], [REL + 16 / 24, 12], [LAST, 12]];
const LY_ELBOW_R: Key[] = [[1 / 24, 45], [W0, 40], [W0 + 7 / 24, 8], [REL, 12], [REL + 4 / 24, 18], [REL + 16 / 24, 8], [LAST, 8]];
const LY_ARM_L: Key[] = [[1 / 24, 0], [W0, 0], [W0 + 7 / 24, 18], [REL, -25], [REL + 4 / 24, -30], [REL + 16 / 24, -4], [LAST, -4]];
const LY_PITCH: Key[] = [[1 / 24, 0], [W0, 0], [W0 + 7 / 24, 5], [REL, -9], [REL + 4 / 24, -11], [REL + 18 / 24, -2], [LAST, -2]];
const LY_HEAD: Key[] = [
  [1 / 24, -18], [W0, -16], [W0 + 7 / 24, -8], [REL, 2], [REL + 11 / 24, 8], [LAND, -24], [STRIKE - 1 / 24, -24], [STRIKE + 3 / 24, -8], [STRIKE + 12 / 24, -14], [LAST, -14],
];
const LY_HEAD_YAW: Key[] = [[1 / 24, 0], [BEAT + 1 / 24, 0], [BEAT + 4 / 24, 55], [BEAT + 9 / 24, 55], [BEAT + 12 / 24, 0], [LAST, 0]];
const LY_LEG_R: Key[] = [[1 / 24, 0], [W0, 0], [W0 + 7 / 24, -14], [REL + 4 / 24, -16], [REL + 20 / 24, -4], [LAST, -4]];
const LY_LEG_L: Key[] = [[1 / 24, 0], [W0, 0], [W0 + 7 / 24, 14], [REL + 4 / 24, 18], [REL + 20 / 24, 5], [LAST, 5]];
const J0 = LY_UP - 0.25;
const LY_JUMP = {
  pitch: [[J0, -2], [LY_UP - 2 / 24, -12], [LY_UP, -8], [LY_UP + 5 / 24, -4], [LY_IN, -2]] as Key[],
  legR: [[J0, -4], [LY_UP - 2 / 24, 30], [LY_UP, -8], [LY_UP + 5 / 24, 30], [LY_IN, 24]] as Key[],
  kneeR: [[J0, 0], [LY_UP - 2 / 24, 52], [LY_UP, 4], [LY_UP + 5 / 24, 55], [LY_IN, 30]] as Key[],
  legL: [[J0, 5], [LY_UP - 2 / 24, 28], [LY_UP, -12], [LY_UP + 5 / 24, -8], [LY_IN, 10]] as Key[],
  kneeL: [[J0, 0], [LY_UP - 2 / 24, 50], [LY_UP, 6], [LY_UP + 5 / 24, 40], [LY_IN, 20]] as Key[],
  armR: [[J0, 12], [LY_UP - 2 / 24, -45], [LY_UP, 70], [LY_UP + 5 / 24, 40], [LY_IN, 25]] as Key[],
  armL: [[J0, -4], [LY_UP - 2 / 24, -45], [LY_UP, 70], [LY_UP + 5 / 24, 40], [LY_IN, 25]] as Key[],
};

// 九胡：站在旁边看；闪电劈下时吓一跳（往后一缩、两手抬到胸前），回过神来跟着跳
const JH_PITCH: Key[] = [[1 / 24, 0], [STRIKE, 0], [STRIKE + 2 / 24, 9], [STRIKE + 12 / 24, 2], [JH_UP - 6 / 24, 0], [JH_UP - 2 / 24, -14], [JH_UP, -6], [JH_UP + 5 / 24, -4], [JH_IN, -4]];
const JH_ARM: Key[] = [[1 / 24, 0], [STRIKE, 0], [STRIKE + 2 / 24, 70], [STRIKE + 12 / 24, 58], [STRIKE + 18 / 24, 6], [JH_UP - 2 / 24, -40], [JH_UP, 60], [JH_UP + 5 / 24, 50], [JH_IN, 40]];
const JH_ARM_ROLL: Key[] = [[1 / 24, 0], [STRIKE, 0], [STRIKE + 2 / 24, 30], [STRIKE + 12 / 24, 28], [STRIKE + 18 / 24, 0], [LAST, 0]];
// 李樱回头看她时，她看回去、点一下头
const JH_HEAD: Key[] = [
  [1 / 24, -14], [REL, -6], [LAND, -22], [STRIKE, -22], [STRIKE + 2 / 24, 6], [STRIKE + 12 / 24, -6], [STRIKE + 18 / 24, -14],
  [BEAT + 4 / 24, -6], [BEAT + 7 / 24, -26], [BEAT + 10 / 24, -4], [BEAT + 13 / 24, -14], [LAST, -14],
];
// 头先转过去看李樱扔（他在她右前方，往右转是负），再看水池；点头时又转向李樱
const JH_HEAD_YAW: Key[] = [[1 / 24, -30], [REL, -18], [LAND, 0], [BEAT + 1 / 24, 0], [BEAT + 4 / 24, -32], [BEAT + 12 / 24, -32], [BEAT + 15 / 24, 0], [LAST, 0]];
const JH_LEG_R: Key[] = [[1 / 24, 0], [JH_UP - 6 / 24, 0], [JH_UP - 2 / 24, 22], [JH_UP, -12], [JH_UP + 5 / 24, 34], [JH_IN, 30]];
const JH_LEG_L: Key[] = [[1 / 24, 0], [JH_UP - 6 / 24, 0], [JH_UP - 2 / 24, 20], [JH_UP, -16], [JH_UP + 5 / 24, -18], [JH_IN, -10]];

// 右手握持点的位置：和 骨架.tsx 的 Figure 同一套变换（转身 → 前倾 → 胸扭转 → 肩 → 肘），单位像素，最后按身高缩放到格
const rx = (vec: number[], angle: number) => { const cos = Math.cos(angle), sin = Math.sin(angle); return [vec[0], vec[1] * cos - vec[2] * sin, vec[1] * sin + vec[2] * cos]; };
const ry = (vec: number[], angle: number) => { const cos = Math.cos(angle), sin = Math.sin(angle); return [vec[0] * cos + vec[2] * sin, vec[1], -vec[0] * sin + vec[2] * cos]; };
const rz = (vec: number[], angle: number) => { const cos = Math.cos(angle), sin = Math.sin(angle); return [vec[0] * cos - vec[1] * sin, vec[0] * sin + vec[1] * cos, vec[2]]; };
const degToRad = Math.PI / 180;
export const handR = (pose: FigurePose, height = 1.875): V3 => {
  const reach = (a: number, knee: number) => 6 * Math.cos((a + pose.pitch) * degToRad) + 6 * Math.cos((a + pose.pitch - knee) * degToRad);
  const grounded = Math.max(3, reach(pose.legR, pose.kneeR ?? 0), reach(pose.legL, pose.kneeL ?? 0));
  const hip = 12 + (pose.ground ?? 1) * (grounded - 12);
  // 肩下：上臂 4 像素到肘，前臂再 5 像素到握持点
  let point = [0, 0, -4].map((x, i) => x + rx([0, 0, -5], (pose.elbowR ?? 0) * degToRad)[i]);
  point = ry(rx(point, pose.armR * degToRad), pose.armRRoll * degToRad);
  point = [point[0] + 6, point[1], point[2] + 22];
  point = rz(point, (pose.twist ?? 0) * degToRad);
  point = [point[0], point[1], (point[2] - 12) * pose.squash];
  point = rx(point, pose.pitch * degToRad);
  point = [point[0], point[1], point[2] + hip * pose.squash];
  point = rz(point, (pose.yaw ?? 0) * degToRad).map((x) => (x * height) / 32);
  return [pose.loc[0] + point[0], pose.loc[1] + point[1], pose.loc[2] + point[2]];
};

const lyIsland = (t: number): FigurePose => {
  const j = t >= J0;
  const air = t >= LY_UP;
  const loc = air ? hop(LY0, LY_LAND, LY_IN - LY_UP, t - LY_UP) : LY0;
  return {
    ...standPose(loc),
    yaw: LY_YAW0,
    pitch: j ? sample(LY_JUMP.pitch, t) : sample(LY_PITCH, t),
    headPitch: air ? -20 : sample(LY_HEAD, t),
    headYaw: sample(LY_HEAD_YAW, t),
    legR: j ? sample(LY_JUMP.legR, t) : sample(LY_LEG_R, t),
    legL: j ? sample(LY_JUMP.legL, t) : sample(LY_LEG_L, t),
    kneeR: j ? sample(LY_JUMP.kneeR, t) : 0,
    kneeL: j ? sample(LY_JUMP.kneeL, t) : 0,
    armR: j ? sample(LY_JUMP.armR, t) : sample(LY_ARM_R, t),
    armRRoll: 6,
    elbowR: j ? 10 : sample(LY_ELBOW_R, t),
    armL: j ? sample(LY_JUMP.armL, t) : sample(LY_ARM_L, t),
    armLRoll: 6,
    elbowL: j ? 10 : 0,
    ground: air ? 0 : 1,
  };
};

const jhIsland = (t: number): FigurePose => {
  const air = t >= JH_UP;
  const loc = air ? hop(JH0, JH_LAND, JH_IN - JH_UP, t - JH_UP) : JH0;
  const arm = sample(JH_ARM, t);
  return {
    ...standPose(loc),
    yaw: JH_YAW0,
    pitch: sample(JH_PITCH, t),
    headPitch: sample(JH_HEAD, t),
    headYaw: sample(JH_HEAD_YAW, t),
    legR: sample(JH_LEG_R, t),
    legL: sample(JH_LEG_L, t),
    armR: arm,
    armL: arm,
    armRRoll: sample(JH_ARM_ROLL, t),
    armLRoll: sample(JH_ARM_ROLL, t),
  };
};

// 钻石：出手前捏在右手里，出手后按物品重力（0.04 格/刻²）飞抛物线落进水池正中，沉下去缩小消失
const ITEM_G = 16;
const DROP: V3 = [PX + 0.1, PY + 0.1, PZ];
export const diamond = (t: number): { loc: V3; spin: number; scale: number } | null => {
  if (t >= LAND + 0.5) return null;
  const spin = 432 * Math.max(0, t - REL); // 每秒转 432°（每格 18°）
  if (t <= REL) {
    const hand = handR(lyIsland(t));
    return { loc: [hand[0], hand[1], hand[2] - 0.05], spin: 0, scale: 1 };
  }
  const start = handR(lyIsland(REL));
  if (t <= LAND) return { loc: hop([start[0], start[1], start[2] - 0.05], DROP, LAND - REL, t - REL, ITEM_G), spin, scale: 1 };
  const sunk = t - LAND;
  return { loc: [DROP[0], DROP[1], PZ - 0.96 * sunk - 0.15], spin: spin * 0.3, scale: 1 - smoothstep01(sunk / 0.5) };
};

export const splashSec = (t: number) => t - LAND;
export const waterGlow = (t: number) => (t >= STRIKE ? 0 : track([[LAND, 0], [LAND + 4 / 24, 0.9], [LAND + 12 / 24, 0.35], [STRIKE - 6 / 24, 0.45], [STRIKE - 1 / 24, 1]], t));

// 闪电：原版闪电劈下时亮暗闪几下；一档 1/24 秒（第 i 档从 STRIKE + i 格起、到下一格为止），共 0.375 秒。
// 硬闪：档内不插值，帧落在哪一档就是哪一档的亮度（整格上和以前逐格给的一样）
const FLASH = [1, 1, 0.35, 1, 0.75, 0.2, 0.6, 0.3, 0.12];
const FLASH_PER_SEC = 24;
export const flash = (t: number) => pickTier(FLASH, (t - STRIKE) * FLASH_PER_SEC, { value: 0 });
export const BOLT_AT: V3 = [PX, PY, PZ];
// 闪电形状：机位 A 里只看得到最下面一段的下半截，挑一个在画面平面里往左上斜、不朝镜头也不朝人倒的，人在右边不被挡
export const BOLT_SEED = 23;

// 海岛一镜到底（f1–128）：机位在水池南边 9～10 格、高出草地 2.6～2.9 格，水池在左、二人在右。
// 不切远景（用户 10-01：海面闪电全景意义不明）。
const CAM_A = {
  pos: [
    [1 / 24, [PX + 2.3, PY - 9.6, grassZ + 2.8]],
    [LAND, [PX + 1.9, PY - 9.7, grassZ + 2.7]],
    [STRIKE - 2 / 24, [PX + 1.6, PY - 9.8, grassZ + 2.6]],
    [STRIKE + 0.75, [PX + 1.4, PY - 9.5, grassZ + 2.8]],
    [CUT - 1 / 24, [PX + 1.3, PY - 9.4, grassZ + 2.9]],
  ] as VKey[],
  tgt: [
    [1 / 24, [PX + 1.8, PY, grassZ + 1.45]],
    [LAND, [PX + 1.5, PY, grassZ + 1.5]],
    [STRIKE - 2 / 24, [PX + 1.2, PY, grassZ + 1.95]],
    [STRIKE + 0.75, [PX + 1.3, PY, grassZ + 1.6]],
    [CUT - 1 / 24, [PX + 1.3, PY, grassZ + 1.6]],
  ] as VKey[],
};
const CAM_A_LENS: Key[] = [[1 / 24, 40], [LAND, 40], [STRIKE - 2 / 24, 36], [CUT - 1 / 24, 37]];

// ---------- 暮色森林：返回传送门 ----------
// 最后一帧 = 6-1-2 第 1 帧：机位、落脚点和落地姿势都从 6-1-2 的函数取
const portalCenter = NAGA_COURTYARD.portal;
const LY_END = () => choreo612.liying(F612).pose;
const JH_END = () => choreo612.jiuhu(F612);

const blend = (fromPose: FigurePose, toPose: FigurePose, k: number): FigurePose => {
  if (k >= 1) return { ...toPose }; // 混合完就原样用 b（插值算到头会有浮点误差）
  const out = { ...toPose } as Record<string, unknown>;
  for (const key of Object.keys(toPose) as (keyof FigurePose)[]) {
    const va = fromPose[key];
    const vb = toPose[key];
    if (typeof vb === 'number') out[key] = lerp(typeof va === 'number' ? va : 0, vb, k);
    else if (Array.isArray(vb)) out[key] = lerpV((va as number[]) ?? vb, vb, k);
  }
  return out as FigurePose;
};
const chain = (poses: FigurePose[], us: number[], progress: number): FigurePose => {
  if (progress <= us[0]) return { ...poses[0] };
  for (let i = 0; i < us.length - 1; i++) if (progress <= us[i + 1]) return blend(poses[i], poses[i + 1], smoothstep01((progress - us[i]) / (us[i + 1] - us[i])));
  return { ...poses[poses.length - 1] };
};

// 弹出轨迹：起点脚底在门顶面下 1.2 格、正对落脚点，斜飞越过花圈；竖直方向用 MC 重力（同海岛跳）
const POP_DEPTH = 1.2;
const popLoc = (end: number[], pop: number, t: number): V3 => hop([portalCenter[0] + 0.25, end[1], portalCenter[2] - POP_DEPTH], end, POP_N, Math.max(0, t - pop));
const HEADING = () => JH_END().pose.yaw ?? 0;

// 飞行姿势（u = 0 刚弹出、1 落地）：落地是 6-1-2 第 1 帧的姿势
const lyFlight = (end: FigurePose): FigurePose[] => {
  const up: FigurePose = {
    ...end, yaw: HEADING(), twist: 0, headYaw: 0, squash: 1, ground: 0, pitch: -12, headPitch: 14,
    legR: -15, kneeR: 10, legL: 10, kneeL: 5, armR: 155, armRRoll: 15, elbowR: 15, armL: 145, armLRoll: 15, elbowL: 15,
  };
  const tuck: FigurePose = { ...up, pitch: -6, headPitch: -6, legR: 60, kneeR: 95, legL: 30, kneeL: 70, armR: 75, armL: 60, armRRoll: 25, armLRoll: 25, elbowR: 30, elbowL: 30 };
  const reach: FigurePose = { ...up, pitch: -14, headPitch: 0, legR: 55, kneeR: 35, legL: 28, kneeL: 30, armR: 40, armL: -10, elbowR: 40, elbowL: 50, ground: 0.5 };
  return [up, tuck, reach, end];
};
const jhFlight = (end: FigurePose): FigurePose[] => {
  const up: FigurePose = { ...end, pitch: -6, headPitch: 14, headYaw: 0, legR: -10, legL: 8, armR: 150, armL: 150, armRRoll: 10, armLRoll: 10 };
  const tuck: FigurePose = { ...up, pitch: -4, headPitch: 0, legR: 45, legL: -25, armR: 80, armL: 80, armRRoll: 25, armLRoll: 25 };
  const reach: FigurePose = { ...up, pitch: -8, headPitch: 0, legR: 30, legL: 15, armR: 45, armL: 45, armRRoll: 15, armLRoll: 15 };
  return [up, tuck, reach, end];
};
const FLIGHT_U = [0, 0.45, 0.8, 1];

const lyTF = (t: number): FigurePose => {
  const end = LY_END();
  // 落地后就蹲在那儿等九胡（6-1-2 开头他从这一蹲里起身）
  if (t >= LY_POP + POP_N) return { ...end };
  const pose = chain(lyFlight(end), FLIGHT_U, (t - LY_POP) / POP_N);
  return { ...pose, loc: popLoc(end.loc, LY_POP, t) };
};

// 机位 D1（f129–159）：直道上落脚点再往东 5.5 格，迎面朝西看传送门。
// 不从侧面拍：门四周是密林，直道只 8 格宽，侧面机位只能贴北沿，人一飞起来头就出画、九胡挡住李樱。
// D2 从身后接着看她落下，一迎面一背面，顺着直道这条轴，方向不乱
const camD1 = (t: number): Cam => {
  const ly = LY_END().loc;
  // 比地面高 2.9 格、微微往下看：看得见门的紫色顶面（再低的话门只剩花丛后面一条紫线）
  return { lens: 26, pos: [ly[0] + 5.5, portalCenter[1] + 0.3, ly[2] + 2.9], tgt: [portalCenter[0] + 0.8, portalCenter[1] - 0.3, ly[2] + 1.1] };
};

export const liying = (t: number) => {
  if (t < CUT) return { pose: lyIsland(t), visible: t < LY_IN };
  return { pose: lyTF(t), visible: t >= LY_POP };
};
const jhTail = (t: number) => 0.6 + t * 2.5;
export const jiuhu = (t: number) => {
  if (t < CUT) return { pose: jhIsland(t), tail: jhTail(t), bend: 0, gait: 0, run: 0, visible: t < JH_IN };
  const end = JH_END();
  // 落地这一帧就是 6-1-2 第 1 帧：姿势、弯腰、尾巴、步态全用它的
  if (t >= LAST) return { pose: { ...end.pose }, tail: end.tail, bend: end.bend, gait: end.gait, run: end.run, visible: true };
  const progress = (t - JH_POP) / POP_N;
  const pose = { ...chain(jhFlight(end.pose), FLIGHT_U, progress), loc: popLoc(end.pose.loc, JH_POP, t) };
  const bend = track([[0, 0], [0.45, 8], [0.8, 18], [1, end.bend]], progress);
  return { pose, tail: lerp(jhTail(t), end.tail, smoothstep01(progress)), bend, gait: end.gait, run: end.run, visible: t >= JH_POP };
};
type Cam = { lens: number; pos: number[]; tgt: number[] };
export const camera = (t: number): Cam => {
  if (t < CUT) return { lens: sample(CAM_A_LENS, t), pos: sampleV(CAM_A.pos, t), tgt: sampleV(CAM_A.tgt, t) };
  if (t < D2) return camD1(t);
  // D2：6-1-2 第 1 帧的机位，静止不动（6-1-2 开头也静止到起跑）
  return choreo612.camera(F612);
};

// 传送粒子（秒）：海岛上门激活后一直往门里落；二人碰到门时一团紫光收到身上；暮色这边门上先聚紫光，人弹出时裹一团紫光飞出去一小段就散。
// 寿命调短（life），一出现就是一团看得见的紫光；九胡身上的粒子压到她落地前散完，保证最后一帧同 6-1-2 第 1 帧
const burst = (at: V3, w: number, h: number, t0: number, t1: number, seed: number) =>
  ({ kind: 'body' as const, at, w, h, t0, t1, rate: 22, seed, life: 0.4, size: 1.25 });
export const islandEmitters = () => [
  { kind: 'portal' as const, at: [PX, PY, PORTAL_Z] as V3, w: 2, t0: STRIKE, t1: CUT, rate: 2, seed: 1 },
  burst(LY_LAND, 0.8, 1.9, LY_IN - 1 / 24, LY_IN + 2 / 24, 2),
  burst(JH_LAND, 0.7, 1.7, JH_IN - 1 / 24, JH_IN + 2 / 24, 3),
];
// 跟着人飞的一团：弹出前 1 格放到弹出后 3 格，每颗带出生那刻人的速度；寿命 0.22，最晚一颗赶在九胡落地最后一帧前散完
const POP_EMIT = [-1 / 24, 3 / 24];
const popEmitter = (end: number[], pop: number, width: number, height: number, seed: number) => {
  const t0 = pop + POP_EMIT[0];
  // 路径按游戏刻（1/20 秒）取点
  const ticks = Math.round((POP_EMIT[1] - POP_EMIT[0]) * 20);
  const at = (k: number) => popLoc(end, pop, t0 + k / 20);
  const path = Array.from({ length: ticks + 1 }, (_, k) => at(k));
  const vel = path.map((p, k) => at(k + 1).map((v, i) => v - p[i]));
  return { kind: 'body' as const, at: path[0], w: width, h: height, t0, t1: pop + POP_EMIT[1], rate: 12, seed, life: 0.22, size: 1.3, path, vel };
};
export const tfEmitters = () => {
  const ly = LY_END().loc;
  const jh = JH_END().pose.loc;
  return [
    // 切过来之前就开始往门里落，切过来时门上已经有一层紫光
    { kind: 'portal' as const, at: portalCenter, w: 2, t0: CUT - 8 / 24, t1: JH_POP - 8 / 24, rate: 2.5, seed: 4, life: 0.4 },
    popEmitter(ly, LY_POP, 0.8, 1.9, 5),
    popEmitter(jh, JH_POP, 0.7, 1.7, 6),
  ];
};

// 海岛那段的阴影范围（暮色森林那段的主光跟着镜头投影，不用指定）
export const islandShadowCenter: V3 = [PX + 1, PY, 0];
