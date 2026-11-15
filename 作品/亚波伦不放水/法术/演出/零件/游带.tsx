// Goety 两种程序画的带子粒子：聚流（GatherTrailParticle：一小段亮条从一头窜到另一头）和风带（WindTrailParticle 的子类：沿走过的位置拖一条竖着的带）。
// 出处 goety 2.5.60.6：GatherTrailParticle、WindTrailParticle、WindParticle、WindBlowParticle。
// 和游戏的差别：聚流在游戏里永远侧对镜头（宽向 = 条的方向 × 视线），组件拿不到镜头，这里摆成十字两片（半宽只有 0.03 格，看不出差别）；
// 风带的宽向游戏里是竖直向量绕 Z 轴转镜头的 yaw（镜头朝正南正北时就是竖直），这里一律竖直。
import React from 'react';
import { easeInOutQuad } from '@engine/core/数学.ts';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, vecLength, unitVec, mix } from './弹道.ts';
import { Band } from './束.tsx';
import type { RgbColor } from './材质.ts';
import gatherTrailPng from 'asset:贴图/法术/goety/particle/gather_trail';
import windTrailPng from 'asset:贴图/法术/goety/particle/trail';

const gatherStreamPng = png(gatherTrailPng);
const windBandPng = png(windTrailPng);

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 和 向 垂直的两个互相垂直的单位向量 */
export const perpendicular = (dir: Vec3): [Vec3, Vec3] => {
  const d = unitVec(dir);
  const normal = unitVec(cross(Math.abs(d[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1], d));
  return [normal, cross(d, normal)];
};

// Goety 的 Easing.IN_OUT_QUAD
const easeInOut = easeInOutQuad;

/** GatherTrailParticle 的寿命：round(随机 × 3) + 5 刻 */
export const gatherLifetime = (rand: number) => Math.round(rand * 3) + 5;

/**
 * 聚流：亮条从 从 窜到 到。年龄（刻，带小数）在 [0, 寿命] 里画（游戏里年龄到寿命的下一刻才消失）。
 * 头 = 从 + 全程 × 缓(年龄比)；条长 = 全程 × 0.5 × (1 − 缓(|年龄比 − 0.5| × 2))，中途最长（半程），两头缩成 0；贴图 u 也跟着从 0 宽放到整张再收回。
 * 粒子表 PARTICLE_SHEET_LIT：不混合、alpha < 0.1 丢掉、满亮度。
 */
export const GatherStream: React.FC<{ 从: Vec3; 到: Vec3; age: number; 寿命: number; 色: RgbColor }> = ({ 从: from, 到: to, age, 寿命: lifetime, 色: color }) => {
  if (age < 0 || age > lifetime + 1) return null;
  const t = Math.min(age, lifetime) / lifetime;
  const fullSpan = sub(to, from);
  const eased = easeInOut(Math.abs(t - 0.5) * 2);
  const streamHead = addVec(from, scaleVec(fullSpan, easeInOut(t)));
  let tail = addVec(streamHead, scaleVec(fullSpan, 0.5 * (1 - eased)));
  if (vecLength(sub(tail, from)) > vecLength(fullSpan)) tail = to;
  if (vecLength(sub(tail, streamHead)) < 1e-4) return null;
  const u1 = 1 - eased;
  return (
    <>
      {perpendicular(fullSpan).map((side, i) => (
        <Band key={i} points={[streamHead, tail]} halfWidthDir={scaleVec(side, 0.03)} 图={gatherStreamPng} uValues={[0, u1]} 混合="镂空" 色={color} />
      ))}
    </>
  );
};

/**
 * 风带：粒子走过的位置连成的带。位置(k) = 第 k 刻末粒子在哪（k 整数，0 = 出生处）；年龄带小数。
 * 游戏每刻开头记下当时位置，画的时候从「上一刻到这一刻之间」往回取 段数 段：第 i 个点 = 位置在 年龄 − 1 − i 刻处（两刻之间线性插值）。
 * 贴图 particle/trail，u 从头 0 到尾 1，v 从上 0 到下 1；entityTranslucent、亮度 240。
 */
export const WindBand: React.FC<{ 位置: (k: number) => Vec3; age: number; 段数: number; 高: number; 色: RgbColor; opacity: number }> = ({ 位置: positionAt, age, 段数: segCount, 高: height, 色: color, opacity }) => {
  if (age < 0 || opacity <= 0 || height <= 0) return null;
  const posAt = (a: number): Vec3 => {
    const c = Math.max(0, a);
    const k = Math.floor(c);
    return mix(positionAt(k), positionAt(k + 1), c - k);
  };
  const points = Array.from({ length: segCount + 1 }, (_, i) => posAt(age - 1 - i));
  // 还没走出去（各点重合）时游戏里也是一条看不见的零长带
  if (vecLength(sub(points[0]!, points[segCount]!)) < 1e-4) return null;
  return <Band points={points} halfWidthDir={[0, 0, height / 2]} 图={windBandPng} 混合="半透明" 色={color} opacity={opacity} />;
};
