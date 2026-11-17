// 李樱：骑乘 → 站起拔锤 → 跃出下冲 → 举锤打击 → 砸穿竖井落进古城、翻身站起。姿态和起跳点、撞击深度、落点在 李樱姿势.ts（时间线.ts 拿它们求下落）。
// 李樱的身体：骨架.tsx 的 `Figure`（李樱.tsx），以髋关节为基准点：在扫帚上时髋在扫帚本地坐标里，跃出后按 时间线.ts 的物理轨迹走，
// 身子绕髋的左右轴往前翻 φ 度（155° = 头朝下、往前斜 25°）。
// 重锤顺着前臂往外伸（锤的方向角 = 臂角 + 肘 + 180，约定见 骨架.tsx 的 `bladeInHand`）：臂角 155、肘 0 时锤竖直朝下。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { tick, impactTime, impactSegSec, segTable, liYingFall } from '../时间线.ts';
import { sample, type Key } from '@engine/anim/anim.ts';
import { lineTable } from '../../../../配音/台词轨.tsx';
import lipTable from 'asset:数据/配音/口型';
import { landingPose, flipAngle as landingFlipAngle, flipHipHeight, touchdownSec } from '../../6-3-6/落地.ts';
import { releasePose } from '../../6-3-3/下落攻击.ts';
import { groundZ, caveCeilingZ, ancientCityFloorZ } from './地面.ts';
import { broomMatrixAt } from './扫帚.ts';
import { smoothstep01 } from '@engine/core/数学.ts';
import { PX, hipPx, STAND, KEYS, legacyPose, blend, PHI_DIVE, onBroomPose, hipLocal, freeMatrix, strikePose, maceHeadAt, maceAngleOf, strikeDepth } from './李樱姿势.ts';

export { LY_LEAP_HIP, strikeDepth, landingSpot, diveMatrix, ghostDepth, maceAngleOf, rollerGhostScale, rollerRadius } from './李樱姿势.ts';

// 举锤、打击（相对撞击时刻的物理秒 tr）：翻成头朝下一收住就把锤从头顶前方往回抡、抡过头顶拉到脑后（肘弯、锤垂在背上），
// 边冲边喊「ロードローラーだッ！」一路往后拉满，「ッ」出手抡过头顶砸下（臂 155、肘 0 时锤竖直朝下）。用户 10-19 定：举锤提前开始、原速，台词装得下。
// 关键时刻照这句台词的字（../../../配音/口型.json；台词文件末尾落在 6-3-5 末帧，见 `shoutLine`）：蓄力的气声里拉到脑后，「ロー」起慢慢再往后拉，「ッ」出手；
// 每个字起音时锤和身子往后顿一下（`syllablePulse`），一直在动、不定住。打击那一刻（tr = 0）的姿势是 `STRIKE_HIT`，撞击深度和落点都按它算，别改
const ROAD_ROLLER = '6-3-5-李樱-RoadRoller';
// 开口比 6-3-5 止早一个有声长：说完正落在 6-3-5 末帧（原来有声长往上取整到 1/24 秒，用户 11-16 定不留 1/24 秒的格；6-举锤砸穿 段.ts 的台词 cue 按它排）。帧 = 开口的全局秒（口型按 1 帧/秒读）
const shoutLeadSec = lineTable[ROAD_ROLLER].有声长;
export const shoutLine = { id: ROAD_ROLLER, frame: segTable['6-3-5'].end - shoutLeadSec };
const shoutStartTr = -(impactSegSec + shoutLeadSec); // 6-3-5 止 = 6-3-6 起，原速
const syllables = (lipTable as unknown as Record<string, { 字: [string, number, number][] }>)[ROAD_ROLLER].字;
const syllableOnsets = syllables.filter(([ch]) => ch !== 'ッ').map(([, start]) => shoutStartTr + start);
const releaseTr = shoutStartTr + syllables[syllables.length - 1][1]; // 「ッ」：出手
const firstWordTr = syllableOnsets[0];
type StrikeField = 'arm' | 'elbow' | 'knee' | 'pitch' | 'headPitch';
let STRIKE_TRACKS: { start: number; keys: Record<StrikeField, Key[]> } | null = null;
const strikeTracks = () => {
  if (STRIKE_TRACKS) return STRIKE_TRACKS;
  const start = tick.swingBackStart - impactTime();
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
  return syllableOnsets.reduce((sum, onset) => sum + bump(tr - onset), 0) * (1 - smoothstep01((tr - (releaseTr - 0.1)) / 0.1));
};
const strikeAt = (tr: number, base: FigurePose): FigurePose => {
  const { keys } = strikeTracks();
  const pulse = syllablePulse(tr);
  const arm = sample(keys.arm, tr) + 3 * pulse;
  const elbow = sample(keys.elbow, tr) + 2 * pulse;
  const knee = sample(keys.knee, tr);
  return { ...base, armR: arm, armL: arm, elbowR: elbow, elbowL: elbow, kneeR: knee, kneeL: knee, pitch: sample(keys.pitch, tr) + 1.5 * pulse, headPitch: sample(keys.headPitch, tr) + 3 * pulse };
};
// 前翻角 φ（度）：跃出时 0，到 刻.翻完（0.42 秒）翻到 155（头朝下、往前斜 25°）；砸穿古城地面以后翻身落地（翻到 360 = 站直）
const landSec = () => liYingShaft().landSec;
const phi = (physSec: number) => {
  if (physSec < tick.leap) return 0;
  const imp = impactTime();
  if (!(physSec > imp) || !Number.isFinite(landSec()) || physSec <= landSec()) return PHI_DIVE * smoothstep01((physSec - tick.leap) / (tick.flipDone - tick.leap));
  // 落地重做见 ../6-3-6/落地.ts：打击停顿，再借锤往前翻
  return landingFlipAngle(physSec - landSec());
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

// ---------- 竖井：砸穿以后的路线 ----------
// 撞击点（竖井中心）= 撞击时刻锤头的水平位置。砸进地里后匀减速：从 `shaftEntrySpeed` 碾下去，打穿洞顶时 55 米/秒；进了古城自由落体。
// 入井速度不用撞地时的 360 米/秒（竖井一闪而过）：撞击那一下把多余动能砸进坑里炸出金光。
// 岩层 141 米，照 88 碾要 1.97 秒看久了拖，取 140（1.45 秒）还看得清一路碾碎；洞顶出来的 55 米/秒不变。6-3-6 撞击以前不动（时间线.ts 的 `段表`）
const shaftEntrySpeed = 140;
let SHAFT: { center: V3; hipXY: [number, number]; impactZ: number; entrySpeed: number; impactSpeed: number; breachZ: number; breachDelay: number; a: number; landSec: number; landZ: number } | null = null;
export const liYingShaft = () => {
  if (SHAFT) return SHAFT;
  const imp = impactTime();
  const fallState = liYingFall(imp);
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
  SHAFT = { center: [head[0], head[1], groundZ], hipXY: [fallState.p[0], fallState.p[1]], impactZ, entrySpeed, impactSpeed: -fallState.v[2], breachZ, breachDelay, a: decel, landSec: imp + breachDelay + dropSec, landZ: ancientCityFloorZ + strikeDepth };
  return SHAFT;
};
// 落地那一刻的打击姿势（落地动作从它接出去）
const strikePoseAt = (physSec: number): FigurePose => {
  const tr = physSec - impactTime();
  return { ...strikeAt(tr, releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose)), loc: [0, 0, 0] };
};
export const digHipZ = (physSec: number) => {
  const shaft = liYingShaft();
  const t = physSec - impactTime();
  if (t <= shaft.breachDelay) return shaft.impactZ - shaft.entrySpeed * t + 0.5 * shaft.a * t * t;
  const sinceBreach = Math.min(t, shaft.landSec - impactTime()) - shaft.breachDelay;
  const z = shaft.breachZ - 55 * sinceBreach - 0.5 * 9.81 * sinceBreach * sinceBreach;
  if (physSec < shaft.landSec) return z;
  // 落地以后（落地.ts）：翻身那一下从打击姿势的髋高落到着地，之后髋高按骨架贴地算，脚不穿地也不悬空
  const sinceLand = physSec - shaft.landSec;
  const groundedHipZ = (q: number) => ancientCityFloorZ + hipPx(landingPose(q, strikePoseAt(shaft.landSec))) * PX;
  if (sinceLand < touchdownSec) return flipHipHeight(sinceLand, shaft.landZ, groundedHipZ(touchdownSec));
  return groundedHipZ(sinceLand);
};

// 压路机虚影浮现（开抡以后的物理秒）：锤抡过头顶时浮现，喊出声以前全显（用户 10-19：开抡就亮起来）
const ghostFadeIn = [0.15, 0.85] as const;
export const liYing = (physSec: number): LiYingState => {
  const imp = impactTime();
  if (physSec < tick.leap) {
    const pose = onBroomPose(physSec);
    const matrix = broomMatrixAt(physSec);
    const hip = new THREE.Vector3(...hipLocal(pose)).applyMatrix4(matrix);
    const maceHeld = physSec >= tick.maceAppears ? 1 : 0;
    return { pose, matrix, maceHeld: maceHeld, maceAngle: maceAngleOf(pose), ghost: 0, hip: [hip.x, hip.y, hip.z] };
  }
  // 空中：髋按物理轨迹走；6-3-5 起换成举锤、打击的姿势
  let pose = releasePose(physSec, blend(KEYS, physSec, STAND), legacyPose);
  const tr = physSec - imp;
  if (tr > strikeTracks().start) pose = strikeAt(tr, pose);
  pose = { ...pose, loc: [0, 0, 0] };
  let hip: V3;
  if (!(physSec > imp)) hip = liYingFall(physSec).p;
  else {
    const shaft = liYingShaft();
    hip = [shaft.hipXY[0], shaft.hipXY[1], digHipZ(physSec)];
    if (physSec > shaft.landSec) {
      // 落地：打击停顿 → 翻身收腿 → 半蹲缓冲 → 起身冲过一点 → 站定扫一眼，见 ../6-3-6/落地.ts
      pose = { ...landingPose(physSec - shaft.landSec, strikePoseAt(shaft.landSec)), loc: [0, 0, 0] };
    }
  }
  const matrix = freeMatrix(hip, phi(physSec), pose);
  // 虚影：开抡后浮现（见 `ghostFadeIn`），一路砸穿，进了古城以后散掉
  const shaft = Number.isFinite(imp) ? liYingShaft() : null;
  const sinceSwing = tr - strikeTracks().start;
  const fadeIn = smoothstep01((sinceSwing - ghostFadeIn[0]) / (ghostFadeIn[1] - ghostFadeIn[0]));
  const fadeOut = shaft ? 1 - smoothstep01((physSec - (imp + shaft.breachDelay)) / 0.25) : 1;
  return { pose, matrix, maceHeld: 1, maceAngle: maceAngleOf(pose), ghost: 0.62 * fadeIn * fadeOut, hip: hip };
};
export const maceHeadPos = (s: LiYingState) => maceHeadAt(s.pose, s.matrix, s.maceAngle);
