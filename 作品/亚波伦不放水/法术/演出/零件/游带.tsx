// Goety 两种程序画的带子粒子：聚流（GatherTrailParticle：一小段亮条从一头窜到另一头）和风带（WindTrailParticle 的子类：沿走过的位置拖一条竖着的带）。
// 出处 goety 2.5.60.6：GatherTrailParticle、WindTrailParticle、WindParticle、WindBlowParticle。
// 和游戏的差别：聚流在游戏里永远侧对镜头（宽向 = 条的方向 × 视线），组件拿不到镜头，这里摆成十字两片（半宽只有 0.03 格，看不出差别）；
// 风带的宽向游戏里是竖直向量绕 Z 轴转镜头的 yaw（镜头朝正南正北时就是竖直），这里一律竖直。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 加, 减, 乘, 长, 单位, 混 } from './弹道.ts';
import { 带 } from './束.tsx';
import type { 色 } from './材质.ts';
import 聚流图数据 from 'asset:贴图/法术/goety/particle/gather_trail';
import 风带图数据 from 'asset:贴图/法术/goety/particle/trail';

const 聚流图 = png(聚流图数据);
const 风带图 = png(风带图数据);

const 叉 = (a: 点, b: 点): 点 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 和 向 垂直的两个互相垂直的单位向量 */
export const 垂向 = (向: 点): [点, 点] => {
  const d = 单位(向);
  const 一 = 单位(叉(Math.abs(d[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1], d));
  return [一, 叉(d, 一)];
};

// Easing.IN_OUT_QUAD
const 缓入出 = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** GatherTrailParticle 的寿命：round(随机 × 3) + 5 刻 */
export const 聚流寿命 = (随机: number) => Math.round(随机 * 3) + 5;

/**
 * 聚流：亮条从 从 窜到 到。年龄（刻，带小数）在 [0, 寿命] 里画（游戏里年龄到寿命的下一刻才消失）。
 * 头 = 从 + 全程 × 缓(年龄比)；条长 = 全程 × 0.5 × (1 − 缓(|年龄比 − 0.5| × 2))，中途最长（半程），两头缩成 0；贴图 u 也跟着从 0 宽放到整张再收回。
 * 粒子表 PARTICLE_SHEET_LIT：不混合、alpha < 0.1 丢掉、满亮度。
 */
export const 聚流: React.FC<{ 从: 点; 到: 点; 年龄: number; 寿命: number; 色: 色 }> = ({ 从, 到, 年龄, 寿命, 色 }) => {
  if (年龄 < 0 || 年龄 > 寿命 + 1) return null;
  const t = Math.min(年龄, 寿命) / 寿命;
  const 全程 = 减(到, 从);
  const 收 = 缓入出(Math.abs(t - 0.5) * 2);
  const 头 = 加(从, 乘(全程, 缓入出(t)));
  let 尾 = 加(头, 乘(全程, 0.5 * (1 - 收)));
  if (长(减(尾, 从)) > 长(全程)) 尾 = 到;
  if (长(减(尾, 头)) < 1e-4) return null;
  const u1 = 1 - 收;
  return (
    <>
      {垂向(全程).map((侧, i) => (
        <带 key={i} 点们={[头, 尾]} 半宽向={乘(侧, 0.03)} 图={聚流图} u们={[0, u1]} 混合="镂空" 色={色} />
      ))}
    </>
  );
};

/**
 * 风带：粒子走过的位置连成的带。位置(k) = 第 k 刻末粒子在哪（k 整数，0 = 出生处）；年龄带小数。
 * 游戏每刻开头记下当时位置，画的时候从「上一刻到这一刻之间」往回取 段数 段：第 i 个点 = 位置在 年龄 − 1 − i 刻处（两刻之间线性插值）。
 * 贴图 particle/trail，u 从头 0 到尾 1，v 从上 0 到下 1；entityTranslucent、亮度 240。
 */
export const 风带: React.FC<{ 位置: (k: number) => 点; 年龄: number; 段数: number; 高: number; 色: 色; 透明度: number }> = ({ 位置, 年龄, 段数, 高, 色, 透明度 }) => {
  if (年龄 < 0 || 透明度 <= 0 || 高 <= 0) return null;
  const 在 = (a: number): 点 => {
    const c = Math.max(0, a);
    const k = Math.floor(c);
    return 混(位置(k), 位置(k + 1), c - k);
  };
  const 点们 = Array.from({ length: 段数 + 1 }, (_, i) => 在(年龄 - 1 - i));
  // 还没走出去（各点重合）时游戏里也是一条看不见的零长带
  if (长(减(点们[0]!, 点们[段数]!)) < 1e-4) return null;
  return <带 点们={点们} 半宽向={[0, 0, 高 / 2]} 图={风带图} 混合="半透明" 色={色} 透明度={透明度} />;
};
