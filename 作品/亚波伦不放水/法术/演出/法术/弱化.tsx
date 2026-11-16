// 弱化。出处 goety 2.5.60.6：WeakeningSpell、ShockwaveParticleOption、SpellSquareParticle。
// 半径 7（int），放出来当刻：
// - 粉色（LIGHT_PURPLE 0xFF55FF）冲击波环：施法者脚底 + 0.25 格，大小 7，速度 1（15 刻放完），淡出；
// - 施法者所在方块周围 [−7, 7)² 的每个格子 25% 概率在方块角上出一颗 SPELL_SQUARE（贴图 trail），颜色 = 粉色 × 0.5（count 0 时参数 × 速度 0.5），
//   往上飘（重力 −0.1），寿命 8～40 刻，透明度 1 − 年龄 ÷ 寿命。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的 SAPPED / 虚弱效果。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { hexColor } from '../零件/材质.ts';
import { ShockwaveRing } from '../零件/冲击波.tsx';
import { blockClass, defaultRadius } from '../零件/丁粒子.ts';
import { vanillaParticleInitSpeed, TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import meta from './弱化.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const pink = hexColor(0xff55ff);
const radiusCells = 7;

const weaken: React.FC<SpellPerformanceProps> = ({ sec: sec, from, seed: seed }) => {
  const footZ = from[2] - 0.5;
  const r = mulberry32(seed * 7919 + 3);
  const blockParticles: ParticleBirth[] = [];
  const bx = Math.floor(from[0]);
  const by = Math.floor(from[1]);
  for (let i = -radiusCells; i < radiusCells; i++) {
    for (let k = -radiusCells; k < radiusCells; k++) {
      if (r() > 0.25) continue;
      const color = [pink[0] * 0.5, pink[1] * 0.5, pink[2] * 0.5] as const;
      // SpellSquareParticle：super 收到 (0.5 − rand, 绿色参数, 0.5 − rand) 过一遍 Particle 的随机速度，竖直再 × 0.2；绿色参数非 0，水平不缩
      const rr = mulberry32(Math.floor(r() * 1e9));
      const [gx, gy, gz] = vanillaParticleInitSpeed(rr, 0.5 - rr(), color[1], 0.5 - rr());
      const speedVec: [number, number, number] = [gx, -gz, gy * 0.2];
      const radius = defaultRadius(rr);
      const lifetime = Math.floor(8 / (rr() * 0.8 + 0.2));
      const pos: Vec3 = [bx + i, by + k, footZ];
      blockParticles.push({ 刻: 0, 位: pos, 速: speedVec, 寿命: lifetime, radius: radius, seed: 1, 色: color });
    }
  }
  return (
    <>
      <ShockwaveRing 位={[from[0], from[1], footZ + 0.25]} 刻={sec * 20} size={radiusCells} 色={pink} 速={1} />
      <TexturedParticles type={blockClass} spawns={blockParticles} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, weaken);
