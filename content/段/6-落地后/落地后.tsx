// 6-1-9b 落地后（画面）：一镜到底的画面（一镜到底/画面.tsx 的 一镜画面）按全局帧 F0 + f 接着往下画，机位换成 编排.ts 的 机位，
// 两人的姿势在一镜到底落地站定的站姿上先叠 落地编排.ts 的从天落地，再叠 编排.ts 的增量（改骑手）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BonePose } from '../../../engine/model/基岩模型.tsx';
import type { RideJiuhu, RideLiYing } from '../../../world/角色/骑扫帚.tsx';
import type { FigurePose } from '../../../world/角色/骨架.tsx';
import { collectBreakParticles, BreakParticleQuads } from '../../../world/特效/方块破坏粒子.tsx';
import { particleTexture, type Particle } from '../../../world/特效/粒子面片.tsx';
import { png } from '../../../engine/model/贴图.ts';
import * as P613 from '../../场/6-暮色森林/6-1-3/编排.ts';
import { OnerFrame, type Riders } from '../../场/6-暮色森林/一镜到底/画面.tsx';
import * as choreo from '../../场/6-暮色森林/6-1-9b/编排.ts';
import * as landing from '../../场/6-暮色森林/6-1-9b/落地编排.ts';
import { AfterLandingSound } from './声音.tsx';
import { mouthAt } from '../../../world/角色/口型.ts';
import brickUri from 'asset:贴图/镜头/6-1-9b/城堡砖';

const BRICK = png(brickUri); // twilightforest:block/castle_brick（城堡砖、符文城堡砖的 particle 贴图都是它）
const LandingParticles: React.FC<{ F: number }> = ({ F }) => {
  const items: Particle[] = [];
  for (const b of landing.bursts) collectBreakParticles(b.ps, (F - b.at) / 24, items);
  return <BreakParticleQuads tex={particleTexture(BRICK.px, BRICK.w, BRICK.h, BRICK)} items={items} lit />;
};

// 九胡尾巴摆动的相位：一镜到底按全局帧 / 9 走（画面.tsx 的 骑手），这里东张西望时甩得快一点（编排.ts 的 尾快），按帧把快慢积起来，
// 第 0 帧和一镜到底末帧同一个相位
const tailPhases: number[] = [(P613.beats.末帧 + choreo.F0) / 9];
for (let frame = 1; frame <= choreo.frameCount; frame++) tailPhases.push(tailPhases[frame - 1] + choreo.jiuhuTweak((frame - 0.5) / choreo.FPS).tailSpeed / 9);
const TAIL = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];

const addRot = (bone: BonePose | undefined, delta: number[]): BonePose => {
  const rot = bone?.rot ?? [0, 0, 0];
  return { ...bone, rot: rot.map((v, i) => v + (delta[i] ?? 0)) };
};

export const tweakRiders = (f: number) => (onerRiders: Riders): Riders => {
  const riders = landing.tweakRiders(choreo.toGlobalFrame(f))(onerRiders);
  const t = f / choreo.FPS;
  const ly = choreo.liyingTweak(t);
  const basePose = riders.liYing.poseOverride;
  const liYing: RideLiYing = {
    ...riders.liYing,
    嘴: mouthAt(choreo.lineCues, '李樱', f),
    poseOverride: (base: FigurePose) => {
      const pose = typeof basePose === 'function' ? basePose(base) : { ...base, ...basePose };
      return {
        ...pose,
        headYaw: pose.headYaw + ly.headYaw,
        headPitch: pose.headPitch + ly.headPitch,
        pitch: pose.pitch + ly.pitch,
        armR: pose.armR + ly.arm,
        armL: pose.armL + ly.arm,
        armRRoll: pose.armRRoll + ly.armRoll,
        armLRoll: pose.armLRoll + ly.armRoll,
      };
    },
  };
  const jh = choreo.jiuhuTweak(t);
  const bones = { ...(riders.jiuhu.boneOverrides ?? {}) };
  const φ = tailPhases[Math.min(tailPhases.length - 1, Math.max(0, f))];
  TAIL.forEach((boneName, i) => {
    bones[boneName] = { ...bones[boneName], rot: [0, Math.sin(φ - i * 0.6) * (i < 3 ? 8 : 5), 0] };
  });
  bones.AllBody = addRot(bones.AllBody, [0, jh.bodyYaw, 0]);
  bones.UpBody = addRot(bones.UpBody, [jh.lean, 0, jh.lean * 0.6]); // 往前、往左（李樱那边）探身
  bones.Head = addRot(bones.Head, jh.head);
  bones.Left_ear = addRot(bones.Left_ear, [jh.earFlick, 0, 0]);
  bones.Right_ear = addRot(bones.Right_ear, [jh.earFlick, 0, 0]);
  const baseOffset = riders.jiuhu.offset ?? [0, 0, 0];
  const jiuHu: RideJiuhu = { ...riders.jiuhu, 嘴: mouthAt(choreo.lineCues, '九胡', f), boneOverrides: bones, offset: [baseOffset[0] + jh.offset[0], baseOffset[1] + jh.offset[1], baseOffset[2] + jh.offset[2]] };
  return { ...riders, liYing: liYing, jiuhu: jiuHu };
};

export const AfterLandingView: React.FC<{ f: number; cam?: ReturnType<typeof choreo.camPose> }> = ({ f: frame, cam: camOverride }) => (
  <OnerFrame F={choreo.toGlobalFrame(frame)} cam={camOverride ?? choreo.camPose(frame)} tweakRiders={tweakRiders(frame)} extra={<LandingParticles F={choreo.toGlobalFrame(frame)} />} />
);

export const AfterLanding: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <AfterLandingView f={frame} />
      <AfterLandingSound />
    </AbsoluteFill>
  );
};
