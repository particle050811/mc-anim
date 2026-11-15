// 毒镖。出处 goety 2.5.60.6：PoisonDartSpell、PoisonQuill（Arrow）、PoisonQuillRenderer、PoisonQuillModel、TrailParticle。
// - 弹：PoisonQuillModel（一根 1×14×1 的杆加两片交叉的羽），PoseStack YP(yaw − 90) · ZP(pitch + 90)，entityTranslucent，贴图 poison_quill。
// - 尾迹：每刻 4 颗 trail 粒子，出生在 位置 + 速度 + 各轴高斯 ÷ 2（竖直再 + 0.5），色 0xEFEC8B；TrailParticle 不动、寿命 10 刻、透明度 1 − 年龄 ÷ 寿命。
// 没做：命中后中毒的药水粒子。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { TexturedParticles, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import { eachTick, hexColor, arrowYawPitch, gaussian } from '../零件/甲/共用.ts';
import meta, { poisonDartPath } from './poison_dart.元.ts';
import poisonQuillModelData from 'asset:模型/法术/goety/PoisonQuillModel';
import quillPng from 'asset:贴图/法术/goety/entity/projectiles/poison_quill';
import trailParticlePng from 'asset:贴图/法术/goety/particle/trail';
import { mulberry32 } from '@engine/core/数学.ts';

const poisonQuillModel = getModel(poisonQuillModelData, 'PoisonQuillModel');
export const trailParticleClass: ParticleClass = { 帧: [png(trailParticlePng)], 选帧: '按年龄', 摩擦: 0.96, 混合: '半透明', opacity: (age, lifetime) => 1 - Math.floor(age) / lifetime };

const PoisonDart: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = poisonDartPath(from, target, options?.highSpeed);
  const r = mulberry32(seed * 5 + 2);
  const color = hexColor(0xefec8b);
  const tail: ParticleBirth[] = eachTick(1, Math.min(tick, arriveTick)).flatMap((n) => {
    const [pos, speedVec] = [trajectory(n), sub(trajectory(n + 1), trajectory(n))];
    return Array.from({ length: 4 }, () => ({ 刻: n, 位: [pos[0] + speedVec[0] + gaussian(r) / 2, pos[1] + speedVec[1] + gaussian(r) / 2, pos[2] + speedVec[2] + 0.5 + gaussian(r) / 2] as const, 寿命: 10, radius: 0.1 * (r() * 0.5 + 0.5) * 2 * 0.75, 色: color }));
  });
  const { yaw, pitch } = arrowYawPitch(trajectoryDir(trajectory, tick));
  return (
    <>
      {tick < arriveTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group rotation={[0, degToRad(yaw - 90), 0]}>
            <group rotation={[0, 0, degToRad(pitch + 90)]}>
              <ModelPart 模型={poisonQuillModel} 图={png(quillPng)} 画法="半透明" />
            </group>
          </group>
        </MinecraftSpace>
      )}
      <TexturedParticles 类={trailParticleClass} spawns={tail} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, PoisonDart);
