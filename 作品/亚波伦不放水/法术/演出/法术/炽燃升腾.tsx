// 炽燃升腾（配下界魔杖：第二圈火柱）。出处 goety 2.5.60.6：FlameStrikeSpell、FirePillar、BlockFinder.buildOuterBlockCircle、FireParticle（BIG_FIRE_GROUND）、FieryPillarParticle。
// 在目标周围放一圈火柱实体（FirePillar）：半径 3 的外圈（偏移 [−3,3)² 里 距离 ≤ 3 的格子，去掉 [−2,2)² 里 距离 ≤ 2 的），
// 配下界魔杖（rightStaff）再加半径 6 的外圈（[−6,6)² 去掉 [−5,5)²）。每根：
// - 预热 50 刻：每刻 1 颗 BIG_FIRE_GROUND 在柱位（水平 ±0.25 随机）、高 0.5 格，寿命 8 刻；
// - 预热完：每 5 刻 1 颗 FIERY_PILLAR 在柱位高 0.5 格，初速竖直 0.5 格/刻，半边长 1.0～1.5，寿命 10～29 刻，往上冲成一根火柱。
// 自己定的：预热完只放 60 刻（游戏里 180 刻）；柱子碰撞箱宽按 0.5 估。起点不用（火柱只看目标）。
// - 柱子存在期间（预热 + 喷发）每刻在柱位半径 1 的圆盘里撒 ceil(π·1²)=4 颗 BURNING（CastSpellTrap.circularParticles，贴地，岩浆贴图的小火苗），
//   所以柱子底下一直有火，火柱是从地面连着往上的。
// 没做：目标着火、受伤。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { groundFireClass, bigFireLifetime, burningClass, defaultRadius, fieryPillarClass } from '../零件/丁粒子.ts';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import meta, { blazeEruptTick, blazeWarmupTick } from './炽燃升腾.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

/** buildBlockCircle：[−整半径, 整半径)² 里 x² + z² ≤ 半径² 的整数偏移 */
const circleCells = (radius: number): [number, number][] => {
  const n = Math.floor(radius);
  const cells: [number, number][] = [];
  for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) if (x * x + z * z <= radius * radius) cells.push([x, z]);
  return cells;
};
const ringCells = (radius: number): [number, number][] => {
  const innerCells = new Set(circleCells(radius - 1).map(([x, z]) => `${x},${z}`));
  return circleCells(radius).filter(([x, z]) => !innerCells.has(`${x},${z}`));
};
const offsets = [...ringCells(3), ...ringCells(6)];

const BlazeRise: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => {
  const r = mulberry32(seed * 7919 + 31);
  const pillarEmbers: ParticleBirth[] = [];
  const flameColumn: ParticleBirth[] = [];
  const groundFlames: ParticleBirth[] = [];
  for (const [dx, dz] of offsets) {
    // 游戏 (x, z 南) → 场景 (x, −z)
    const pillarBase: Vec3 = [target[0] + dx, target[1] - dz, target[2]];
    for (let t = 0; t < blazeWarmupTick; t++) {
      pillarEmbers.push({ 刻: t, 位: [pillarBase[0] + (r() - 0.5) * 0.5, pillarBase[1] + (r() - 0.5) * 0.5, pillarBase[2] + 0.5], 速: [(r() - 0.5) * 0.01, (r() - 0.5) * 0.01, (r() - 0.5) * 0.01], 寿命: bigFireLifetime, radius: defaultRadius(r) * 3, seed: 1 });
    }
    for (let t = 0; t < blazeWarmupTick + blazeEruptTick; t++) {
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r());
        const lifetime = Math.floor(8 / (r() * 0.8 + 0.2)) + 4;
        groundFlames.push({ 刻: t, 位: [pillarBase[0] + Math.cos(a) * d, pillarBase[1] + Math.sin(a) * d, pillarBase[2]], 速: [(r() - 0.5) * 0.01, (r() - 0.5) * 0.01, (r() - 0.5) * 0.01], 寿命: lifetime, radius: 0.1 * (r() * 0.5 + 0.5) * 2, seed: 1 });
      }
    }
    for (let t = blazeWarmupTick; t < blazeWarmupTick + blazeEruptTick; t++) {
      if (t % 5 !== 0) continue;
      flameColumn.push({ 刻: t, 位: [pillarBase[0], pillarBase[1], pillarBase[2] + 0.5], 速: [0, 0, 0.5], 寿命: 10 + Math.floor(r() * 20), radius: 1, seed: 1 });
    }
  }
  return (
    <>
      <TexturedParticles type={groundFireClass} spawns={pillarEmbers} sec={sec} />
      <TexturedParticles type={burningClass} spawns={groundFlames} sec={sec} />
      <TexturedParticles type={fieryPillarClass} spawns={flameColumn} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, BlazeRise);
