// 李樱：骑乘 → 站起拔锤 → 跃出下冲 → 举锤打击 → 砸穿竖井落进古城、翻身站起。模块加载时把起跳点、撞击深度、瞄准填给 时间线.ts。
// 李樱的身体：骨架.tsx 的 `Figure`（李樱.tsx），以髋关节为基准点：在扫帚上时髋在扫帚本地坐标里，跃出后按 时间线.ts 的物理轨迹走，
// 身子绕髋的左右轴往前翻 φ 度（155° = 头朝下、往前斜 25°）。
// 重锤顺着前臂往外伸（锤的方向角 = 臂角 + 肘 + 180，约定见 骨架.tsx 的 `bladeInHand`）：臂角 155、肘 0 时锤竖直朝下。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { broomMatrix, liYingHand, liYingRidePose, RIDE } from '@库/角色/骑扫帚.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { BROOM } from '@库/物品/扫帚.tsx';
import { MACE } from '@库/物品/重锤.tsx';
import { ROLLER } from '@库/物品/动力压路机.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import { FPS, 刻, 撞击时刻, 撞击段内帧, 段表, 李樱下落, 设置撞击, 设置瞄准, 设置起跳, 起点, 鼓风机 } from '../时间线.ts';
import { sample, type Key } from '@engine/anim/anim.ts';
import { lineFrameCount } from '../../../../配音/台词轨.tsx';
import lipTable from 'asset:数据/配音/口型';
import { landingPose, flipAngle as 落地翻角, flipHipHeight, touchdownFrame } from '../../6-3-6/落地.ts';
import { releasePose } from '../../6-3-3/下落攻击.ts';
import { ss, lerp, lerp3, add, D2R } from './工具.ts';
import { groundZ, caveCeilingZ, ancientCityFloorZ } from './地面.ts';
import { broomState, broomMatrixAt } from './扫帚.ts';

const PX = 1.875 / 32; // 李樱：一像素多少格

// ---------- 李樱的姿态 ----------
// 骨架的髋高（像素）：照 骨架.tsx 的 Figure 算（哪条腿伸得更低就以它贴地，ground 在 0～1 之间插值）
const hipPx = (pose: FigurePose) => {
  const reach = (a: number, knee: number) => 6 * Math.cos((a + pose.pitch) * D2R) + 6 * Math.cos((a + pose.pitch - knee) * D2R);
  const grounded = Math.max(3, reach(pose.legR, pose.kneeR ?? 0), reach(pose.legL, pose.kneeL ?? 0));
  return (12 + (pose.ground ?? 1) * (grounded - 12)) * pose.squash;
};
type PosePart = Partial<FigurePose> & { 锤?: number };
const RIDE0 = (() => {
  const rider = 起点.riders.李樱 as { lean?: number; headRaise?: number };
  const pose = liYingRidePose(rider.lean ?? 18);
  pose.headPitch += rider.headRaise ?? 0;
  return pose;
})();
// 站在杆上：脚踩在前座的杆顶，膝盖弯着稳住，两手张开保持平衡，低头看城
const STAND: FigurePose = {
  loc: [0, RIDE.front, BROOM.stickTop - BROOM.stickZ + 0.02],
  pitch: -6, squash: 1, headPitch: -28, headYaw: 0,
  legR: 26, legL: 26, kneeR: 44, kneeL: 44, legRRoll: -8, legLRoll: -8,
  armR: 28, armL: 28, armRRoll: -24, armLRoll: -24, elbowR: 25, elbowL: 25, ground: 1,
};
// 关键姿势（物理时间 → 姿势的一部分）；锤 = 锤是否在手上（0～1，按物品切换：够到肩后那一刻出现）
const STAND_T = 刻.standUp + 0.48; // 站直的时刻
const KEYS: [number, PosePart][] = [
  [0, {}],
  [刻.standUp, {}],
  [STAND_T, { ...STAND }],
  // 右手往右肩后面够（上臂往上往后、前臂往下折）
  [刻.reachForMace, { armR: 28, elbowR: 25, armRRoll: -24 }],
  [刻.maceAppears, { armR: 205, elbowR: 125, armRRoll: -8, headYaw: -18, 锤: 1 }],
  // 抡到身前：两手在胸前握住锤柄，锤头朝前上方
  [刻.maceAppears + 0.18, { armR: 115, elbowR: 30, armRRoll: 18, armL: 95, elbowL: 40, armLRoll: 28, headYaw: 0 }],
  [刻.swingOut, { armR: 120, elbowR: 35, armRRoll: 22, armL: 120, elbowL: 35, armLRoll: 22 }],
  // 下蹲蓄力：锤举过头顶
  [刻.下蹲 + 0.26, { ground: 1, pitch: -26, legR: 72, legL: 72, kneeR: 118, kneeL: 118, armR: 172, elbowR: 45, armL: 172, elbowL: 45, armRRoll: 22, armLRoll: 22, headPitch: -30 }],
  // 一蹬：腿蹬直、离开杆（ground 1 → 0），身子往前翻
  [刻.leap + 0.1, { pitch: -10, legR: 8, legL: 8, kneeR: 6, kneeL: 6, ground: 0, armR: 175, elbowR: 15, armL: 175, elbowL: 15, headPitch: 0 }],
  // 俯冲：双臂伸过头顶（顺着身子往地面方向），锤头领在最前面；腿并拢伸直，抬头（对倒过来的人是往地面看）
  [刻.leap + 0.6, { pitch: 0, legR: 2, legL: 2, kneeR: 12, kneeL: 12, legRRoll: 2, legLRoll: 2, armR: 168, elbowR: 6, armL: 168, elbowL: 6, armRRoll: 18, armLRoll: 18, headPitch: 32, ground: 0 }],
];
const legacyPose = (t: number) => blend(KEYS, t, STAND); // 原来的姿势（6-3-3/下落攻击.ts 拿它接前后）
const FIELDS = ['pitch', 'headPitch', 'headYaw', 'legR', 'legL', 'kneeR', 'kneeL', 'legRRoll', 'legLRoll', 'armR', 'armL', 'armRRoll', 'armLRoll', 'elbowR', 'elbowL', 'ground', 'twist'] as const;
// 举锤、打击（相对撞击时刻的物理秒 tr）：翻成头朝下一收住就把锤从头顶前方往回抡、抡过头顶拉到脑后（肘弯、锤垂在背上），
// 边冲边喊「ロードローラーだッ！」一路往后拉满，「ッ」出手抡过头顶砸下（臂 155、肘 0 时锤竖直朝下）。用户 10-19 定：举锤提前开始、原速，台词装得下。
// 关键时刻照这句台词的字（../../../配音/口型.json；台词文件末尾落在 6-3-5 末帧，见 `shoutLine`）：蓄力的气声里拉到脑后，「ロー」起慢慢再往后拉，「ッ」出手；
// 每个字起音时锤和身子往后顿一下（`syllablePulse`），一直在动、不定住。打击那一刻（tr = 0）的姿势是 `STRIKE_HIT`，撞击深度和落点都按它算，别改
const ROAD_ROLLER = '6-3-5-李樱-RoadRoller';
export const shoutLine = { id: ROAD_ROLLER, 帧: 段表['6-3-5'].止 - lineFrameCount(ROAD_ROLLER) };
const shoutStartTr = -(撞击段内帧 + lineFrameCount(ROAD_ROLLER)) / FPS; // 6-3-5 末帧 = 6-3-6 首帧，原速
const syllables = (lipTable as unknown as Record<string, { 字: [string, number, number][] }>)[ROAD_ROLLER].字;
const syllableOnsets = syllables.filter(([ch]) => ch !== 'ッ').map(([, start]) => shoutStartTr + start);
const releaseTr = shoutStartTr + syllables[syllables.length - 1][1]; // 「ッ」：出手
const firstWordTr = syllableOnsets[0];
const STRIKE_HIT: PosePart = { armR: 155, elbowR: 0, armL: 155, elbowL: 0, kneeR: 20, kneeL: 20, pitch: -6, headPitch: 30 };
type StrikeField = 'arm' | 'elbow' | 'knee' | 'pitch' | 'headPitch';
let STRIKE_TRACKS: { start: number; keys: Record<StrikeField, Key[]> } | null = null;
const strikeTracks = () => {
  if (STRIKE_TRACKS) return STRIKE_TRACKS;
  if (!Number.isFinite(撞击时刻())) throw new Error('编排/李樱.ts：撞击时刻还没算出来');
  const start = 刻.开抡 - 撞击时刻();
  const haul = start + 0.33;
  const overHead = start + 0.65;
  const daTr = syllableOnsets[syllableOnsets.length - 1];
  // 腰比手臂早一点到（身子先拧过去、手臂被带着走）
  const keys: Record<StrikeField, Key[]> = {
    arm: [[start, 168], [haul, 186], [overHead, 214], [firstWordTr, 234], [daTr, 244], [releaseTr, 249], [0, 155], [0.15, 152]],
    elbow: [[start, 6], [overHead, 38], [firstWordTr, 54], [daTr, 60], [releaseTr, 64], [0, 0], [0.15, 4]],
    knee: [[start, 12], [overHead, 28], [firstWordTr, 44], [daTr, 52], [releaseTr, 56], [0, 20], [0.15, 15]],
    pitch: [[start, 0], [overHead - 0.05, 8], [firstWordTr - 0.05, 13], [daTr - 0.05, 18], [releaseTr - 0.04, 22], [0, -6], [0.15, -4]],
    headPitch: [[start, 32], [overHead, 36], [firstWordTr, 40], [releaseTr, 42], [0, 30], [0.15, 30]],
  };
  STRIKE_TRACKS = { start, keys };
  return STRIKE_TRACKS;
};
// 每个字起音往后顿一下：0.07 秒到顶、之后指数回落；「ッ」出手前收掉，打击那一刻不带它
const syllablePulse = (tr: number) => {
  const bump = (x: number) => (x <= 0 ? 0 : (x / 0.07) * Math.exp(1 - x / 0.07));
  return syllableOnsets.reduce((sum, onset) => sum + bump(tr - onset), 0) * (1 - ss((tr - (releaseTr - 0.1)) / 0.1));
};
const strikeAt = (tr: number, base: FigurePose): FigurePose => {
  const { keys } = strikeTracks();
  const pulse = syllablePulse(tr);
  const arm = sample(keys.arm, tr) + 3 * pulse;
  const elbow = sample(keys.elbow, tr) + 2 * pulse;
  const knee = sample(keys.knee, tr);
  return { ...base, armR: arm, armL: arm, elbowR: elbow, elbowL: elbow, kneeR: knee, kneeL: knee, pitch: sample(keys.pitch, tr) + 1.5 * pulse, headPitch: sample(keys.headPitch, tr) + 3 * pulse };
};
const blend = (keys: [number, PosePart][], t: number, base: FigurePose): FigurePose => {
  // 每个字段单独找前后两个写了它的关键姿势插值（没写的字段沿用上一个），平滑插值
  const out: FigurePose = { ...base, loc: [...base.loc] };
  for (const field of FIELDS) {
    const pts = keys.filter(([, k]) => k[field] !== undefined).map(([t0, k]) => [t0, k[field] as number] as [number, number]);
    if (!pts.length) continue;
    if (t <= pts[0][0]) {
      (out as Record<string, unknown>)[field] = pts[0][1];
      continue;
    }
    let value = pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++)
      if (t <= pts[i][0]) {
        value = lerp(pts[i - 1][1], pts[i][1], ss((t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
        break;
      }
    (out as Record<string, unknown>)[field] = value;
  }
  return out;
};
// 前翻角 φ（度）：跃出时 0，到 刻.翻完（0.42 秒）翻到 155（头朝下、往前斜 25°）；砸穿古城地面以后翻身落地（翻到 360 = 站直）
const PHI_DIVE = 155;
const landSec = () => liYingShaft().落地;
const phi = (physSec: number) => {
  if (physSec < 刻.leap) return 0;
  const imp = 撞击时刻();
  if (!(physSec > imp) || !Number.isFinite(landSec()) || physSec <= landSec()) return PHI_DIVE * ss((physSec - 刻.leap) / (刻.flipDone - 刻.leap));
  // 落地重做见 ../6-3-6/落地.ts：打击停顿，再借锤往前翻
  return 落地翻角(physSec - landSec());
};

export type LiYingState = {
  pose: FigurePose;
  // 场景里的变换：Figure（loc 已经在 pose 里）外面套这个矩阵
  matrix: THREE.Matrix4;
  maceHeld: number; // 锤在手上（0～1）
  maceAngle: number; // 锤的方向角（bladeInHand 的 angle）
  ghost: number; // 压路机虚影的不透明度
  hip: V3; // 髋关节在场景里的位置
};
// 骑乘姿势（跨坐 → 站起）在扫帚本地坐标里
const onBroomPose = (physSec: number): FigurePose => {
  const k = ss((physSec - 刻.standUp) / (STAND_T - 刻.standUp));
  const base: FigurePose = {
    ...RIDE0,
    loc: lerp3(RIDE0.loc, STAND.loc, k),
    ground: k,
  };
  for (const field of FIELDS) {
    const rideVal = (RIDE0 as unknown as Record<string, number | undefined>)[field] ?? 0;
    const standVal = (STAND as unknown as Record<string, number | undefined>)[field] ?? 0;
    (base as Record<string, unknown>)[field] = lerp(rideVal, standVal, k);
  }
  // 刻.抡出 以后的蓄力、蹬出、空中抡锤见 6-3-3/下落攻击.ts；跃出那一刻的髋高和段末姿势和旧版一致
  return physSec < STAND_T ? base : releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose);
};
// 跃出那一刻扫帚的转动（之后李樱的身子以它为基准往前翻）
const Q_LEAP = new THREE.Quaternion().setFromRotationMatrix(broomMatrix([0, 0, 0], broomState(刻.leap).yaw, broomState(刻.leap).pitch, broomState(刻.leap).roll));
// 髋在扫帚本地坐标里的位置
const hipLocal = (p: FigurePose): V3 => [p.loc[0], p.loc[1], p.loc[2] + hipPx(p) * PX];
const freeMatrix = (hipW: V3, φ: number, pose: FigurePose) => {
  const quat = Q_LEAP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -φ * D2R));
  // Figure 的 loc 填 0：髋在 (0, 0, hip)，所以先往下挪 hip 再转、再挪到 hipW
  return new THREE.Matrix4().compose(new THREE.Vector3(...hipW), quat, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -hipPx(pose) * PX));
};

// 打击姿势时，滚筒最低点在髋下方多深（场景里的竖直距离），撞击时刻按它算
const strikePose = (): FigurePose => ({ ...blend(KEYS, 99, STAND), ...STRIKE_HIT, loc: [0, 0, 0], ground: 0 });
const maceHeadAt = (pose: FigurePose, matrix: THREE.Matrix4, maceAngle: number): V3 => {
  // 握持点（Figure 外层坐标，loc = 0、ground = 0）+ 锤的方向 × 锤头距离
  const grip = liYingHand(pose, 'R');
  const angleRad = maceAngle * D2R;
  const dirBody = new THREE.Vector3(0, -Math.sin(angleRad), Math.cos(angleRad)); // 身体坐标（去掉转身、前倾）
  dirBody.applyEuler(new THREE.Euler(pose.pitch * D2R, 0, 0)).applyEuler(new THREE.Euler(0, 0, (pose.yaw ?? 0) * D2R));
  const head = new THREE.Vector3(...grip).addScaledVector(dirBody, MACE.head * 16 * PX).applyMatrix4(matrix);
  return [head.x, head.y, head.z];
};
export const maceAngleOf = (p: FigurePose) => p.armR + (p.elbowR ?? 0) + 180;
export const rollerGhostScale = 1.25; // 压路机虚影在锤头上的缩放（滚筒直径约 1.8 米、外壳 1.2 米见方，比李樱略小，五格来宽的竖井装得下）
export const rollerRadius = ROLLER.radius * rollerGhostScale * 16 * PX;

// 起跳点（髋），填给 时间线.ts 积分
export const LY_LEAP_HIP = (() => {
  const pose = onBroomPose(刻.leap);
  const hip = new THREE.Vector3(...hipLocal(pose)).applyMatrix4(broomMatrixAt(刻.leap));
  return [hip.x, hip.y, hip.z] as V3;
})();
设置起跳(LY_LEAP_HIP);
// 头朝下俯冲（翻到 155°）时的变换、滚筒最低点比髋低多少：6-3-2 思索场景板上摆同一个李樱也用（6-3-2/编排.ts）
export const diveMatrix = (hip: V3, pose: FigurePose) => freeMatrix(hip, PHI_DIVE, pose);
export const ghostDepth = (pose: FigurePose) => -maceHeadAt(pose, diveMatrix([0, 0, 0], pose), maceAngleOf(pose))[2] + rollerRadius;
// 打击深：打击姿势下滚筒最低点比髋低多少
export const strikeDepth = ghostDepth(strikePose());
设置撞击(groundZ, strikeDepth);
// 落点：砸在城门进来的南北大街（x ±12）和 y 97～103 横街的路口正中（用户 10-05 定竖井相对城的位置不变；边城/布局.ts 也照这个路口搭，路口四角街区限高 15 米，6-3-5、6-3-6 镜头从高处斜看）。
// 推力目标速度要带一点水平分量（4.6 米/秒，偏离竖直 0.7°）才对得准，竖直朝下的话水平初速很快被拉回 0，落点偏到路口北 18 米。
// 对准路口正中那格的格心 (-0.5, 100.5)：坑和竖井网格摆在撞击点那格的格心（井心），锤正好落在井轴上
const impactMaceHead = (): V3 => {
  const fallState = 李樱下落(撞击时刻());
  const pose = strikePose();
  return maceHeadAt(pose, freeMatrix(fallState.p, PHI_DIVE, pose), maceAngleOf(pose));
};
export const landingSpot = add(borderTownPos, [-0.5, 100.5, 0]);
for (let k = 0; k < 2; k++) {
  const head = impactMaceHead();
  const pushDuration = 撞击时刻() - 鼓风机.开 - 鼓风机.timeConst; // 水平速度按时间常数贴近目标，起头少走 时间常数 那么长
  设置瞄准([鼓风机.横向[0] + (landingSpot[0] - head[0]) / pushDuration, 鼓风机.横向[1] + (landingSpot[1] - head[1]) / pushDuration]);
  设置撞击(groundZ, strikeDepth);
}

// ---------- 竖井：砸穿以后的路线 ----------
// 撞击点（竖井中心）= 撞击时刻锤头的水平位置。砸进地里后匀减速：从 `shaftEntrySpeed` 碾下去，打穿洞顶时 55 米/秒；进了古城自由落体。
// 入井速度不用撞地时的 360 米/秒（竖井一闪而过）：撞击那一下把多余动能砸进坑里炸出金光。
// 岩层 141 米，照 88 碾要 1.97 秒看久了拖，取 140（1.45 秒）还看得清一路碾碎；洞顶出来的 55 米/秒不变。6-3-6 撞击以前一帧不动（时间线.ts 的 `段表`）
const shaftEntrySpeed = 140;
let SHAFT: { center: V3; hipXY: [number, number]; impactZ: number; entrySpeed: number; impactSpeed: number; breachZ: number; breachDelay: number; a: number; 落地: number; landZ: number } | null = null;
export const liYingShaft = () => {
  if (SHAFT) return SHAFT;
  const imp = 撞击时刻();
  const fallState = 李樱下落(imp);
  const pose = strikePose();
  const matrix = freeMatrix(fallState.p, PHI_DIVE, pose);
  const head = maceHeadAt(pose, matrix, maceAngleOf(pose));
  const entrySpeed = shaftEntrySpeed;
  const impactZ = fallState.p[2];
  const breachZ = caveCeilingZ + strikeDepth; // 滚筒最低点过洞顶时髋的高度
  const shaftDepth = impactZ - breachZ;
  const breachSpeed = 55;
  const decel = (entrySpeed * entrySpeed - breachSpeed * breachSpeed) / (2 * shaftDepth);
  const breachDelay = (entrySpeed - breachSpeed) / decel;
  // 古城里自由落体：滚筒最低点碰到古城地面
  const drop = caveCeilingZ - ancientCityFloorZ;
  const dropSec = (-breachSpeed + Math.sqrt(breachSpeed * breachSpeed + 2 * 9.81 * drop)) / 9.81;
  SHAFT = { center: [head[0], head[1], groundZ], hipXY: [fallState.p[0], fallState.p[1]], impactZ, entrySpeed, impactSpeed: -fallState.v[2], breachZ, breachDelay, a: decel, 落地: imp + breachDelay + dropSec, landZ: ancientCityFloorZ + strikeDepth };
  return SHAFT;
};
// 落地那一刻的打击姿势（落地动作从它接出去）
const strikePoseAt = (physSec: number): FigurePose => {
  const tr = physSec - 撞击时刻();
  return { ...strikeAt(tr, releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose)), loc: [0, 0, 0] };
};
export const digHipZ = (physSec: number) => {
  const shaft = liYingShaft();
  const t = physSec - 撞击时刻();
  if (t <= shaft.breachDelay) return shaft.impactZ - shaft.entrySpeed * t + 0.5 * shaft.a * t * t;
  const sinceBreach = Math.min(t, shaft.落地 - 撞击时刻()) - shaft.breachDelay;
  const z = shaft.breachZ - 55 * sinceBreach - 0.5 * 9.81 * sinceBreach * sinceBreach;
  if (physSec < shaft.落地) return z;
  // 落地以后（落地.ts）：翻身几帧从打击姿势的髋高落到着地，之后髋高按骨架贴地算，脚不穿地也不悬空
  const sinceLand = physSec - shaft.落地;
  const groundedHipZ = (q: number) => ancientCityFloorZ + hipPx(landingPose(q, strikePoseAt(shaft.落地))) * PX;
  if (sinceLand * 24 < touchdownFrame) return flipHipHeight(sinceLand, shaft.landZ, groundedHipZ(touchdownFrame / 24));
  return groundedHipZ(sinceLand);
};

// 压路机虚影浮现（开抡以后的物理秒）：锤抡过头顶时浮现，喊出声以前全显（用户 10-19：开抡就亮起来）
const ghostFadeIn = [0.15, 0.85] as const;
export const liYing = (physSec: number): LiYingState => {
  const imp = 撞击时刻();
  if (physSec < 刻.leap) {
    const pose = onBroomPose(physSec);
    const matrix = broomMatrixAt(physSec);
    const hip = new THREE.Vector3(...hipLocal(pose)).applyMatrix4(matrix);
    const maceHeld = physSec >= 刻.maceAppears ? 1 : 0;
    return { pose, matrix, maceHeld: maceHeld, maceAngle: maceAngleOf(pose), ghost: 0, hip: [hip.x, hip.y, hip.z] };
  }
  // 空中：髋按物理轨迹走；6-3-5 起换成举锤、打击的姿势
  let pose = releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose);
  const tr = physSec - imp;
  if (tr > strikeTracks().start) pose = strikeAt(tr, pose);
  pose = { ...pose, loc: [0, 0, 0] };
  let hip: V3;
  if (!(physSec > imp)) hip = 李樱下落(physSec).p;
  else {
    const shaft = liYingShaft();
    hip = [shaft.hipXY[0], shaft.hipXY[1], digHipZ(physSec)];
    if (physSec > shaft.落地) {
      // 落地：打击停顿 → 翻身收腿 → 半蹲缓冲 → 起身冲过一点 → 站定扫一眼，见 ../6-3-6/落地.ts
      pose = { ...landingPose(physSec - shaft.落地, strikePoseAt(shaft.落地)), loc: [0, 0, 0] };
    }
  }
  const matrix = freeMatrix(hip, phi(physSec), pose);
  // 虚影：开抡后浮现（见 `ghostFadeIn`），一路砸穿，进了古城以后散掉
  const shaft = Number.isFinite(imp) ? liYingShaft() : null;
  const sinceSwing = tr - strikeTracks().start;
  const fadeIn = ss((sinceSwing - ghostFadeIn[0]) / (ghostFadeIn[1] - ghostFadeIn[0]));
  const fadeOut = shaft ? 1 - ss((physSec - (imp + shaft.breachDelay)) / 0.25) : 1;
  return { pose, matrix, maceHeld: 1, maceAngle: maceAngleOf(pose), ghost: 0.62 * fadeIn * fadeOut, hip: hip };
};
export const maceHeadPos = (s: LiYingState) => maceHeadAt(s.pose, s.matrix, s.maceAngle);
