// 原版火球一类（AbstractHurtingProjectile）的弹道表（纯）：火球术、熔岩炸弹、轰击、流星雨共用。
// 配下界魔杖（NetherStaff）多放 2 颗：起点的 x、z 各加一个高斯（σ = 1 格），方向和中间那颗一样（平行飞，不朝目标收拢）。
import { mulberry32 } from '@engine/core/数学.ts';
import type { 点 } from '../../接口.ts';
import { 减, 火球道, type 弹道 } from '../弹道.ts';
import { 终刻, 瞄点, 高斯 } from './共用.ts';

export interface 火球弹 {
  /** 出手后第几刻生出来 */
  出刻: number;
  道: 弹道;
  /** 生出来后飞几刻没（碰到人或落地） */
  飞刻: number;
}

/** 一发：中间一颗朝史蒂夫胸口，带 多颗 时两边各一颗（偏移用 种子） */
export const 火球一发 = (起: 点, 目标: 点, 出刻: number, 选: { 惯性?: number; 多颗?: number; 种子?: number; 命中半径?: number } = {}): 火球弹[] => {
  const 朝 = 减(瞄点(目标), 起);
  const r = mulberry32((选.种子 ?? 0) * 31 + 7);
  return Array.from({ length: 1 + (选.多颗 ?? 0) }, (_, i) => {
    const 生: 点 = i === 0 ? 起 : [起[0] + 高斯(r), 起[1] + 高斯(r), 起[2]];
    const 道 = 火球道(生, 朝, { 惯性: 选.惯性 ?? 0.95 });
    return { 出刻, 道, 飞刻: 终刻(道, 目标, 选.命中半径 ?? 0.5) };
  });
};
