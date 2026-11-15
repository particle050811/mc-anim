// 不死图腾触发时人身上冒的粒子（第三人称能看到的那部分），照原版 1.20.1（SRG 客户端 jar，javap 读的常数）：
// - 发射：实体事件 35 → ParticleEngine.createTrackingEmitter(人, TOTEM_OF_UNDYING, 30)。TrackingEmitter 建出来当刻放一次，之后每刻一次，共 30 次；
//   每次试 16 颗：d0、d1、d2 各取 −1～1，落在单位球外的不要（留下约一半）；位置 = (x + 宽·d0/4, y + 高·(0.5 + d1/4), z + 宽·d2/4)，速度 = (d0, d1 + 0.2, d2) 格/刻。
// - 粒子：TotemParticle（SimpleAnimatedParticle）：重力 1.25、摩擦 0.6、碰方块会停，大小 = 0.1 × (随机 × 0.5 + 0.5) × 2 × 0.75，活 60～71 刻；
//   四分之一是黄的 (0.6 + r × 0.2, 0.6 + r × 0.3, r × 0.2)，其余绿的 (0.1 + r × 0.2, 0.4 + r × 0.3, r × 0.2)；
//   过了一半寿命开始变淡：alpha = 1 − (age − 寿命/2) ÷ 寿命；贴图按 age 从 glitter_7 换到 glitter_0（particles/totem_of_undying.json 的顺序，越来越小）；满亮度，半透明。
// 第一人称屏幕上翻转的图腾（GameRenderer.displayItemActivation）不在这里；触发后的药水效果粒子也没做。
// 坐标：场景（Z 朝上，格）。
import React, { useMemo } from 'react';
import { type V3 } from '@engine/model/parts.tsx';
import { interpPathPos, type Particle, particlePath, ParticlePhysics, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import { mulberry32 } from '@engine/core/数学.ts';

export const totemEmitTicks = 30;

type TotemParticle = { spawnTick: number; 路: V3[]; halfSize: number; lifeTicks: number; 色: [number, number, number] };

/** 一次图腾触发的全部粒子。脚底：人的脚底中心；宽、高：碰撞箱（玩家 0.6、1.8）；地面：粒子落到这个高度停住，不给 = 不停 */
export const totemParticleTable = (feet: V3, seed: number, options: { 宽?: number; 高?: number; ground?: number } = {}): TotemParticle[] => {
  const { 宽: width = 0.6, 高: height = 1.8, ground } = options;
  const rand = mulberry32(seed * 48271 + 35);
  const particles: TotemParticle[] = [];
  for (let emitTick = 0; emitTick < totemEmitTicks; emitTick++) {
    for (let i = 0; i < 16; i++) {
      const d0 = rand() * 2 - 1;
      const d1 = rand() * 2 - 1;
      const d2 = rand() * 2 - 1;
      if (d0 * d0 + d1 * d1 + d2 * d2 > 1) continue;
      const lifeTicks = 60 + Math.floor(rand() * 12);
      const halfSize = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const color: [number, number, number] = rand() < 0.25 ? [0.6 + rand() * 0.2, 0.6 + rand() * 0.3, rand() * 0.2] : [0.1 + rand() * 0.2, 0.4 + rand() * 0.3, rand() * 0.2];
      // 游戏 y 朝上 → 场景 z
      const p: V3 = [feet[0] + (width * d0) / 4, feet[1] + (width * d2) / 4, feet[2] + height * (0.5 + d1 / 4)];
      const trail = particlePath(p, [d0, d2, d1 + 0.2], lifeTicks, new ParticlePhysics(1.25, 0.6, ground));
      particles.push({ spawnTick: emitTick, 路: trail, halfSize, lifeTicks, 色: color });
    }
  }
  return particles;
};

/** 距触发 秒 秒时的粒子（秒 < 0 不画）。表 用 图腾粒子表 算一次，别每帧重算 */
export const TotemParticles: React.FC<{ 表: readonly TotemParticle[]; 秒: number }> = ({ 表: particleTable, 秒: sec }) => {
  const items = useMemo(() => {
    const tick = sec * 20;
    const out: Particle[] = [];
    if (tick < 0) return out;
    for (const particle of particleTable) {
      const τ = tick - particle.spawnTick;
      if (τ < 0) continue;
      const age = Math.floor(τ);
      if (age >= particle.lifeTicks) continue;
      const frame = Math.min(7, Math.floor((age * 7) / particle.lifeTicks));
      out.push({
        p: interpPathPos(particle.路, τ),
        half: particle.halfSize,
        uv: vanillaParticleAtlas.uv[`glitter_${7 - frame}`]!,
        color: particle.色,
        alpha: age > particle.lifeTicks / 2 ? 1 - (age - particle.lifeTicks / 2) / particle.lifeTicks : 1,
      });
    }
    return out;
  }, [particleTable, sec]);
  return <ParticleQuads tex={vanillaParticleAtlas.tex} items={items} translucent depthWrite={false} />;
};
