// 从目标头顶的云里往下落的一群弹（纯）：箭雨、暴雪共用（流星雨的火球另算，见 meteor_shower.元.ts）。
// 游戏里：目标上方（最多 15 格）取一个中心，每颗生在 中心 + (±8, ±2, ±8) 的随机处，朝目标 shoot(速度 1.0 + 1.5 × 随机, 散布 20 + 随机 × 10)。
// Projectile.shoot 的散布：单位方向各分量加 triangle(0, 0.0172275 × 散布)，再乘速度。箭一类：阻力 0.99、重力 0.05，落地就没。
import { mulberry32 } from '@engine/core/数学.ts';
import type { 点 } from '../../接口.ts';
import { 减, 乘, 单位, 抛物线, type 弹道 } from '../弹道.ts';
import { 落地刻, 瞄点 } from './共用.ts';

export const 云高 = 15;
export interface 落雨弹 {
  出刻: number;
  生位: 点;
  道: 弹道;
  飞刻: number;
}

/** 每刻一颗，共 颗数 颗 */
export const 落雨 = (目标: 点, 颗数: number, 种子: number): 落雨弹[] => {
  const r = mulberry32(种子 * 83 + 13);
  const 幅 = (a: number) => (r() * 2 - 1) * a;
  return Array.from({ length: 颗数 }, (_, k) => {
    const 生位: 点 = [目标[0] + 幅(8), 目标[1] + 幅(8), 目标[2] + 云高 + 幅(2)];
    const 向 = 单位(减(瞄点(目标), 生位));
    const 散 = 0.0172275 * (20 + r() * 10);
    const 三角 = () => 散 * (r() - r());
    const 速 = 乘(单位([向[0] + 三角(), 向[1] + 三角(), 向[2] + 三角()]), 1.0 + 1.5 * r());
    const 道 = 抛物线(生位, 速, { 阻力: 0.99, 重力: 0.05 });
    return { 出刻: k, 生位, 道, 飞刻: 落地刻(道, 目标[2], 200) ?? 200 };
  });
};
