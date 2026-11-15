// 风爆（配下界魔杖：气浪里带火焰粒子）。出处 goety 2.5.60.6：WindBlastSpell、WindBlowParticle、WindTrailParticle；火焰是原版 FLAME。
// 放出来的那一刻：
// - 16 条白色气浪（WindBlowParticle）：出生在 口 + 高斯 ÷ 2（每个分量），速度 = 视线方向 × (1.1～2.2) 格/刻（基速 0.3 + 射程 8 ÷ 10），每刻 × 0.99，不受重力；
//   每条是一段竖着的带子：往回拖 1～4 刻走过的路，带高 随机 × 0.5 格，寿命 20～39 刻，透明度 1 − 年龄 ÷ 寿命。
// - 配下界魔杖：沿视线每隔 1 格放 1 颗原版火焰粒子，共 7 颗（i 从 1 到 射程 − 1）。
// 气浪很快（一两格每刻），一秒就飞出 20～40 格，会从目标身边穿过去，游戏里也是。
// 没做：目标被推开、着火。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, unitVec } from '../零件/弹道.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { WindBand } from '../零件/游带.tsx';
import meta from './风爆.元.ts';

const white: readonly [number, number, number] = [1, 1, 1];

const WindBlast: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const dir = unitVec(sub([target[0], target[1], target[2] + 0.9], from));
  const r = rng(seed * 7919 + 5);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const waves = Array.from({ length: 16 }, () => {
    const speedVec = scaleVec(dir, 1.1 + r() * 1.1);
    const spawnPoint: Vec3 = [from[0] + gaussian() / 2, from[1] + gaussian() / 2, from[2] + gaussian() / 2];
    const segCount = 1 + Math.floor(r() * 4);
    const height = r() * 0.5;
    const lifetime = 20 + Math.floor(r() * 20);
    // 第 k 刻末的位置：每刻先 × 0.99 再走
    const positionAt = (k: number): Vec3 => addVec(spawnPoint, scaleVec(speedVec, (0.99 * (1 - 0.99 ** k)) / 0.01));
    return { 位置: positionAt, 段数: segCount, 高: height, 寿命: lifetime };
  });
  const flames: ParticleSpawn[] = Array.from({ length: 7 }, (_, i) => {
    const p = addVec(from, scaleVec(dir, i + 1));
    return { 种: 'flame', 刻: 0, p: [p[0], p[1], p[2]], v: [0, 0, 0], 种子: seed * 101 + i };
  });
  return (
    <>
      {waves.map((windWave, i) => tick < windWave.寿命 && <WindBand key={i} 位置={windWave.位置} age={tick} 段数={windWave.段数} 高={windWave.高} 色={white} opacity={1 - Math.floor(tick) / windWave.寿命} />)}
      <VanillaParticles spawns={flames} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, WindBlast);
