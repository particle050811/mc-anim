// 第 2 场基地谋划（6-2-1～6-2-3）站着演戏用的小工具：骨架正向运动学（手在哪）、按目标点反解手臂、姿态插值、沿路走、走路摆腿。
// 坐标都是房间本地坐标（模型/场景/基地工坊.tsx：Z 朝上，1 = 一格，+Y 叫「北」）。
import * as THREE from 'three';
import { rad } from '@engine/anim/anim.ts';
import type { FigurePose } from '@库/角色/骨架.tsx';

export const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
export const D2R = Math.PI / 180;
// 从 from 看向 to 的 yaw（骨架约定：0 = 朝 +Y，正 = 往左转）
export const yawToward = (from: number[], to: number[]) => Math.atan2(-(to[0] - from[0]), to[1] - from[1]) / D2R;

// ---------- 姿态插值：数值字段逐个插，loc 逐分量插 ----------
const KEYS: (keyof FigurePose)[] = [
  'pitch', 'squash', 'headPitch', 'headYaw', 'legR', 'legL', 'armR', 'armRRoll', 'armL', 'armLRoll',
  'kneeR', 'kneeL', 'elbowR', 'elbowL', 'ground', 'yaw', 'twist', 'legRRoll', 'legLRoll',
];
const DEF: Partial<Record<keyof FigurePose, number>> = { squash: 1, ground: 1 };
export const mixPose = (fromPose: FigurePose, toPose: FigurePose, k: number): FigurePose => {
  if (k <= 0) return fromPose;
  if (k >= 1) return toPose;
  const out = { ...fromPose, loc: lerp3(fromPose.loc, toPose.loc, k) } as FigurePose;
  for (const key of KEYS) {
    const va = (fromPose[key] as number | undefined) ?? DEF[key] ?? 0;
    const vb = (toPose[key] as number | undefined) ?? DEF[key] ?? 0;
    (out as Record<string, unknown>)[key] = lerp(va, vb, k);
  }
  return out;
};
// 只改几个字段
export const withPose = (p: FigurePose, d: Partial<FigurePose>): FigurePose => ({ ...p, ...d });

// ---------- 正向运动学：和 骨架.tsx 的 Figure 同一串变换（含 ground = 1 时髋高跟着腿走） ----------
const m4 = () => new THREE.Matrix4();
const translate = (x: number, y: number, z: number) => m4().makeTranslation(x, y, z);
const rotate = (x: number, y: number, z: number, order: THREE.EulerOrder) => m4().makeRotationFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), order));
export const hipPx = (pose: FigurePose) => {
  const reach = (a: number, knee: number) => 6 * Math.cos(rad(a + pose.pitch)) + 6 * Math.cos(rad(a + pose.pitch - knee));
  const grounded = Math.max(3, reach(pose.legR, pose.kneeR ?? 0), reach(pose.legL, pose.kneeL ?? 0));
  const groundWeight = pose.ground ?? 1;
  return 12 + groundWeight * (grounded - 12);
};
// 手的握持点坐标系（骨架.tsx 的 handR / handL）→ 房间本地坐标。height：角色身高（格）
export const handMatrix = (pose: FigurePose, hand: 'R' | 'L', height: number): THREE.Matrix4 => {
  const scale = height / 32;
  const [arm, roll, elbow, sx] = hand === 'R' ? [pose.armR, pose.armRRoll, pose.elbowR ?? 0, 6] : [pose.armL, -pose.armLRoll, pose.elbowL ?? 0, -6];
  return translate(pose.loc[0], pose.loc[1], pose.loc[2])
    .multiply(rotate(0, 0, pose.yaw ?? 0, 'XYZ'))
    .multiply(m4().makeScale(scale, scale, scale))
    .multiply(translate(0, 0, hipPx(pose) * pose.squash))
    .multiply(rotate(pose.pitch, 0, 0, 'XYZ'))
    .multiply(m4().makeScale(1, 1, pose.squash))
    .multiply(translate(0, 0, -12))
    .multiply(rotate(0, 0, pose.twist ?? 0, 'XYZ'))
    .multiply(translate(sx, 0, 22))
    .multiply(rotate(arm, roll, 0, 'YXZ'))
    .multiply(translate(0, 0, -4))
    .multiply(rotate(elbow, 0, 0, 'XYZ'))
    .multiply(translate(0, 0, -5));
};
export const handAt = (pose: FigurePose, hand: 'R' | 'L', height: number): number[] => {
  const pos = new THREE.Vector3().setFromMatrixPosition(handMatrix(pose, hand, height));
  return [pos.x, pos.y, pos.z];
};

// ---------- 反解手臂：身体（loc、yaw、pitch、twist）不动，找 arm / roll / elbow 让握持点落到 target ----------
// 模式搜索（每个量 ±步长试，没改进就减半），只在模块加载时给关键姿态算一次。
// 同一个手位往往有好几种解（上臂垂着、整条胳膊往里拧 80° 也能把手送到胸前但会穿身体），所以每次给初值（init：[arm, roll, elbow]）和范围（lim），再轻轻往初值拉，挑离初值最近的自然姿势
export type ArmSolveOpts = { init?: [number, number, number]; lim?: [number, number][] };
export const reach = (pose: FigurePose, hand: 'R' | 'L', target: number[], height: number, opts: ArmSolveOpts = {}): FigurePose => {
  const keys = hand === 'R' ? (['armR', 'armRRoll', 'elbowR'] as const) : (['armL', 'armLRoll', 'elbowL'] as const);
  const lim = opts.lim ?? [[-60, 200], [-40, 90], [0, 140]];
  const init = opts.init ?? [(pose[keys[0]] as number) ?? 0, (pose[keys[1]] as number) ?? 0, (pose[keys[2]] as number | undefined) ?? 20];
  const x = init.map((v, i) => Math.min(lim[i][1], Math.max(lim[i][0], v)));
  const cost = (angles: number[]) => {
    const trialPose = { ...pose, [keys[0]]: angles[0], [keys[1]]: angles[1], [keys[2]]: angles[2] } as FigurePose;
    const handPos = handAt(trialPose, hand, height);
    const err = (handPos[0] - target[0]) ** 2 + (handPos[1] - target[1]) ** 2 + (handPos[2] - target[2]) ** 2;
    return err + 1e-7 * ((angles[0] - init[0]) ** 2 + (angles[1] - init[1]) ** 2 + (angles[2] - init[2]) ** 2);
  };
  let best = cost(x);
  for (let step = 16; step > 0.05; ) {
    let moved = false;
    for (let i = 0; i < 3; i++)
      for (const delta of [step, -step]) {
        const y = x.slice();
        y[i] = Math.min(lim[i][1], Math.max(lim[i][0], y[i] + delta));
        const trialCost = cost(y);
        if (trialCost < best) {
          best = trialCost;
          x.splice(0, 3, ...y);
          moved = true;
        }
      }
    if (!moved) step /= 2;
  }
  return { ...pose, [keys[0]]: x[0], [keys[1]]: x[1], [keys[2]]: x[2] } as FigurePose;
};

// ---------- 沿折线走：拐角处取前后一小段的平均位置，走出圆角 ----------
export class WalkPath {
  pts: number[][];
  acc: number[] = [0];
  constructor(pts: number[][]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  get length() {
    return this.acc[this.acc.length - 1];
  }
  private raw(dist: number) {
    const clamped = Math.min(this.length, Math.max(0, dist));
    let i = 0;
    while (i < this.pts.length - 2 && clamped > this.acc[i + 1]) i++;
    const k = (clamped - this.acc[i]) / (this.acc[i + 1] - this.acc[i] || 1);
    return lerp3(this.pts[i], this.pts[i + 1], k);
  }
  // 位置（拐角倒圆，半径约 圆角 格；两头不动）
  at(dist: number, cornerRadius = 0.35): number[] {
    const halfWidth = Math.min(cornerRadius, dist, this.length - dist);
    if (halfWidth <= 1e-6) return this.raw(dist);
    const halfSamples = 6;
    const sum = [0, 0, 0];
    for (let j = -halfSamples; j <= halfSamples; j++) {
      const point = this.raw(dist + (halfWidth * j) / halfSamples);
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2] ?? 0;
    }
    return sum.map((v) => v / (2 * halfSamples + 1));
  }
  // 走的方向（yaw，度）
  heading(dist: number): number {
    const behind = this.at(Math.max(0, dist - 0.3));
    const ahead = this.at(Math.min(this.length, dist + 0.3));
    return yawToward(behind, ahead);
  }
}

// 把角度挪到离 ref 最近的那一圈（转身插值不绕远路）
export const near = (a: number, ref: number) => a + 360 * Math.round((ref - a) / 360);

// 走路摆腿摆手：phase 是步态相位（周期数，一个周期两步），amp 是腿摆的幅度（度）；arms 为 false 时两手不摆（手里拿着东西）
export const walkSwing = (pose: FigurePose, phase: number, amp: number, arms: { R?: boolean; L?: boolean } = { R: true, L: true }): FigurePose => {
  const swing = Math.sin(2 * Math.PI * phase);
  const out = { ...pose, legR: (pose.legR ?? 0) + amp * swing, legL: (pose.legL ?? 0) - amp * swing };
  if (arms.R) out.armR = pose.armR - 0.65 * amp * swing;
  if (arms.L) out.armL = pose.armL + 0.65 * amp * swing;
  return out;
};
