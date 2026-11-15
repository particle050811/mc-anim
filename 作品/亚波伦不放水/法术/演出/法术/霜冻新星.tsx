// 霜冻新星。出处 goety 2.5.60.6：FrostNovaSpell、ServerParticleUtil 同款的 createParticleBall、ShockwaveParticleOption、原版 FlameParticle.Provider（FROST_NOVA 用霜的贴图）。
// 半径 3.5（取整 3），放出来当刻：
// - 施法者脚底 + 0.5 格一圈白色冲击波环：originSize 0、大小 7（半径 × 2）、速度 1（15 刻放完），淡出；
// - 施法者脚底处，7×7×7 立方的外壳（218 个点）每点一颗 FROST_NOVA，初速 = 抖动后的方向 ÷ |方向| × 0.25 格/刻，摩擦 0.96，往四面八方炸开。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的冻伤。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ShockwaveRing } from '../零件/冲击波.tsx';
import { defaultRadius, risingInitial, frostNovaClass } from '../零件/丁粒子.ts';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import meta from './霜冻新星.元.ts';

const radiusCells = 3;

const FrostNova: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 种子: seed }) => {
  const feet: Vec3 = [from[0], from[1], from[2] - 0.5];
  const r = rng(seed * 7919 + 11);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const frosts: ParticleBirth[] = [];
  for (let i = -radiusCells; i <= radiusCells; i++) {
    for (let j = -radiusCells; j <= radiusCells; j++) {
      // 内部的点只留 k = ±半径（游戏里 k += 2 × 半径 − 1 跳过中间）
      const isShell = i === -radiusCells || i === radiusCells || j === -radiusCells || j === radiusCells;
      const ks: number[] = isShell ? Array.from({ length: 2 * radiusCells + 1 }, (_, n) => n - radiusCells) : [-radiusCells, radiusCells];
      for (const k of ks) {
        const d3 = j + (r() - r()) * 0.5;
        const d4 = i + (r() - r()) * 0.5;
        const d5 = k + (r() - r()) * 0.5;
        const d6 = Math.hypot(d3, d4, d5) / 0.5 + gaussian() * 0.05;
        // 游戏 (d3, d4 竖直, d5 南) → 场景 (x, −z, y)；速度参数 × 0.5
        const givenPoint: Vec3 = [(d3 / d6) * 0.5, (-d5 / d6) * 0.5, (d4 / d6) * 0.5];
        const rr = rng(Math.floor(r() * 1e9));
        const initial = risingInitial(Math.floor(r() * 1e9), feet, givenPoint);
        frosts.push({ 刻: 0, 位: initial.位, 速: initial.速, 寿命: Math.floor(8 / (rr() * 0.8 + 0.2)) + 4, radius: defaultRadius(rr), 种子: initial.种子 });
      }
    }
  }
  return (
    <>
      <ShockwaveRing 位={from} 刻={sec * 20} 大小={radiusCells * 2 + 1} 色={[1, 1, 1]} 速={1} />
      <TexturedParticles 类={frostNovaClass} spawns={frosts} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, FrostNova);
