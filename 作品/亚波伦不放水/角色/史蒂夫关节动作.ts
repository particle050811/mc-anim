// 史蒂夫带关节的动作：在原版姿势（库里的 stevePose）上加肘、膝，把走、跑、跳、落地、挥剑、挣扎、挨打做顺。纯计算，史蒂夫反应.ts 调。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版（「连关节都没有，导致动作僵硬」「人物的动作也要非常流畅」）。
// 原版的拍子不动：摆腿的相位（limbSwing × 0.6662）、受伤色 10 刻、死亡 20 刻倒下都照旧，这里只改每一刻摆成什么样。
// 拿剑时的挥剑不用原版挥手（用户 11-11 嫌「劈砍的动作也很诡异」），换成 角色/剑招.ts 的四种剑招，带腕、转腰、重心。
// 下面的幅度、曲线全是 Agent 取的，用户没看过；要调的数都在 动作参 里。
// 角度单位度。大腿角说的是相对竖直线（往前为正）；FigurePose 的腿挂在前倾的身子上，写回 pose 时减掉 pitch。
import { clamp, clamp01, lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { StevePose } from '@库/角色/史蒂夫.tsx';
import { type MoveName, type MovePose, moveTable, swordBeats, slashStateAt } from './剑招.ts';
import { type JointPose, squatLegAngle, legExtend } from './史蒂夫关节.ts';
import type { AirSnapshot } from './史蒂夫走位.ts';

export const actionParams = {
  走: {
    /** 大腿前后摆的幅度（度/步幅）：原版 80，膝能弯以后不用甩那么开 */
    swingLeg: 54,
    /** 大腿整体往移动方向偏（度/步幅）：抬膝比后蹬高 */
    forwardOffset: 8,
    /** 支撑腿的膝（度/步幅）、迈步那条腿收小腿最多再加多少、最弯的时刻比迈步的正中提前多少（弧度）、收腿曲线的指数 */
    supportKnee: 12,
    tuckKnee: 84,
    kneeTuckEarly: 0.35,
    kneeTuckExp: 1.5,
    /** 身子前倾（度/步幅）：站着走的一份 + 往前走再加的一份（倒着走减掉） */
    forwardLean: [3, 6],
    /** 两腿都斜着时髋最多沉多少像素；再多就当腾空（两脚离地，跑起来的样子） */
    hipSink: 1.6,
  },
  armParams: {
    /** 肘：站着（空手、拿东西）+ 步幅 ×（基础 + 摆到前面再加） */
    emptyHand: [7, 45, 25],
    holdingItem: [22, 16, 10],
  },
  crouch: {
    /** 蹲到底（权 1）膝弯多少、身子前倾多少 */
    knee: 100,
    forwardLean: 14,
    /** 各种蹲的权：起跳前蓄力、落地缓冲（再乘落地速度 ÷ 7 格/秒，夹在 0.35～1）、挣扎时扎着的马步、挨打腿软 */
    charge: 0.85,
    landing: 0.9,
    struggle: 0.22,
    getHit: 0.3,
    /** 蓄力：起跳前多久开始蹲、蹲到底用多久、最后多久蹬直（秒） */
    chargeStartSec: 0.26,
    chargeSinkSec: 0.16,
    chargePushSec: 0.05,
    /** 落地：多久压到底、再过多久站直（秒） */
    landPress: 0.07,
    landStartSec: 0.33,
  },
  airTiming: {
    /** 往前跳：前腿（左）、后腿（右）的 [大腿, 膝]；往后跳：两腿一样 */
    frontLeg: [58, 85],
    backLeg: [-18, 70],
    backJump: [32, 66],
    /** 离地后多久收到位、落地前多久开始伸腿（秒）；腾空不到 0.15 秒的小跳不收，0.4 秒以上收满 */
    收: 0.12,
    airExtendSec: 0.1,
    forwardLean: 8,
  },
  swingSword: {
    /** 拿着剑往前跳、还没挥过剑时自己举剑（蓄力 不给的时候）用哪一招的蓄 */
    jumpChop: '跳劈' as MoveName,
  },
  struggle: {
    /** 两肘轮流往回拽：基础 + 幅度（度），每秒几下；身子前倾（度） */
    elbow: [32, 34],
    frequency: 1.4,
    forwardLean: 7,
  },
  getHit: {
    /** 空着的那只手往后甩（度）、肘（度） */
    flingArm: 24,
    elbow: 30,
  },
} as const;

/** 几种蹲并在一起：都不蹲是 0，哪种蹲满了就是 1，叠起来不超过 1 */
const softOr = (weights: readonly number[]) => 1 - weights.reduce((product, w) => product * (1 - clamp01(w)), 1);

/** 起跳前的蓄力下蹲 0～1：起跳前 蓄力起 秒开始往下蹲，最后 蓄力蹬 秒蹬直 */
export const chargeWeight = (airborne: AirSnapshot) => {
  const τ = airborne.preTakeoffSec;
  if (τ === undefined) return 0;
  const { chargeStartSec, chargeSinkSec, chargePushSec } = actionParams.crouch;
  return smoothstep01((chargeStartSec - τ) / chargeSinkSec) * smoothstep01(τ / chargePushSec) * jumpSize(airborne);
};
/** 落地缓冲 0～1：落地后 落地压 秒压到底，再 落地起 秒站直；落得越快压得越深 */
export const landWeight = (airborne: AirSnapshot) => {
  const τ = airborne.postLandSec;
  if (τ === undefined) return 0;
  const { landPress, landStartSec } = actionParams.crouch;
  return clamp((airborne.landSpeed ?? 0) / 7, 0.35, 1) * smoothstep01(τ / landPress) * (1 - smoothstep01((τ - landPress) / landStartSec)) * jumpSize(airborne);
};
/** 空中收腿 0～1 */
export const kneeTuckWeight = (airborne: AirSnapshot) => (airborne.airPhase ? smoothstep01(airborne.airPhase.已 / actionParams.airTiming.收) * smoothstep01(airborne.airPhase.remain / actionParams.airTiming.airExtendSec) * jumpSize(airborne) : 0);
const jumpSize = (airborne: AirSnapshot) => clamp01(((airborne.airDurSec ?? 0.4) - 0.15) / 0.25);

export type JointActionInput = {
  /** 摆腿（原版 limbSwing、limbSwingAmount）；向：1 往前走、−1 倒着走，不给 = 1 */
  swing: number;
  stride: number;
  walkDir?: number;
  跳?: AirSnapshot;
  /** 挣扎强度 0～1、时钟（秒） */
  struggleAmount?: number;
  sec: number;
  /** 挨打后仰的包络 0～1（后仰的角度本身已经加在 pose.pitch 上） */
  backLean?: number;
  /** 两只手拿没拿东西；右手拿的是不是剑 */
  holdRight: boolean;
  holdLeft: boolean;
  holdingSword: boolean;
  /** 正在拉弓、举盾：那只手臂照原版的姿势，肘不弯 */
  drawBow?: boolean;
  shieldUp?: boolean;
  /** 距上次挥剑点击几秒（没在挥 = 不给）；挥过 = 这一段里已经点过挥剑 */
  swingSec?: number;
  swungPast?: boolean;
  /** 点下去的是哪一招、正在蓄的是哪一招；不给 = 下劈 */
  move?: MoveName;
  chargeMove?: MoveName;
  /** 举剑蓄力 0～1（摆到 蓄招 的蓄）；不给 = 拿着剑往前跳、还没挥过就举 跳蓄 那一招（起跳前蓄力时举起来）。斩、停的时候不算 */
  charge?: number;
};

/** pose：stevePose（加上看向、拧身、后仰）出来的；返回加了肘、膝、蹲、收腿、前倾的姿势 */
export const addJointAction = (pose: StevePose, input: JointActionInput): JointPose => {
  const params = actionParams;
  const strideClamped = clamp01(input.stride);
  const walkDir = clamp(input.walkDir ?? 1, -1, 1);
  const airborne = input.跳 ?? {};
  const struggleAmount = clamp01(input.struggleAmount ?? 0);
  const backLean = clamp01(input.backLean ?? 0);
  const φ = input.swing * 0.6662;

  // 剑招：点下去那一招的斩（权 1 → 收的时候降到 0），再盖上下一招的蓄（蓄力）
  const slashState = input.holdingSword && input.swingSec !== undefined ? slashStateAt(input.move ?? '下劈', input.swingSec) : null;
  const inSlash = input.swingSec !== undefined && input.swingSec >= 0 && input.swingSec < swordBeats.slash;
  let chargeAmt = 0;
  let chargePose: MovePose = moveTable[input.chargeMove ?? '下劈'].windUpPose;
  if (input.holdingSword && !inSlash) {
    if (input.charge !== undefined) chargeAmt = clamp01(input.charge);
    else {
      const takeoffWeight = airborne.airPhase ? smoothstep01(airborne.airPhase.remain / params.airTiming.airExtendSec) : airborne.preTakeoffSec !== undefined ? smoothstep01((params.crouch.chargeStartSec - airborne.preTakeoffSec) / params.crouch.chargeSinkSec) : 0;
      chargeAmt = input.swungPast || slashState ? 0 : takeoffWeight * smoothstep01((walkDir - 0.2) / 0.5) * jumpSize(airborne);
      chargePose = moveTable[params.swingSword.jumpChop].windUpPose;
    }
  }
  /** 平时的值 → 套上斩和蓄以后的值（叠加的键平时是 0） */
  const blendJoint = (poseKey: keyof MovePose, baseValue: number) => lerp(slashState ? lerp(baseValue, slashState.pose[poseKey], slashState.blendWeight) : baseValue, chargePose[poseKey], chargeAmt);

  // 走、跑：大腿照原版的相位摆（右腿 −cos φ），迈步的那条腿收小腿（往前走时右腿在 sin φ > 0 的半圈里往前迈，倒着走反过来）
  const kneeCurve = (u: number) => ((1 + u) / 2) ** params.走.kneeTuckExp;
  const stepSwing = Math.sin(φ + params.走.kneeTuckEarly) * walkDir;
  let legR = strideClamped * (-params.走.swingLeg * Math.cos(φ) + params.走.forwardOffset * walkDir);
  let legL = strideClamped * (params.走.swingLeg * Math.cos(φ) + params.走.forwardOffset * walkDir);
  let kneeR = strideClamped * (params.走.supportKnee + params.走.tuckKnee * kneeCurve(stepSwing));
  let kneeL = strideClamped * (params.走.supportKnee + params.走.tuckKnee * kneeCurve(-stepSwing));
  let forwardLean = strideClamped * Math.max(0, params.走.forwardLean[0] + params.走.forwardLean[1] * walkDir) + params.struggle.forwardLean * struggleAmount + blendJoint('倾', 0);

  // 蹲：蓄力、落地、马步、腿软并在一起；两膝加弯，大腿抬到脚底还在髋的正下方
  const crouchWeight = softOr([params.crouch.charge * chargeWeight(airborne), params.crouch.landing * landWeight(airborne), params.crouch.struggle * struggleAmount, params.crouch.getHit * backLean, blendJoint('沉', 0)]);
  const squatKnee = params.crouch.knee * crouchWeight;
  legR += squatLegAngle(squatKnee);
  legL += squatLegAngle(squatKnee);
  kneeR += squatKnee;
  kneeL += squatKnee;
  forwardLean += params.crouch.forwardLean * crouchWeight;

  // 空中收腿：往前跳一前一后，往后跳两腿一起收
  const tuckWeight = kneeTuckWeight(airborne);
  if (tuckWeight > 0) {
    const blend = (walkDir + 1) / 2;
    const airTarget = (target: readonly [number, number], i: 0 | 1) => lerp(params.airTiming.backJump[i], target[i], blend);
    legL = lerp(legL, airTarget(params.airTiming.frontLeg, 0), tuckWeight);
    kneeL = lerp(kneeL, airTarget(params.airTiming.frontLeg, 1), tuckWeight);
    legR = lerp(legR, airTarget(params.airTiming.backLeg, 0), tuckWeight);
    kneeR = lerp(kneeR, airTarget(params.airTiming.backLeg, 1), tuckWeight);
    forwardLean += params.airTiming.forwardLean * tuckWeight * blend;
  }

  // 髋：蹲的时候脚踩实；走的时候髋最多沉 沉髋 像素，再多的算两脚离地；空中不沉（脚收上去）
  const legBottom = Math.max(3, legExtend(legR, kneeR).下, legExtend(legL, kneeL).下);
  const gapDiff = 12 - legBottom;
  const stompFirm = smoothstep01(crouchWeight * 2.5);
  let ground = gapDiff < 1e-6 ? 1 : clamp01((Math.min(gapDiff, params.走.hipSink) + Math.max(0, gapDiff - params.走.hipSink) * stompFirm) / gapDiff);
  if (airborne.airPhase) ground *= 1 - smoothstep01(Math.min(airborne.airPhase.已 / 0.07, airborne.airPhase.remain / 0.05));

  // 肘：摆到前面多弯一点（两臂和腿反着摆：右臂 cos φ 往前）
  const armElbow = (holding: boolean, forwardSwing: number) => {
    const [standAngle, baseAngle, extra] = holding ? params.armParams.holdingItem : params.armParams.emptyHand;
    return standAngle + strideClamped * (baseAngle + extra * forwardSwing);
  };
  let elbowR = armElbow(input.holdRight, (1 + Math.cos(φ)) / 2);
  let elbowL = armElbow(input.holdLeft, (1 - Math.cos(φ)) / 2);
  let { armR, armL, armRRoll } = pose;

  // 挣扎：两肘轮流往回拽
  if (struggleAmount > 0) {
    const tug = Math.sin(input.sec * Math.PI * 2 * params.struggle.frequency);
    elbowR += struggleAmount * (params.struggle.elbow[0] + params.struggle.elbow[1] * tug);
    elbowL += struggleAmount * (params.struggle.elbow[0] - params.struggle.elbow[1] * tug);
  }
  // 挨打：空着的手往后甩
  if (backLean > 0) {
    if (!input.holdLeft) [armL, elbowL] = [armL - params.getHit.flingArm * backLean, elbowL + params.getHit.elbow * backLean];
    else if (!input.holdRight) [armR, elbowR] = [armR - params.getHit.flingArm * backLean, elbowR + params.getHit.elbow * backLean];
  }
  // 剑招：右臂、肘、腕、左臂照招摆，胸跟着拧
  let [armRYaw, armLRoll, twist, wristR] = [pose.armRYaw ?? 0, pose.armLRoll, pose.twist ?? 0, 0];
  if (slashState || chargeAmt > 0) {
    [armR, armRRoll, armRYaw, elbowR, wristR] = [blendJoint('臂', armR), blendJoint('滚', armRRoll), blendJoint('转', armRYaw), blendJoint('肘', elbowR), blendJoint('腕', 0)];
    [armL, armLRoll, twist] = [blendJoint('左臂', armL), blendJoint('左滚', armLRoll), twist + blendJoint('拧', 0)];
  }
  if (input.drawBow) [elbowR, elbowL] = [0, 0];
  if (input.shieldUp) elbowL = 0;

  // pitch 负 = 前倾；后仰已经在 pose.pitch 里。头把自己加的前倾抵掉，还看着原来的地方
  const pitch = pose.pitch - forwardLean;
  return {
    ...pose,
    pitch,
    headPitch: pose.headPitch + forwardLean,
    legR: legR - pitch,
    legL: legL - pitch,
    kneeR: kneeR,
    kneeL: kneeL,
    elbowR: elbowR,
    elbowL: elbowL,
    armR,
    armL,
    armRRoll,
    armRYaw,
    armLRoll,
    twist,
    wristR,
    ground,
  };
};
