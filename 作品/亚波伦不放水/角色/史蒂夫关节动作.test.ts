// 走位里认腾空、往前还是倒着走，和带关节的动作的几个定点：站着不动腿是直的、蓄力和落地缓冲的起止、剑招的蓄斩停收。
import { describe, expect, it, vi } from 'vitest';
import type { V3 } from '@engine/model/parts.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { swordBeats, swordMoveLength, moveTable } from './剑招.ts';
import { addJointAction, landWeight, chargeWeight } from './史蒂夫关节动作.ts';
import { defineWalk } from './史蒂夫走位.ts';

// 库里的史蒂夫一 import 就要模型和皮肤的字节；这里只算姿势，给个空模型和 1×1 的图
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { width: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' }));

// 往 +y 匀速走 2 格/秒；0.5 秒处脚下高了一格（地形的台阶，不是跳）；1.0～1.5 秒跳一下（重力 24.6，落回原高）
const posAt = (t: number): V3 => {
  const τ = t - 1;
  return [0, 2 * t, (t >= 0.5 ? 1 : 0) + (τ > 0 && τ < 0.5 ? 6.15 * τ - 12.3 * τ * τ : 0)];
};

describe('史蒂夫走位', () => {
  it('从轨迹里认出腾空：台阶不算，起跳前、空中、落地后各给对时间', () => {
    const walker = defineWalk({ 位: posAt, 看: () => [0, 100, 1], start: 0, initFacing: 0 });
    expect(walker.在(0.5).跳.airPhase).toBeUndefined();
    expect(walker.在(0.3).跳).toEqual({});
    expect(walker.在(0.9).跳.preTakeoffSec).toBeCloseTo(0.1, 1);
    const airborne = walker.在(1.2).跳;
    expect(airborne.airPhase!.已).toBeCloseTo(0.2, 1);
    expect(airborne.airPhase!.remain).toBeCloseTo(0.3, 1);
    expect(airborne.airDurSec).toBeCloseTo(0.5, 1);
    const jumpLanding = walker.在(1.6).跳;
    expect(jumpLanding.postLandSec).toBeCloseTo(0.1, 1);
    expect(jumpLanding.landSpeed).toBeCloseTo(6.15, 0);
    expect(walker.在(2.3).跳).toEqual({});
  });

  it('向：脸朝移动方向是 1，倒着走是 −1', () => {
    expect(defineWalk({ 位: posAt, 看: () => [0, 100, 1], start: 0, initFacing: 0 }).在(0.8).走.walkDir).toBeCloseTo(1, 2);
    expect(defineWalk({ 位: posAt, 看: () => [0, -100, 1], start: 0, initFacing: 180 }).在(0.8).走.walkDir).toBeCloseTo(-1, 2);
  });
});

describe('史蒂夫关节动作', () => {
  const stance = { swing: 0, stride: 0, sec: 0, holdRight: true, holdLeft: false, holdingSword: true };

  it('站着不动：腿是直的、脚踩实，只有肘微屈', () => {
    const pose = addJointAction(stevePose([0, 0, 0], 0, { holdR: true }), stance);
    expect([pose.legR, pose.legL, pose.kneeR, pose.kneeL, pose.pitch]).toEqual([0, 0, 0, 0, 0]);
    expect(pose.ground).toBe(1);
    expect(pose.elbowR).toBeGreaterThan(pose.elbowL!);
  });

  it('蓄力只在起跳前、缓冲只在落地后；空中两膝收起来、髋不沉', () => {
    expect(chargeWeight({ preTakeoffSec: 0.4, airDurSec: 0.5 })).toBe(0);
    expect(chargeWeight({ preTakeoffSec: 0.08, airDurSec: 0.5 })).toBeGreaterThan(0.9);
    expect(chargeWeight({ preTakeoffSec: 0, airDurSec: 0.5 })).toBe(0);
    expect(landWeight({ postLandSec: 0, landSpeed: 8, airDurSec: 0.5 })).toBe(0);
    expect(landWeight({ postLandSec: 0.07, landSpeed: 8, airDurSec: 0.5 })).toBeCloseTo(1, 6);
    expect(landWeight({ postLandSec: 0.4, landSpeed: 8, airDurSec: 0.5 })).toBe(0);
    const pose = addJointAction(stevePose([0, 0, 0], 0, { holdR: true }), { ...stance, 跳: { airPhase: { 已: 0.25, remain: 0.25 }, airDurSec: 0.5 }, swungPast: true });
    expect(pose.kneeR).toBeGreaterThan(60);
    expect(pose.kneeL).toBeGreaterThan(60);
    expect(pose.ground).toBe(0);
  });

  it('剑招：蓄力满摆到蓄，斩完停在末（剑身顺着手臂压下去），收完回到平时；斩的时候不管蓄力，停的时候能蓄下一招', () => {
    const basePose = addJointAction(stevePose([0, 0, 0], 0, { holdR: true }), stance);
    const poseAt = (swingSec: number | undefined, charge = 0) => addJointAction(stevePose([0, 0, 0], 0, { holdR: true }), { ...stance, ...(swingSec === undefined ? {} : { swingSec }), move: '下劈', chargeMove: '下劈', charge });
    const windUpPose = poseAt(undefined, 1);
    expect(windUpPose.armR).toBeCloseTo(moveTable.下劈.windUpPose.臂, 6);
    expect(windUpPose.elbowR).toBeCloseTo(moveTable.下劈.windUpPose.肘, 6);
    const halfSwingPose = poseAt(swordBeats.slash / 2, 1);
    expect(halfSwingPose.armR).toBeCloseTo(moveTable.下劈.中.臂, 6);
    const followPose = poseAt(swordBeats.slash + 0.01);
    expect(followPose.armR).toBeCloseTo(moveTable.下劈.followThrough.臂, 6);
    expect(poseAt(swordBeats.slash + 0.01, 1).armR).toBeCloseTo(moveTable.下劈.windUpPose.臂, 6);
    expect(followPose.wristR).toBeCloseTo(moveTable.下劈.followThrough.腕, 6);
    expect(followPose.pitch).toBeLessThan(basePose.pitch - 15);
    const recoverDone = poseAt(swordMoveLength + 0.01);
    expect(recoverDone.armR).toBeCloseTo(basePose.armR, 6);
    expect(recoverDone.wristR).toBe(0);
  });

  it('斩那几帧剑尖每帧走 0.4 格以上（Linker 知识库：快的出手剑尖每帧 ≥ 0.4 m）', () => {
    // 近似：剑尖离肩约 1.25 格（上臂到握点 10 像素 + 握点到剑尖约 11 像素，× 0.9375 / 16）。下劈、上撩、跳劈按侧面剑的朝向
    // （从正下方往前量 ≈ 臂 + 肘 + 90 − 腕 − 倾，见 剑招.ts 开头）蓄 → 中 → 末 转过的角算弧长；横斩按绕竖轴的 转 + 拧 算
    const radius = 1.25;
    const frameCount = swordBeats.slash * 60;
    const sideAngle = (p: (typeof moveTable)['下劈']['windUpPose']) => p.臂 + p.肘 + 90 - p.腕 - p.倾;
    const arcPerFrame: Record<string, number> = {};
    for (const [moveName, { windUpPose, 中: strike, followThrough }] of Object.entries(moveTable)) {
      const flatAngle = (p: (typeof moveTable)['横斩']['windUpPose']) => p.转 + p.拧;
      const angleDelta = moveName === '横斩' ? Math.abs(flatAngle(strike) - flatAngle(windUpPose)) + Math.abs(flatAngle(followThrough) - flatAngle(strike)) : Math.abs(sideAngle(strike) - sideAngle(windUpPose)) + Math.abs(sideAngle(followThrough) - sideAngle(strike));
      arcPerFrame[moveName] = ((angleDelta * Math.PI) / 180) * radius / frameCount;
    }
    for (const [moveName, v] of Object.entries(arcPerFrame)) expect(v, `${moveName} 剑尖每帧 ${v.toFixed(2)} 格`).toBeGreaterThanOrEqual(0.4);
  });
});
