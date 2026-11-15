// 水柱。出处 goety 2.5.60.6：WaterJetSpell、WaterJetRenderer、WaterTrailParticle、TrailEffect、TrailRenderer。
// 持续施法：
// - 水柱（WaterJetRenderer）：从杖尖到目标半身高，两层方管，都是 magicBeam（半透明、不做深度测试、满亮度）：
//   里层 jet_inner 半边 0.04，贴图沿长度每 0.04 × 16 × 2 = 1.28 格铺一遍；外层 jet_outer 半边 0.05，每 12.8 格铺一遍；
//   贴图沿长度往前流：偏移 = −(刻) × 0.4（里层）、× 0.08（外层），连续的。
// - 水拖（WATER_TRAIL）：每刻在打中的点出 1 颗，速度每个分量 高斯 × 0.15 格/刻；重力 0.5（每刻 −0.02）、摩擦 0.99，落地就没；
//   画成一条沿走过的路往回拖的带子，总宽 0.06、最长 0.6 格，贴图 water_trail 头是 u1、尾是 u0，不透明粒子表。
// 和游戏的差别：水拖在游戏里侧对镜头，这里摆成十字两片；落地后带子在 1 刻内收掉，这里落地当刻就不画。
// 没做：目标被水柱往后推、灭火；循环声只登记了一次。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { sub, scaleVec, vecLength, mix } from '../零件/弹道.ts';
import { Band } from '../零件/束.tsx';
import { SquareTubeFaces, squareTubeFace } from '../零件/方管.tsx';
import { perpendicular } from '../零件/游带.tsx';
import meta, { waterPillarDurTicks, waterLandPoint } from './水柱.元.ts';
import jetInnerPng from 'asset:贴图/法术/goety/entity/water_jet/jet_inner';
import jetOuterPng from 'asset:贴图/法术/goety/entity/water_jet/jet_outer';
import waterTrailPng from 'asset:贴图/法术/goety/particle/water_trail';
import { mulberry32 } from '@engine/core/数学.ts';

const innerImg = png(jetInnerPng);
const outerPng = png(jetOuterPng);
const waterTrailImg = png(waterTrailPng);

/** 一颗水拖各刻末的位置（第 0 项 = 出生处），到落地为止 */
const waterDragPath = (startPoint: Vec3, seed: number, ground: number): Vec3[] => {
  const r = mulberry32(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  let v: Vec3 = [gaussian() * 0.15, gaussian() * 0.15, gaussian() * 0.15];
  let p = startPoint;
  const trail = [p];
  for (let k = 0; k < 200 && p[2] > ground; k++) {
    v = [v[0], v[1], v[2] - 0.04 * 0.5];
    p = [p[0] + v[0], p[1] + v[1], Math.max(ground, p[2] + v[2])];
    v = scaleVec(v, 0.99);
    trail.push(p);
  }
  return trail;
};

const WaterTrail: React.FC<{ 路: Vec3[]; age: number }> = ({ 路: trail, age }) => {
  // 游戏画上一刻到这一刻之间：年龄 a 时头在 路(a − 1)
  const a = age - 1;
  if (a <= 0 || a >= trail.length - 1) return null;
  const k = Math.floor(a);
  const points: Vec3[] = [mix(trail[k]!, trail[k + 1]!, a - k)];
  const progresses = [1];
  let remain = 0.6;
  for (let i = k; i >= 0 && remain > 0; i--) {
    const lastPoint = points[points.length - 1]!;
    const d = vecLength(sub(trail[i]!, lastPoint));
    if (d < 1e-6) continue;
    if (d >= remain) {
      points.push(mix(lastPoint, trail[i]!, remain / d));
      remain = 0;
    } else {
      points.push(trail[i]!);
      remain -= d;
    }
    progresses.push(remain / 0.6);
  }
  if (points.length < 2) return null;
  return (
    <>
      {perpendicular(sub(points[0]!, points[points.length - 1]!)).map((side, i) => (
        <Band key={i} points={points} halfWidthDir={scaleVec(side, 0.03)} 图={waterTrailImg} uValues={progresses} 混合="镂空" />
      ))}
    </>
  );
};

const WaterJet: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const landing = waterLandPoint(target);
  const fullLength = vecLength(sub(landing, from));
  const drops: number[] = [];
  for (let n = Math.max(0, Math.floor(tick) - 60); n <= Math.min(Math.floor(tick), waterPillarDurTicks - 1); n++) drops.push(n);
  return (
    <>
      {tick < waterPillarDurTicks && (
        <>
          <SquareTubeFaces quads={squareTubeFace(from, landing, 0.04, { alongAxis: 'u', lengthStart: -tick * 0.4, lengthEnd: fullLength / 1.28 - tick * 0.4 })} 图={innerImg} 混合="半透明" repeat noDepthTest 序={1} />
          <SquareTubeFaces quads={squareTubeFace(from, landing, 0.05, { alongAxis: 'u', lengthStart: -tick * 0.08, lengthEnd: fullLength / 12.8 - tick * 0.08 })} 图={outerPng} 混合="半透明" repeat noDepthTest 序={2} />
        </>
      )}
      {drops.map((n) => (
        <WaterTrail key={n} 路={waterDragPath(landing, seed * 7919 + n, target[2])} age={tick - n} />
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, WaterJet);
