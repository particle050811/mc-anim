// 冲刺。出处 goety 2.5.60.6：BoltingSpell、BoltingDashTask、ElectricExplosionParticle、BigElectricParticle、WindParticle、原版 GlowParticle.ElectricSparkProvider。
// 施法者沿视线冲出去（力度 2.5 格/刻，最多 20 刻，撞到东西就停），放出来当刻和冲刺中：
// - 4 条黄色（0xFFFF55）风带绕着施法者转：宽 2，高 (2×随机−1)×0.5，跟着施法者走；
// - 1 个 ELECTRIC_EXPLODE（黄色、半边长 2、寿命 6～9 刻，贴图 circle_explode 按年龄，朝镜头）在施法者半身高；
// - 冲刺的每一刻：2 颗 BIG_ELECTRIC 在施法者碰撞箱里随机出，5 颗 ELECTRIC 在施法者半身高、几乎不动。
// 这里把 起点 当成施法者半身（脚底 = 起点 − 0.5 格），朝目标半身高冲，停在离目标 1.5 格处。
// 自己定的/粗做的：ELECTRIC（原版 ElectricSparkProvider）寿命、大小没逐行核，按 5～12 刻、半边长 0.1～0.2 画；冲刺的空气阻力、
// 施法者自己的旋转冲刺姿势没做（那是施法者身上的东西）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, scaleVec, unitVec, vecLength } from '../零件/弹道.ts';
import { hexColor } from '../零件/材质.ts';
import { WindParticles, type WindBirth } from '../零件/丁风.tsx';
import { defaultRadius } from '../零件/丁粒子.ts';
import { TexturedParticles, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import meta from './冲刺.元.ts';
import electric1Png from 'asset:贴图/法术/goety/particle/electric_1';
import electric2Png from 'asset:贴图/法术/goety/particle/electric_2';
import electric3Png from 'asset:贴图/法术/goety/particle/electric_3';
import electric4Png from 'asset:贴图/法术/goety/particle/electric_4';
import electric5Png from 'asset:贴图/法术/goety/particle/electric_5';
import electric6Png from 'asset:贴图/法术/goety/particle/electric_6';
import electric7Png from 'asset:贴图/法术/goety/particle/electric_7';
import electric8Png from 'asset:贴图/法术/goety/particle/electric_8';
import electric9Png from 'asset:贴图/法术/goety/particle/electric_9';
import electric10Png from 'asset:贴图/法术/goety/particle/electric_10';
import electric11Png from 'asset:贴图/法术/goety/particle/electric_11';
import electric12Png from 'asset:贴图/法术/goety/particle/electric_12';
import electric13Png from 'asset:贴图/法术/goety/particle/electric_13';
import electric14Png from 'asset:贴图/法术/goety/particle/electric_14';
import electric15Png from 'asset:贴图/法术/goety/particle/electric_15';
import electric16Png from 'asset:贴图/法术/goety/particle/electric_16';
import circleExplode1Png from 'asset:贴图/法术/goety/particle/circle_explode1';
import circleExplode2Png from 'asset:贴图/法术/goety/particle/circle_explode2';
import circleExplode3Png from 'asset:贴图/法术/goety/particle/circle_explode3';
import circleExplode4Png from 'asset:贴图/法术/goety/particle/circle_explode4';
import circleExplode5Png from 'asset:贴图/法术/goety/particle/circle_explode5';
import circleExplode6Png from 'asset:贴图/法术/goety/particle/circle_explode6';
import circleExplode7Png from 'asset:贴图/法术/goety/particle/circle_explode7';
import circleExplode8Png from 'asset:贴图/法术/goety/particle/circle_explode8';
import bigElectric1Png from 'asset:贴图/法术/goety/particle/big_electric_1';
import bigElectric2Png from 'asset:贴图/法术/goety/particle/big_electric_2';
import bigElectric3Png from 'asset:贴图/法术/goety/particle/big_electric_3';

const yellow = hexColor(0xffff55);
const sparkParticleClass: ParticleClass = { 帧: [electric1Png,electric2Png,electric3Png,electric4Png,electric5Png,electric6Png,electric7Png,electric8Png,electric9Png,electric10Png,electric11Png,electric12Png,electric13Png,electric14Png,electric15Png,electric16Png].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96 };
const bigSparkParticleClass: ParticleClass = { 帧: [bigElectric1Png, bigElectric2Png, bigElectric3Png].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96, 色: [1, 0.9, 1] };
const burstParticleClass: ParticleClass = { 帧: [circleExplode1Png, circleExplode2Png, circleExplode3Png, circleExplode4Png, circleExplode5Png, circleExplode6Png, circleExplode7Png, circleExplode8Png].map(png), 选帧: '按年龄', 混合: '半透明', 色: yellow };

const dash: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const end = addVec(target, [0, 0, 0.9]);
  const dir = unitVec(sub(end, from));
  const chargeTicks = Math.min(20, Math.max(1, Math.ceil((vecLength(sub(end, from)) - 1.5) / 2.5)));
  const dashPos = (k: number): Vec3 => addVec(from, scaleVec(dir, 2.5 * Math.min(k, chargeTicks)));
  const r = rng(seed * 7919 + 29);
  const winds: WindBirth[] = Array.from({ length: 4 }, (_, i) => ({ 刻: 0, originAt: (k) => addVec(dashPos(k), [0, 0, -0.5]), 宽: 2, 高: (2 * r() - 1) * 0.5, 种子: seed * 1009 + i }));
  const bigSparks: ParticleBirth[] = [];
  const sparks: ParticleBirth[] = [];
  for (let t = 0; t <= chargeTicks; t++) {
    const bodyPos = dashPos(t);
    for (let i = 0; i < 2; i++) {
      const speedVec: Vec3 = [(r() - 0.5) * 0.1, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1];
      bigSparks.push({ 刻: t, 位: [bodyPos[0] + (r() - 0.5) * 0.6, bodyPos[1] + (r() - 0.5) * 0.6, bodyPos[2] + 0.4 + (r() - 0.5) * 1.8], 速: speedVec, 寿命: 2 + Math.floor(r() * 2), radius: defaultRadius(r) * 2 });
    }
    for (let i = 0; i < 5; i++) {
      sparks.push({ 刻: t, 位: [bodyPos[0], bodyPos[1], bodyPos[2] + 0.4], 速: [(r() - 0.5) * 0.05, (r() - 0.5) * 0.05, (r() - 0.5) * 0.05], 寿命: 5 + Math.floor(r() * 8), radius: defaultRadius(r) });
    }
  }
  const burst: ParticleBirth[] = [{ 刻: 0, 位: [from[0], from[1], from[2] + 0.4], 寿命: 6 + Math.floor(r() * 4), radius: 2 }];
  return (
    <>
      <WindParticles spawns={winds} 刻={tick} 色={yellow} />
      <TexturedParticles 类={burstParticleClass} spawns={burst} 秒={sec} />
      <TexturedParticles 类={bigSparkParticleClass} spawns={bigSparks} 秒={sec} />
      <TexturedParticles 类={sparkParticleClass} spawns={sparks} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, dash);
