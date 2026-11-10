// 炽燃升腾（配下界魔杖：第二圈火柱）。出处 goety 2.5.60.6：FlameStrikeSpell、FirePillar、BlockFinder.buildOuterBlockCircle、FireParticle（BIG_FIRE_GROUND）、FieryPillarParticle。
// 在目标周围放一圈火柱实体（FirePillar）：半径 3 的外圈（偏移 [−3,3)² 里 距离 ≤ 3 的格子，去掉 [−2,2)² 里 距离 ≤ 2 的），
// 配下界魔杖（rightStaff）再加半径 6 的外圈（[−6,6)² 去掉 [−5,5)²）。每根：
// - 预热 50 刻：每刻 1 颗 BIG_FIRE_GROUND 在柱位（水平 ±0.25 随机）、高 0.5 格，寿命 8 刻；
// - 预热完：每 5 刻 1 颗 FIERY_PILLAR 在柱位高 0.5 格，初速竖直 0.5 格/刻，半边长 1.0～1.5，寿命 10～29 刻，往上冲成一根火柱。
// 自己定的：预热完只放 60 刻（游戏里 180 刻）；柱子碰撞箱宽按 0.5 估。起点不用（火柱只看目标）。
// 没做：柱子周围每刻一圈 BURNING 粒子（CastSpellTrap.circularParticles）；目标着火、受伤。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 地火类, 大火寿命, 默认半径, 火柱类 } from '../零件/丁粒子.ts';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import 元, { 炽燃喷发刻, 炽燃预热刻 } from './炽燃升腾.元.ts';

/** buildBlockCircle：[−整半径, 整半径)² 里 x² + z² ≤ 半径² 的整数偏移 */
const 圆格 = (半径: number): [number, number][] => {
  const n = Math.floor(半径);
  const 们: [number, number][] = [];
  for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) if (x * x + z * z <= 半径 * 半径) 们.push([x, z]);
  return 们;
};
const 外圈 = (半径: number): [number, number][] => {
  const 内 = new Set(圆格(半径 - 1).map(([x, z]) => `${x},${z}`));
  return 圆格(半径).filter(([x, z]) => !内.has(`${x},${z}`));
};
const 偏移们 = [...外圈(3), ...外圈(6)];

const 炽燃升腾: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const r = rng(种子 * 7919 + 31);
  const 地火: 粒子出生[] = [];
  const 火柱: 粒子出生[] = [];
  for (const [dx, dz] of 偏移们) {
    // 游戏 (x, z 南) → 场景 (x, −z)
    const 柱: 点 = [目标[0] + dx, 目标[1] - dz, 目标[2]];
    for (let t = 0; t < 炽燃预热刻; t++) {
      地火.push({ 刻: t, 位: [柱[0] + (r() - 0.5) * 0.5, 柱[1] + (r() - 0.5) * 0.5, 柱[2] + 0.5], 速: [(r() - 0.5) * 0.01, (r() - 0.5) * 0.01, (r() - 0.5) * 0.01], 寿命: 大火寿命, 半径: 默认半径(r) * 3, 种子: 1 });
    }
    for (let t = 炽燃预热刻; t < 炽燃预热刻 + 炽燃喷发刻; t++) {
      if (t % 5 !== 0) continue;
      火柱.push({ 刻: t, 位: [柱[0], 柱[1], 柱[2] + 0.5], 速: [0, 0, 0.5], 寿命: 10 + Math.floor(r() * 20), 半径: 1, 种子: 1 });
    }
  }
  return (
    <>
      <贴图粒子 类={地火类} 出生们={地火} 秒={秒} />
      <贴图粒子 类={火柱类} 出生们={火柱} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 炽燃升腾);
