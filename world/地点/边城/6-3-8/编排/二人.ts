// 刘心忠、黄叛：城墙上的关键姿势、跳下城墙落进墙脚的水池（原版跳），切到坑口后跑来、先后跳进竖井。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { standPose, type FigurePose } from '../../../../角色/骨架.tsx';
import { RAMP_SEC, runPoseAt as runPose, runStride, speedProfile } from '../../../../角色/跑步.ts';
import { chaseSpeed } from '../../../古城4x/布局/强者.ts';
import { groundZ } from '../../6-3-下坠/编排.ts';
import { D2R, ss, lerp, sub, town } from './工具.ts';
import { poolJump, type PoolJump } from './落水.ts';
import { cues } from './时间线.ts';
import { huangStand, liuStand, shaftMouth, faceShaft } from './站位.ts';

// ---------- 姿势 ----------
type PosePart = Partial<FigurePose>;
const FIELDS = ['pitch', 'squash', 'headPitch', 'headYaw', 'legR', 'legL', 'armR', 'armL', 'armRRoll', 'armLRoll', 'armRYaw', 'armLYaw', 'yaw', 'twist', 'legRRoll', 'legLRoll'] as const;
// 关键姿势：每个字段单独找前后两个写了它的关键姿势平滑插值（没写的字段沿用上一个），同 6-3-下坠/编排/李樱.ts 的 blend
const blend = (keys: [number, PosePart][], t: number, base: FigurePose): FigurePose => {
  const out: FigurePose = { ...base, loc: [...base.loc] };
  for (const field of FIELDS) {
    const pts = keys.filter(([, k]) => k[field] !== undefined).map(([t0, k]) => [t0, k[field] as number] as [number, number]);
    if (!pts.length) continue;
    let value = pts[pts.length - 1][1];
    if (t <= pts[0][0]) value = pts[0][1];
    else
      for (let i = 1; i < pts.length; i++)
        if (t <= pts[i][0]) {
          value = lerp(pts[i - 1][1], pts[i][1], ss((t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
          break;
        }
    (out as Record<string, unknown>)[field] = value;
  }
  return out;
};
// 站着时手臂的轻晃（HumanoidModel.setupAnim 的 bobModelPart：zRot += cos(刻 × 0.09) × 0.05 + 0.05、xRot += sin(刻 × 0.067) × 0.05，左手相反）
const swayArms = (pose: FigurePose, t: number, phase: number): FigurePose => {
  const tickCount = t * 20 + phase;
  const z = (Math.cos(tickCount * 0.09) * 0.05 + 0.05) / D2R;
  const x = (Math.sin(tickCount * 0.067) * 0.05) / D2R;
  return { ...pose, armR: pose.armR + x, armL: pose.armL - x, armRRoll: pose.armRRoll - z, armLRoll: pose.armLRoll - z };
};

// 黄叛：左手拿弓（追兵.tsx 的 HuangPan，弓挂在左手插槽上）。望着坑开口，先侧过脸对刘心忠、弓朝坑那边一指；
// 说到「我们快追」身子转向东边的卫兵、右手往前挥两下招呼他们；说完转回去对着坑、身子前倾，跳
const huangShaftGaze = faceShaft(huangStand);
const huangBase: FigurePose = { ...standPose(huangStand), yaw: huangShaftGaze.yaw, headPitch: huangShaftGaze.pitch, armL: 8, armLRoll: -4, armR: 0 };
const huangStandPose: PosePart = { yaw: huangShaftGaze.yaw, pitch: 0, armL: 8, armLYaw: 0, armLRoll: -4, armR: 0, armRRoll: 0, armRYaw: 0, headYaw: 0, headPitch: huangShaftGaze.pitch };
const huangKeyPoses = (): [number, PosePart][] => {
  const cue = cues;
  return [
    [0, huangStandPose],
    [cue.黄开口 - 0.1, huangStandPose],
    [cue.黄开口 + 0.35, { headYaw: -24, headPitch: huangShaftGaze.pitch + 4, armL: 58, armLYaw: 10, armLRoll: -6 }],
    [cue.快追 - 0.35, { yaw: huangShaftGaze.yaw, headYaw: -10, armL: 58, armR: 0, armRRoll: 0 }],
    [cue.快追, { yaw: huangShaftGaze.yaw + 34, headYaw: 26, headPitch: 2, armL: 14, armLYaw: 0, armR: 96, armRRoll: -10 }],
    [cue.快追 + 0.3, { armR: 58 }],
    [cue.快追 + 0.55, { armR: 92 }],
    [cue.黄完 - 0.2, { yaw: huangShaftGaze.yaw + 20, headYaw: 10, armR: 30, armRRoll: 0 }],
    [cue.黄起跳 - 0.12, { yaw: 180, pitch: -8, armL: 20, armLYaw: 0, armLRoll: -4, armR: 20, headYaw: 0, headPitch: -10 }],
  ];
};
// 刘心忠：右手法杖（追兵.tsx 的 LiuXinzhong，握杖、前倾照 刘持杖，这里不另算）。黄叛开口时侧过脸听，说到「快追」点一下头，转回去对着坑跳
const liuShaftGaze = faceShaft(liuStand);
const liuBase: FigurePose = { ...standPose(liuStand), yaw: liuShaftGaze.yaw, headPitch: liuShaftGaze.pitch, armR: 14, armRRoll: 0, armL: 0 };
const liuStandPose: PosePart = { yaw: liuShaftGaze.yaw, armR: 14, armRRoll: 0, armL: 0, armLRoll: 0, headPitch: liuShaftGaze.pitch, headYaw: 0, pitch: 0 };
const liuKeyPoses = (): [number, PosePart][] => {
  const cue = cues;
  return [
    [0, liuStandPose],
    [cue.黄开口 + 0.2, liuStandPose],
    [cue.黄开口 + 0.7, { headYaw: 28, headPitch: 0 }],
    [cue.快追 + 0.15, { headYaw: 26, headPitch: 0 }],
    [cue.快追 + 0.32, { headPitch: -16 }],
    [cue.快追 + 0.5, { headPitch: 0, headYaw: 10 }],
    [cue.刘起跳 - 0.5, { yaw: 180, headYaw: 0, headPitch: -6, armL: 0 }],
    [cue.刘起跳 - 0.12, { yaw: 180, pitch: -8, armL: 20, armR: 26, headYaw: 0, headPitch: -10 }],
  ];
};
const HUANG_KEYS = huangKeyPoses();
const LIU_KEYS = liuKeyPoses();

// ---------- 起跳、跳下城墙、落水 ----------
// 两人离内沿 1.7 格，蹬一步疾跑起跳（水平起速 0.28 + 0.2 格/刻、竖直 0.42），朝正南跳出去，落进墙脚的落水池（和卫兵同一个池子，用户 10-19 定）；
// 蹚到南池沿爬上岸，跳下池沿往西跑（路上精英 30 米/秒）。逐刻算法见 编排/落水.ts
const leaderJump = (standPos: V3, takeoffSec: number) => {
  const local = sub(standPos, town(0, 0, 0));
  return poolJump({ takeoffSec, x: local[0], y: local[1], vz0: 0.42, vh0: 0.48, wadeDelay: 0.1, topSpeed: chaseSpeed.精英 });
};
const LIU_JUMP = leaderJump(liuStand, cues.刘起跳);
const HUANG_JUMP = leaderJump(huangStand, cues.黄起跳);
export const leaderPoolJump = (who: '刘' | '黄') => (who === '刘' ? LIU_JUMP : HUANG_JUMP);
// 跳的时候：蹲一下（0.12 秒）、腾空（两腿一前一后、手往后甩）、下落（手往上）
const leapPose = (pose: FigurePose, sec: number): FigurePose => {
  if (sec < -0.12) return pose;
  if (sec < 0) {
    const k = ss((sec + 0.12) / 0.12);
    return { ...pose, squash: 1 - 0.08 * k, pitch: pose.pitch - 8 * k };
  }
  const k = ss(sec / 0.25);
  return { ...pose, squash: 1, ground: 0, pitch: lerp(-8, -14, k), legR: 30 * k, legL: -24 * k, armR: lerp(pose.armR, 150, ss((sec - 0.25) / 0.4)), armL: lerp(pose.armL, 150, ss((sec - 0.25) / 0.4)) };
};

// ---------- 坑口：两人从城门大街跑过来，先后跳进竖井 ----------
// 镜头切过去时两人在大街上往南跑，在坑沿（井心往北 5 格，再往前坑面往下陷，见 竖井4x.坑面.json）起跳，越过坑面落进竖井口，往下掉出画面。
// 跑：精英 30 米/秒（用户 10-20）；井口只有 4 米宽，全速冲过去会飞过井口落到对面坑沿，所以起跳前 `RAMP_SEC` 刹到原版疾跑起跳的 9.6 米/秒（0.48 格/刻），
// 起跳照原版疾跑起跳。进了井口撞上井壁，水平速度没了，竖直照原版往下掉。
const pitEdge = 5; // 起跳点在井心往北几格
const takeoffSpeed = 0.48 * 20;
// 离起跳还有 s 秒时：离起跳点多远、多快、步态周期数（倒着算）
const pitApproach = speedProfile([[0, takeoffSpeed], [RAMP_SEC, chaseSpeed.精英]]);
const pitRun = (who: '刘' | '黄') => {
  const center = shaftMouth();
  const dx = who === '刘' ? -0.7 : 0.7; // 两人一左一右（刘心忠在西）
  const takeoffSec = who === '刘' ? cues.刘入井 : cues.黄入井;
  return { start: [center[0] + dx, center[1] + pitEdge, groundZ] as V3, takeoffSec: takeoffSec };
};
// 疾跑起跳的水平、竖直位移（格，按刻打表）
const sprintLeapTable = (() => {
  const out: { x: number; z: number }[] = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  let vx = 0.28 + 0.2;
  let vz = 0.42;
  for (let k = 0; k < 160; k++) {
    x += vx;
    z += vz;
    vz = (vz - 0.08) * 0.98;
    vx = x > pitEdge - 1.6 ? 0 : vx * 0.91 + 0.026; // 进了井口（离井心不到 1.6 格）撞上南边的井壁，水平停下
    out.push({ x: Math.min(x, pitEdge + 0.6), z });
  }
  return out;
})();
const sprintLeap = (sec: number) => {
  const k = Math.max(0, sec) * 20;
  const i = Math.min(Math.floor(k), sprintLeapTable.length - 2);
  const frac = k - i;
  return { x: lerp(sprintLeapTable[i].x, sprintLeapTable[i + 1].x, frac), z: lerp(sprintLeapTable[i].z, sprintLeapTable[i + 1].z, frac) };
};
const atPit = (who: '刘' | '黄', t: number): { pose: FigurePose; present: boolean } => {
  const { start: start, takeoffSec: takeoffSec } = pitRun(who);
  const yaw = 180; // 朝南跑
  const sinceTakeoff = t - takeoffSec;
  if (sinceTakeoff < 0) {
    // 起跳以前：在大街上往南跑，起跳那一刻到坑沿
    const run = pitApproach(-sinceTakeoff);
    const loc: V3 = [start[0], start[1] + run.dist, start[2]];
    return { pose: runPose(loc, yaw, -run.cycles, run.speed), present: true };
  }
  const j = sprintLeap(sinceTakeoff);
  const loc: V3 = [start[0], start[1] - j.x, start[2] + j.z];
  const basePose = runPose(loc, yaw, j.x / runStride(takeoffSpeed), takeoffSpeed);
  const k = ss(sinceTakeoff / 0.3);
  const pose: FigurePose = { ...basePose, ground: 0, pitch: lerp(-10, -4, k), legR: lerp(basePose.legR, 34, k), legL: lerp(basePose.legL, -20, k), armR: lerp(basePose.armR, 160, ss((sinceTakeoff - 0.3) / 0.35)), armL: lerp(basePose.armL, 160, ss((sinceTakeoff - 0.3) / 0.35)) };
  // 掉到井口下面 4 米就不画了（镜头看不到，也省得穿出古城）
  return { pose, present: loc[2] > groundZ - 30 };
};

export type Person = { pose: FigurePose; present: boolean };
// 水里蹚着走：步子、手摆都小一半，身子往前探
const wadePose = (loc: V3, yaw: number, cycles: number): FigurePose => {
  const pose = runPose(loc, yaw, cycles, 5.6);
  return { ...pose, pitch: -16, legR: pose.legR * 0.5, legL: pose.legL * 0.5, armR: pose.armR * 0.5 + 20, armL: pose.armL * 0.5 + 20 };
};
const onWall = (keys: [number, PosePart][], base: FigurePose, t: number, phase: number, jump: PoolJump, standPos: V3): Person => {
  let pose = blend(keys, t, base);
  pose = swayArms(pose, t, phase);
  const sinceTakeoff = t - jump.takeoffSec;
  if (sinceTakeoff <= -0.12) return { pose: { ...pose, loc: [...standPos] }, present: true };
  const s = jump.at(t);
  const loc = town(...s.pos);
  if (s.phase === '空中' || sinceTakeoff < 0) return { pose: leapPose({ ...pose, loc }, sinceTakeoff), present: true };
  if (s.phase === '水里') return { pose: wadePose(loc, s.heading, s.cycles), present: true };
  return { pose: runPose(loc, s.heading, s.cycles, s.speed), present: true };
};
export const huangPanState = (t: number): Person => (t >= cues.切坑 ? atPit('黄', t) : onWall(HUANG_KEYS, huangBase, t, 0, HUANG_JUMP, huangStand));
export const liuXinzhongState = (t: number): Person => (t >= cues.切坑 ? atPit('刘', t) : onWall(LIU_KEYS, liuBase, t, 37, LIU_JUMP, liuStand));
