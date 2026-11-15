// 散射。出处 goety 2.5.60.6：ScatterSpell、ScatterMine、ScatterMineRenderer、ScatterMineModel、PulsatingCircleParticle、RedstoneExplodeParticle、BigElectricParticle。
// - 普通法杖：施法者正前、右、左各 4 格放一颗地雷（setIsSpell，贴图用 scatter_mine_glow_spell），落到地面。
// - 渲染器（没炸时）：mulPose(Y 90°)，scale(−s, −s, s)，translate(0, −1.45, 0)；s 头 2 刻是 1，之后从 3 每刻 −0.5 缩到 1.25。
//   底层 alpha 0.15（头 5 刻用发光贴图，之后用 scatter_mine）；再画一层 entityTranslucentEmissive 的发光贴图，alpha = getGlow（第 5 刻起每刻 −0.0045）。
// - 每刻 1 颗 BIG_ELECTRIC（位置在碰撞箱里随机）；20 刻后每 10 刻一圈贴地的 PulsatingCircle（寿命 30，半边长在 1～1.5 之间来回，每到头换一张 mine_pulse 贴图）。
// - 引爆：4 刻里 s 每刻 +3、发光 alpha 每刻 −0.1（itemEntityTranslucentCull）；createParticleBall(0.5, 2)：5×5×5 立方的外壳 98 颗 REDSTONE_EXPLODE
//   （RisingParticle，暗红 0.44/0.05/0.02，不透明，generic 随机一张）往外，速度约 0.5；外加 1 颗 BIG_ELECTRIC。
// 自己定的：引爆时刻（见 散射.元.ts）。粗做：地雷碰撞箱按 0.5 格估；REDSTONE_EXPLODE 出生时的随机扰动没照抄。
// 没做：有人踩才炸的触发；配风暴法杖的另一种放法（那一支不走这段代码）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { GroundDecal } from '../零件/地面贴花.tsx';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { TexturedParticles, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import meta, { minePositions, mineDetonateTick, mineSwellTicks } from './散射.元.ts';
import scatterMineModelData from 'asset:模型/法术/goety/ScatterMineModel';
import scatterMinePng from 'asset:贴图/法术/goety/entity/projectiles/scatter_mine';
import scatterMineGlowPng from 'asset:贴图/法术/goety/entity/projectiles/scatter_mine_glow_spell';
import minePulse1Png from 'asset:贴图/法术/goety/particle/mine_pulse';
import minePulse2Png from 'asset:贴图/法术/goety/particle/mine_pulse2';
import minePulse3Png from 'asset:贴图/法术/goety/particle/mine_pulse3';
import minePulse4Png from 'asset:贴图/法术/goety/particle/mine_pulse4';
import bigElectric1Png from 'asset:贴图/法术/goety/particle/big_electric_1';
import bigElectric2Png from 'asset:贴图/法术/goety/particle/big_electric_2';
import bigElectric3Png from 'asset:贴图/法术/goety/particle/big_electric_3';
import generic0Png from 'asset:贴图/特效/粒子/generic_0';
import generic1Png from 'asset:贴图/特效/粒子/generic_1';
import generic2Png from 'asset:贴图/特效/粒子/generic_2';
import generic3Png from 'asset:贴图/特效/粒子/generic_3';
import generic4Png from 'asset:贴图/特效/粒子/generic_4';
import generic5Png from 'asset:贴图/特效/粒子/generic_5';
import generic6Png from 'asset:贴图/特效/粒子/generic_6';
import generic7Png from 'asset:贴图/特效/粒子/generic_7';
import { mulberry32 } from '@engine/core/数学.ts';

const scatterMineModel = getModel(scatterMineModelData, 'ScatterMineModel');
const pulseFrames = [minePulse1Png, minePulse2Png, minePulse3Png, minePulse4Png].map(png);
const sparkParticleClass: ParticleClass = { 帧: [bigElectric1Png, bigElectric2Png, bigElectric3Png].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96, 色: [1, 0.9, 1] };
const redBurstParticleClass: ParticleClass = { 帧: [generic7Png, generic6Png, generic5Png, generic4Png, generic3Png, generic2Png, generic1Png, generic0Png].map(png), 选帧: '随机', 摩擦: 0.96, 色: [0.44, 0.05, 0.02], 大小: (age, lifetime) => 1 - (age / lifetime) ** 2 * 0.5 };

const scatter: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const wholeTick = Math.floor(tick);
  const positions = minePositions(from, target);
  const sparks: ParticleBirth[] = [];
  const redBurst: ParticleBirth[] = [];
  positions.forEach((pos, i) => {
    const r = mulberry32(seed * 311 + i);
    for (let t = 0; t < Math.min(mineDetonateTick, tick); t++)
      sparks.push({
        刻: t,
        位: [pos[0] + (r() - 0.5) * 0.5, pos[1] + (r() - 0.5) * 0.5, pos[2] + r() * 0.5],
        速: [(-0.05 + r() * 0.05) * 0.25, (-0.05 + r() * 0.05) * 0.25, (-0.05 + r() * 0.05) * 0.25],
        寿命: 2 + Math.floor(r() * 2),
        radius: 0.1 * (r() * 0.5 + 0.5) * 2 * 2,
        种子: t,
      });
    sparks.push({ 刻: mineDetonateTick, 位: pos, 速: [0.25, 0, 0], 寿命: 2 + Math.floor(r() * 2), radius: 0.1 * (r() * 0.5 + 0.5) * 4, 种子: 999 });
    let n = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++) {
          if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) < 2) continue;
          const d = [b + (r() - r()) * 0.5, c + (r() - r()) * 0.5, a + (r() - r()) * 0.5] as const;
          const scaledLength = Math.hypot(d[0], d[1], d[2]) / 0.5;
          redBurst.push({ 刻: mineDetonateTick, 位: pos, 速: [d[0] / scaledLength, d[1] / scaledLength, d[2] / scaledLength], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)) + 4, radius: 0.1 * (r() * 0.5 + 0.5) * 2, 种子: i * 200 + n++ });
        }
  });
  return (
    <>
      {positions.map((pos, i) => {
        if (tick >= mineDetonateTick + mineSwellTicks) return null;
        const detonated = tick >= mineDetonateTick;
        const baseSize = wholeTick < 3 ? 1 : Math.max(1.25, 3 - 0.5 * (wholeTick - 2));
        const s = detonated ? baseSize + 3 * (wholeTick - mineDetonateTick + 1) : baseSize;
        const brightnessFade = Math.max(0, 1 - 0.0045 * Math.max(0, Math.min(wholeTick, mineDetonateTick) - 5) - (detonated ? 0.1 * (wholeTick - mineDetonateTick + 1) : 0));
        return (
          <MinecraftSpace key={i} 位={pos}>
            <group rotation={[0, degToRad(90), 0]}>
              <group scale={[-s, -s, s]}>
                <group position={[0, -1.45, 0]}>
                  {!detonated && <ModelPart 模型={scatterMineModel} 图={png(wholeTick < 5 ? scatterMineGlowPng : scatterMinePng)} 画法="半透明" opacity={0.15} />}
                  <ModelPart 模型={scatterMineModel} 图={png(scatterMineGlowPng)} 画法="半透明" opacity={brightnessFade} />
                </group>
              </group>
            </group>
          </MinecraftSpace>
        );
      })}
      {positions.flatMap((pos, i) =>
        Array.from({ length: Math.max(0, Math.floor((Math.min(tick, mineDetonateTick) - 20) / 10) + 1) }, (_, k) => {
          const age = wholeTick - (20 + k * 10);
          if (age < 1 || age >= 30 || tick >= mineDetonateTick) return null;
          const radius = 1 + 0.1 * Math.abs(((age - 1) % 10) - 5);
          const frameIndex = Math.floor(mulberry32(seed * 7 + i * 100 + k * 10 + Math.floor((age - 1) / 5))() * 4);
          return <GroundDecal key={`${i}-${k}`} 位={pos} 图={pulseFrames[frameIndex]!} radius={radius} lift={0.05 + k * 0.001} />;
        }),
      )}
      <TexturedParticles 类={sparkParticleClass} spawns={sparks} 秒={sec} />
      <TexturedParticles 类={redBurstParticleClass} spawns={redBurst} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, scatter);
