// 卫射。出处 goety 2.5.60.6：PrismaBeamSpell、PrismaBeamRenderer（照原版 GuardianRenderer 的激光改的）；原版 1.20.1 BubbleParticle。
// - 激光：蓄力的 80 刻里一直画，贴图是原版 entity/guardian_beam，entityCutoutNoCull、满亮度。
//   两片交叉的面（半宽 0.2），绕轴线慢转：角 = −刻 × 0.075；长 = 距离 + 1（多伸出 1 格）；
//   贴图取左半张（u 0～0.4999），v 从 −1 + frac(刻 × 0.5) 到 长 × 2.5 + 那个数；
//   颜色随进度 f = 刻 ÷ 80 由紫变黄白：R = 64 + f² × 191，G = 32 + f² × 191，B = 128 − f² × 64；
//   末端一个方盖（对角半径 0.282），贴图取右半张的上半或下半（偶数刻取下半）。
// - 气泡：每刻沿线撒原版 BUBBLE，间隔 1.8 − f + 随机 × (1.7 − f)，越到后面越密。原版气泡不在水里的下一刻就消失，所以每颗只闪 1 刻。
// 没做：照满时的伤害没有另外的画面（游戏里也没有）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, vecLength, unitVec } from '../零件/弹道.ts';
import { Beam } from '../零件/束.tsx';
import { facePatch, QuadGroup, type QuadItem } from '../零件/面片.tsx';
import { SquareTubeFaces, axisFrame } from '../零件/方管.tsx';
import type { RgbColor } from '../零件/材质.ts';
import meta, { guardLightTick, guardLandPoint } from './卫射.元.ts';
import guardianBeamPng from 'asset:贴图/法术/minecraft/entity/guardian_beam';
import bubblePng from 'asset:贴图/法术/minecraft/particle/bubble';
import { mulberry32 } from '@engine/core/数学.ts';

const laserPng = png(guardianBeamPng);
const bubbleImg = png(bubblePng);

const GuardianRay: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const chargeUpTick = guardLightTick(options);
  if (tick >= chargeUpTick) return null;
  const landing = guardLandPoint(target);
  const dir = unitVec(sub(landing, from));
  const distance = vecLength(sub(landing, from));
  const beamLength = distance + 1;
  const end = addVec(from, scaleVec(dir, beamLength));
  const f = tick / chargeUpTick;
  const color: RgbColor = [(64 + Math.floor(f * f * 191)) / 255, (32 + Math.floor(f * f * 191)) / 255, (128 - Math.floor(f * f * 64)) / 255];
  const angleRad = -tick * 0.075;
  const v0 = -1 + ((tick * 0.5) % 1);
  // 末端方盖：四个角在 转 + 45°、135°、225°、315°，半径 0.282
  const { right, 上: up } = axisFrame(dir);
  const ringPoint = (a: number): Vec3 => addVec(end, addVec(scaleVec(right, Math.cos(angleRad + a) * 0.282), scaleVec(up, Math.sin(angleRad + a) * 0.282)));
  const uvHalfV = Math.floor(tick) % 2 === 0 ? 0.5 : 0;
  const q = Math.PI / 4;
  // 气泡：这一刻撒的（只活到下一刻）
  const n = Math.floor(tick);
  const r = mulberry32(seed * 7919 + n);
  const d5 = n / chargeUpTick;
  const bubbles: QuadItem[] = [];
  for (let d4 = r(); d4 < distance; ) {
    d4 += 1.8 - d5 + r() * (1.7 - d5);
    // quadSize = 0.1 × (随机 × 0.5 + 0.5) × 2，BubbleParticle 再 × (随机 × 0.6 + 0.2)
    bubbles.push(facePatch(addVec(from, scaleVec(dir, d4)), 0.1 * (r() * 0.5 + 0.5) * 2 * (r() * 0.6 + 0.2)));
  }
  return (
    <>
      <Beam 起={from} end={end} 图={laserPng} 半宽={0.2} planeCount={2} angleRad={angleRad} u={[0, 0.4999]} vStart={v0} vEnd={beamLength * 2.5 + v0} 混合="镂空" repeat 色={color} />
      <SquareTubeFaces
        quads={[{ 点: [ringPoint(3 * q), ringPoint(q), ringPoint(7 * q), ringPoint(5 * q)], uv: [[0.5, uvHalfV + 0.5], [1, uvHalfV + 0.5], [1, uvHalfV], [0.5, uvHalfV]] }]}
        图={laserPng}
        混合="镂空"
        repeat
        色={color}
      />
      <QuadGroup 图={bubbleImg} 项={bubbles} 混合="镂空" />
    </>
  );
};

export default defineSpellPerformance(meta, GuardianRay);
