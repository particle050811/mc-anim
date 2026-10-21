// 6-1-1 进入森林：全部时间轴与姿态，纯函数，输入帧号 f（从 1 起，= Remotion 帧 + 1）。
// 场景坐标 Z 朝上，1 = MC 一格。前半段在主世界传送门海岛（模型/场景/传送门海岛.tsx），后半段在暮色森林返回传送门（模型/场景/娜迦庭院.tsx）。
// 最后一帧和 6-1-2 第 1 帧完全一样（机位、落脚点、落地姿势直接调 6-1-2 的函数）。
// 人不能停在传送门方块上（用户 10-01：站在门上会被传回去），所以带着往前上方的冲劲从门里跃出。台词见 声音.tsx。
// 镜头：A（f1–128）海岛空中侧拍一镜到底；D1（f129–159）暮色直道上迎面看门；
// D2（f160–169）九胡飞到最高点时切到 6-1-2 第 1 帧机位（门西边高处往东看），最后一帧接 6-1-2。
import { type Key, type VKey, sample, sampleV, track } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { type FigurePose, standPose } from '../../../../world/角色/骨架.tsx';
import { PORTAL_ISLAND } from '../../../../world/地点/传送门海岛.tsx';
import { NAGA_COURTYARD } from '../../../../world/地点/娜迦庭院.tsx';
import * as choreo612 from '../6-1-2/编排.ts';

export const FPS = 24;
// 时间轴（帧）
const W0 = 12; // 开头先看着手里的钻石，这一帧开始往后引手
const REL = W0 + 12; // 钻石出手
const LAND = REL + 22; // 钻石落进水里
export const STRIKE = LAND + 18; // 闪电劈下，水面变成传送门
const BEAT = STRIKE + 20; // 闪电闪完、定了定神：李樱回头看一眼九胡，她点头
const LY_UP = BEAT + 15; // 李樱起跳
const LY_IN = LY_UP + 13; // 李樱碰到传送门，消失
const JH_UP = LY_UP + 11; // 九胡起跳（李樱还在半空，她就跟上了）
const JH_IN = JH_UP + 14; // 九胡碰到传送门，消失
export const CUT = JH_IN + 5; // 切到暮色森林
const LY_POP = CUT + 14; // 李樱从返回传送门里弹出来（之前 14 帧门上先聚紫光）
const JH_POP = LY_POP + 8; // 九胡隔 8 帧弹出来
const POP_N = 18; // 弹出来到落地 18 帧（0.75 秒）
export const D2 = JH_POP + 9; // 九胡飞到最高点，切到 6-1-2 的机位（第 1 场段界：6-1-2 从这一镜起，见 6-1/段界.ts）
const LAST = JH_POP + POP_N; // 九胡落地 = 最后一帧 = 6-1-2 第 1 帧
export const END = LAST + 1;
const F612 = 1; // 6-1-2 的第 1 帧

const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: number[], b: number[], k: number) => a.map((v, i) => lerp(v, b[i], k));

export const world = (f: number): 'island' | 'tf' => (f < CUT ? 'island' : 'tf');
export const portalActive = (f: number) => f >= STRIKE;

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

// MC 的跳跃：起跳 0.42 格/刻、重力 0.08 格/刻²，约 1.25 格高；这里按 24 帧换算成每帧的重力
const JUMP_G = 32 / (FPS * FPS);
const hop = (start: number[], end: number[], frames: number, t: number, gravity = JUMP_G): V3 => {
  const vz = (end[2] - start[2] + (gravity * frames * frames) / 2) / frames;
  const k = t / frames;
  return [lerp(start[0], end[0], k), lerp(start[1], end[1], k), start[2] + vz * t - (gravity * t * t) / 2];
};

const LY_ARM_R: Key[] = [[1, 28], [W0, 28], [W0 + 7, -55], [REL, 72], [REL + 4, 100], [REL + 16, 12], [END, 12]];
const LY_ELBOW_R: Key[] = [[1, 45], [W0, 40], [W0 + 7, 8], [REL, 12], [REL + 4, 18], [REL + 16, 8], [END, 8]];
const LY_ARM_L: Key[] = [[1, 0], [W0, 0], [W0 + 7, 18], [REL, -25], [REL + 4, -30], [REL + 16, -4], [END, -4]];
const LY_PITCH: Key[] = [[1, 0], [W0, 0], [W0 + 7, 5], [REL, -9], [REL + 4, -11], [REL + 18, -2], [END, -2]];
const LY_HEAD: Key[] = [
  [1, -18], [W0, -16], [W0 + 7, -8], [REL, 2], [REL + 11, 8], [LAND, -24], [STRIKE - 1, -24], [STRIKE + 3, -8], [STRIKE + 12, -14], [END, -14],
];
const LY_HEAD_YAW: Key[] = [[1, 0], [BEAT + 1, 0], [BEAT + 4, 55], [BEAT + 9, 55], [BEAT + 12, 0], [END, 0]];
const LY_LEG_R: Key[] = [[1, 0], [W0, 0], [W0 + 7, -14], [REL + 4, -16], [REL + 20, -4], [END, -4]];
const LY_LEG_L: Key[] = [[1, 0], [W0, 0], [W0 + 7, 14], [REL + 4, 18], [REL + 20, 5], [END, 5]];
const J0 = LY_UP - 6;
const LY_JUMP = {
  pitch: [[J0, -2], [LY_UP - 2, -12], [LY_UP, -8], [LY_UP + 5, -4], [LY_IN, -2]] as Key[],
  legR: [[J0, -4], [LY_UP - 2, 30], [LY_UP, -8], [LY_UP + 5, 30], [LY_IN, 24]] as Key[],
  kneeR: [[J0, 0], [LY_UP - 2, 52], [LY_UP, 4], [LY_UP + 5, 55], [LY_IN, 30]] as Key[],
  legL: [[J0, 5], [LY_UP - 2, 28], [LY_UP, -12], [LY_UP + 5, -8], [LY_IN, 10]] as Key[],
  kneeL: [[J0, 0], [LY_UP - 2, 50], [LY_UP, 6], [LY_UP + 5, 40], [LY_IN, 20]] as Key[],
  armR: [[J0, 12], [LY_UP - 2, -45], [LY_UP, 70], [LY_UP + 5, 40], [LY_IN, 25]] as Key[],
  armL: [[J0, -4], [LY_UP - 2, -45], [LY_UP, 70], [LY_UP + 5, 40], [LY_IN, 25]] as Key[],
};

// 九胡：站在旁边看；闪电劈下时吓一跳（往后一缩、两手抬到胸前），回过神来跟着跳
const JH_PITCH: Key[] = [[1, 0], [STRIKE, 0], [STRIKE + 2, 9], [STRIKE + 12, 2], [JH_UP - 6, 0], [JH_UP - 2, -14], [JH_UP, -6], [JH_UP + 5, -4], [JH_IN, -4]];
const JH_ARM: Key[] = [[1, 0], [STRIKE, 0], [STRIKE + 2, 70], [STRIKE + 12, 58], [STRIKE + 18, 6], [JH_UP - 2, -40], [JH_UP, 60], [JH_UP + 5, 50], [JH_IN, 40]];
const JH_ARM_ROLL: Key[] = [[1, 0], [STRIKE, 0], [STRIKE + 2, 30], [STRIKE + 12, 28], [STRIKE + 18, 0], [END, 0]];
// 李樱回头看她时，她看回去、点一下头
const JH_HEAD: Key[] = [
  [1, -14], [REL, -6], [LAND, -22], [STRIKE, -22], [STRIKE + 2, 6], [STRIKE + 12, -6], [STRIKE + 18, -14],
  [BEAT + 4, -6], [BEAT + 7, -26], [BEAT + 10, -4], [BEAT + 13, -14], [END, -14],
];
// 头先转过去看李樱扔（他在她右前方，往右转是负），再看水池；点头时又转向李樱
const JH_HEAD_YAW: Key[] = [[1, -30], [REL, -18], [LAND, 0], [BEAT + 1, 0], [BEAT + 4, -32], [BEAT + 12, -32], [BEAT + 15, 0], [END, 0]];
const JH_LEG_R: Key[] = [[1, 0], [JH_UP - 6, 0], [JH_UP - 2, 22], [JH_UP, -12], [JH_UP + 5, 34], [JH_IN, 30]];
const JH_LEG_L: Key[] = [[1, 0], [JH_UP - 6, 0], [JH_UP - 2, 20], [JH_UP, -16], [JH_UP + 5, -18], [JH_IN, -10]];

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

const lyIsland = (frame: number): FigurePose => {
  const j = frame >= J0;
  const air = frame >= LY_UP;
  const loc = air ? hop(LY0, LY_LAND, LY_IN - LY_UP, frame - LY_UP) : LY0;
  return {
    ...standPose(loc),
    yaw: LY_YAW0,
    pitch: j ? sample(LY_JUMP.pitch, frame) : sample(LY_PITCH, frame),
    headPitch: air ? -20 : sample(LY_HEAD, frame),
    headYaw: sample(LY_HEAD_YAW, frame),
    legR: j ? sample(LY_JUMP.legR, frame) : sample(LY_LEG_R, frame),
    legL: j ? sample(LY_JUMP.legL, frame) : sample(LY_LEG_L, frame),
    kneeR: j ? sample(LY_JUMP.kneeR, frame) : 0,
    kneeL: j ? sample(LY_JUMP.kneeL, frame) : 0,
    armR: j ? sample(LY_JUMP.armR, frame) : sample(LY_ARM_R, frame),
    armRRoll: 6,
    elbowR: j ? 10 : sample(LY_ELBOW_R, frame),
    armL: j ? sample(LY_JUMP.armL, frame) : sample(LY_ARM_L, frame),
    armLRoll: 6,
    elbowL: j ? 10 : 0,
    ground: air ? 0 : 1,
  };
};

const jhIsland = (frame: number): FigurePose => {
  const air = frame >= JH_UP;
  const loc = air ? hop(JH0, JH_LAND, JH_IN - JH_UP, frame - JH_UP) : JH0;
  const arm = sample(JH_ARM, frame);
  return {
    ...standPose(loc),
    yaw: JH_YAW0,
    pitch: sample(JH_PITCH, frame),
    headPitch: sample(JH_HEAD, frame),
    headYaw: sample(JH_HEAD_YAW, frame),
    legR: sample(JH_LEG_R, frame),
    legL: sample(JH_LEG_L, frame),
    armR: arm,
    armL: arm,
    armRRoll: sample(JH_ARM_ROLL, frame),
    armLRoll: sample(JH_ARM_ROLL, frame),
  };
};

// 钻石：出手前捏在右手里，出手后按物品重力（0.04 格/刻²）飞抛物线落进水池正中，沉下去缩小消失
const ITEM_G = 16 / (FPS * FPS);
const DROP: V3 = [PX + 0.1, PY + 0.1, PZ];
export const diamond = (frame: number): { loc: V3; spin: number; scale: number } | null => {
  if (frame >= LAND + 12) return null;
  const spin = 18 * Math.max(0, frame - REL);
  if (frame <= REL) {
    const hand = handR(lyIsland(frame));
    return { loc: [hand[0], hand[1], hand[2] - 0.05], spin: 0, scale: 1 };
  }
  const start = handR(lyIsland(REL));
  if (frame <= LAND) return { loc: hop([start[0], start[1], start[2] - 0.05], DROP, LAND - REL, frame - REL, ITEM_G), spin, scale: 1 };
  const t = frame - LAND;
  return { loc: [DROP[0], DROP[1], PZ - 0.04 * t - 0.15], spin: spin * 0.3, scale: 1 - ss(t / 12) };
};

export const splashSec = (f: number) => (f - LAND) / FPS;
export const waterGlow = (f: number) => (f >= STRIKE ? 0 : track([[LAND, 0], [LAND + 4, 0.9], [LAND + 12, 0.35], [STRIKE - 6, 0.45], [STRIKE - 1, 1]], f));

// 闪电：原版闪电劈下时亮暗闪几下；这里逐帧给亮度，0.4 秒
const FLASH = [1, 1, 0.35, 1, 0.75, 0.2, 0.6, 0.3, 0.12];
export const flash = (f: number) => FLASH[Math.round(f) - STRIKE] ?? 0;
export const BOLT_AT: V3 = [PX, PY, PZ];
// 闪电形状：机位 A 里只看得到最下面一段的下半截，挑一个在画面平面里往左上斜、不朝镜头也不朝人倒的，人在右边不被挡
export const BOLT_SEED = 23;

// 海岛一镜到底（f1–128）：机位在水池南边 9～10 格、高出草地 2.6～2.9 格，水池在左、二人在右。
// 不切远景（用户 10-01：海面闪电全景意义不明）。
const CAM_A = {
  pos: [
    [1, [PX + 2.3, PY - 9.6, grassZ + 2.8]],
    [LAND, [PX + 1.9, PY - 9.7, grassZ + 2.7]],
    [STRIKE - 2, [PX + 1.6, PY - 9.8, grassZ + 2.6]],
    [STRIKE + 18, [PX + 1.4, PY - 9.5, grassZ + 2.8]],
    [CUT - 1, [PX + 1.3, PY - 9.4, grassZ + 2.9]],
  ] as VKey[],
  tgt: [
    [1, [PX + 1.8, PY, grassZ + 1.45]],
    [LAND, [PX + 1.5, PY, grassZ + 1.5]],
    [STRIKE - 2, [PX + 1.2, PY, grassZ + 1.95]],
    [STRIKE + 18, [PX + 1.3, PY, grassZ + 1.6]],
    [CUT - 1, [PX + 1.3, PY, grassZ + 1.6]],
  ] as VKey[],
};
const CAM_A_LENS: Key[] = [[1, 40], [LAND, 40], [STRIKE - 2, 36], [CUT - 1, 37]];

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
    else if (Array.isArray(vb)) out[key] = lerp3((va as number[]) ?? vb, vb, k);
  }
  return out as FigurePose;
};
const chain = (poses: FigurePose[], us: number[], progress: number): FigurePose => {
  if (progress <= us[0]) return { ...poses[0] };
  for (let i = 0; i < us.length - 1; i++) if (progress <= us[i + 1]) return blend(poses[i], poses[i + 1], ss((progress - us[i]) / (us[i + 1] - us[i])));
  return { ...poses[poses.length - 1] };
};

// 弹出轨迹：起点脚底在门顶面下 1.2 格、正对落脚点，斜飞越过花圈；竖直方向用 MC 重力（同海岛跳）
const POP_DEPTH = 1.2;
const popLoc = (end: number[], pop: number, f: number): V3 => hop([portalCenter[0] + 0.25, end[1], portalCenter[2] - POP_DEPTH], end, POP_N, Math.max(0, f - pop));
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

const lyTF = (frame: number): FigurePose => {
  const end = LY_END();
  // 落地后就蹲在那儿等九胡（6-1-2 开头他从这一蹲里起身）
  if (frame >= LY_POP + POP_N) return { ...end };
  const pose = chain(lyFlight(end), FLIGHT_U, (frame - LY_POP) / POP_N);
  return { ...pose, loc: popLoc(end.loc, LY_POP, frame) };
};

// 机位 D1（f129–159）：直道上落脚点再往东 5.5 格，迎面朝西看传送门。
// 不从侧面拍：门四周是密林，直道只 8 格宽，侧面机位只能贴北沿，人一飞起来头就出画、九胡挡住李樱。
// D2 从身后接着看她落下，一迎面一背面，顺着直道这条轴，方向不乱
const camD1 = (frame: number): Cam => {
  const ly = LY_END().loc;
  // 比地面高 2.9 格、微微往下看：看得见门的紫色顶面（再低的话门只剩花丛后面一条紫线）
  return { lens: 26, pos: [ly[0] + 5.5, portalCenter[1] + 0.3, ly[2] + 2.9], tgt: [portalCenter[0] + 0.8, portalCenter[1] - 0.3, ly[2] + 1.1] };
};

export const liying = (frame: number) => {
  if (frame < CUT) return { pose: lyIsland(frame), visible: frame < LY_IN };
  return { pose: lyTF(frame), visible: frame >= LY_POP };
};
const jhTail = (f: number) => 0.6 + (f / FPS) * 2.5;
export const jiuhu = (frame: number) => {
  if (frame < CUT) return { pose: jhIsland(frame), tail: jhTail(frame), bend: 0, gait: 0, run: 0, visible: frame < JH_IN };
  const end = JH_END();
  // 落地这一帧就是 6-1-2 第 1 帧：姿势、弯腰、尾巴、步态全用它的
  if (frame >= LAST) return { pose: { ...end.pose }, tail: end.tail, bend: end.bend, gait: end.gait, run: end.run, visible: true };
  const progress = (frame - JH_POP) / POP_N;
  const pose = { ...chain(jhFlight(end.pose), FLIGHT_U, progress), loc: popLoc(end.pose.loc, JH_POP, frame) };
  const bend = track([[0, 0], [0.45, 8], [0.8, 18], [1, end.bend]], progress);
  return { pose, tail: lerp(jhTail(frame), end.tail, ss(progress)), bend, gait: end.gait, run: end.run, visible: frame >= JH_POP };
};

type Cam = { lens: number; pos: number[]; tgt: number[] };
export const camera = (frame: number): Cam => {
  if (frame < CUT) return { lens: sample(CAM_A_LENS, frame), pos: sampleV(CAM_A.pos, frame), tgt: sampleV(CAM_A.tgt, frame) };
  if (frame < D2) return camD1(frame);
  // D2：6-1-2 第 1 帧的机位，静止不动（6-1-2 开头也静止到起跑）
  return choreo612.camera(F612);
};

// 传送粒子（秒）：海岛上门激活后一直往门里落；二人碰到门时一团紫光收到身上；暮色这边门上先聚紫光，人弹出时裹一团紫光飞出去一小段就散。
// 寿命调短（life），一出现就是一团看得见的紫光；九胡身上的粒子压到她落地前散完，保证最后一帧同 6-1-2 第 1 帧
const sec = (f: number) => f / FPS;
export const particleSec = sec;
const burst = (at: V3, w: number, h: number, f0: number, f1: number, seed: number) =>
  ({ kind: 'body' as const, at, w, h, t0: sec(f0), t1: sec(f1), rate: 22, seed, life: 0.4, size: 1.25 });
export const islandEmitters = () => [
  { kind: 'portal' as const, at: [PX, PY, PORTAL_Z] as V3, w: 2, t0: sec(STRIKE), t1: sec(CUT), rate: 2, seed: 1 },
  burst(LY_LAND, 0.8, 1.9, LY_IN - 1, LY_IN + 2, 2),
  burst(JH_LAND, 0.7, 1.7, JH_IN - 1, JH_IN + 2, 3),
];
// 跟着人飞的一团：弹出前 1 帧放到弹出后 3 帧，每颗带出生那刻人的速度；寿命 0.22，最晚一颗赶在九胡落地最后一帧前散完
const POP_EMIT = [-1, 3];
const popEmitter = (end: number[], pop: number, width: number, height: number, seed: number) => {
  const f0 = pop + POP_EMIT[0];
  const ticks = Math.round(((POP_EMIT[1] - POP_EMIT[0]) / FPS) * 20);
  const at = (k: number) => popLoc(end, pop, f0 + (k * FPS) / 20);
  const path = Array.from({ length: ticks + 1 }, (_, k) => at(k));
  const vel = path.map((p, k) => at(k + 1).map((v, i) => v - p[i]));
  return { kind: 'body' as const, at: path[0], w: width, h: height, t0: sec(f0), t1: sec(pop + POP_EMIT[1]), rate: 12, seed, life: 0.22, size: 1.3, path, vel };
};
export const tfEmitters = () => {
  const ly = LY_END().loc;
  const jh = JH_END().pose.loc;
  return [
    // 切过来之前就开始往门里落，切过来时门上已经有一层紫光
    { kind: 'portal' as const, at: portalCenter, w: 2, t0: sec(CUT - 8), t1: sec(JH_POP - 8), rate: 2.5, seed: 4, life: 0.4 },
    popEmitter(ly, LY_POP, 0.8, 1.9, 5),
    popEmitter(jh, JH_POP, 0.7, 1.7, 6),
  ];
};

// 声音（声音.tsx）要用的时刻（编排帧，= Remotion 帧 + 1）和落点：海岛那半是海岛本地坐标，暮色那半是庭院本地坐标
export const soundCues = {
  diamondSplash: LAND,
  liYingJump: LY_UP,
  liyingEnterPortal: LY_IN,
  jiuhuJump: JH_UP,
  jiuhuEnterPortal: JH_IN,
  liYingLanding: LY_POP + POP_N,
  jiuHuLand: LAST,
  diamondDropPoint: DROP,
  liyingJumpPoint: LY0,
  jiuhuJumpPoint: JH0,
  liyingPortalPoint: LY_LAND,
  jiuhuPortalPoint: JH_LAND,
};

// 海岛那段的阴影范围（暮色森林那段的主光跟着镜头投影，不用指定）
export const islandShadowCenter: V3 = [PX + 1, PY, 0];
