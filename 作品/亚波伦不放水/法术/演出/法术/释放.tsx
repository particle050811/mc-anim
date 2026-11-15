// 释放。出处 goety 2.5.60.6：DischargeSpell、ShockwaveParticle、GroundCircleParticle、SphereExplodeParticle、SLightningPacket、ModRenderType.DRAGON_RAYS_QUADS。
// 以施法者为中心的一圈放电（不朝目标去），放出来的那一刻三样东西，颜色 16709015 = 0xFEF597：
// - 冲击波环（ShockwaveParticle）：施法者脚底 + 0.5 格处一张水平的方片（贴图 particle/shockwave，正反两面都画），
//   半边长 = 10 × clamp(年龄 ÷ 30 × 0.75, 0, 2)，30 刻里从 0 长到 7.5 格；透明度 1 − 年龄 ÷ 30；半透明粒子表、满亮度；
// - 球（SphereExplodeParticle，大小 = 法术半径 4，速度 1）：同一处一个纯色球，没有贴图，加色混合（lightning 着色器）、两面都画；
//   这个粒子每刻年龄 +2（自己加 1、父类再加 1），所以 30 的寿命 15 刻就走完，而且两刻之间不连续（一刻一跳）；
//   半径 = 4 × (0.5 + 0.5 × sin(年龄比 × π/2))，从 2 格到 4 格；透明度头 6 个年龄从 0 升到 1（1 − (1 − x)⁴），再 6 个年龄降回 0（(1 − x)³），之后看不见；
// - 16 道细电弧（shock 预设）：从施法者脚底到 脚底 + (随机 × [−4, 4] 的整数)（三个分量各抽），寿命 12 刻。
// 这里把 起点 当成球心（施法者脚底 + 0.5 格）。
// 没做：半径内的生物受击、雷雨天引下来的闪电、连锁电弧。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { GroundDecal } from '../零件/地面贴花.tsx';
import { hexColor, faceMaterial } from '../零件/材质.ts';
import meta, { releaseRingLifeTicks } from './释放.元.ts';
import shockwavePng from 'asset:贴图/法术/goety/particle/shockwave';

const ringImg = png(shockwavePng);
const electricYellow = hexColor(0xfef597);
const orbSize = 4;
const orbLifeTicks = 30;

const releaseSpell: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 种子: seed }) => {
  const tick = sec * 20;
  const feet: Vec3 = [from[0], from[1], from[2] - 0.5];
  // 球：年龄一刻跳 2
  const orbAge = Math.floor(tick) * 2 + (tick - Math.floor(tick));
  const fadeSeg = orbLifeTicks / 5;
  const orbAlpha = orbAge >= orbLifeTicks ? 0 : orbAge < fadeSeg ? 1 - (1 - orbAge / fadeSeg) ** 4 : (1 - Math.min(1, (orbAge - fadeSeg) / fadeSeg)) ** 3;
  const orbScale = orbSize * (0.5 + 0.5 * Math.sin(((orbAge / orbLifeTicks) * Math.PI) / 2));
  const r = rng(seed * 7919 + 13);
  const jitter = () => Math.floor(r() * 9) - 4;
  const arcs = Array.from({ length: 16 }, (): Vec3 => {
    // 游戏坐标的 (x, y, z) 偏移 → 场景 (x, −z, y)
    const [a, b, c] = [jitter(), jitter(), jitter()];
    const [dx, dy, dz] = [r() * a, r() * b, r() * c];
    return [feet[0] + dx, feet[1] - dz, feet[2] + dy];
  });
  return (
    <>
      {tick < releaseRingLifeTicks && <GroundDecal 位={from} 图={ringImg} radius={10 * Math.min(2, Math.max(0, (tick / releaseRingLifeTicks) * 0.75))} lift={0} 混合="半透明" 色={electricYellow} opacity={1 - tick / releaseRingLifeTicks} />}
      {orbAlpha > 0 && (
        <mesh position={[from[0], from[1], from[2]]} scale={orbScale} material={faceMaterial(null, { 混合: '加色', 色: electricYellow, opacity: orbAlpha })}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      )}
      {arcs.map((end, i) => (
        <ElectricArc key={i} 起={feet} end={end} settings={arcPresets.shock} 刻={tick} lifeTicks={12} 色={electricYellow} 种子={seed * 131 + i} />
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, releaseSpell);
