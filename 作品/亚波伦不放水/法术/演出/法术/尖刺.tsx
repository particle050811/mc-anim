// 尖刺。出处 goety 2.5.60.6：SpikeSpell、WandUtil.spawnSpikes、Spike、GroundProjectile、SpikeRenderer、SpikeModel。
// - 默认法杖、不潜行：和撕咬一样朝目标排一排 16 根，间隔 1.25 格，warmup 依次 0、1、2…刻；找地面的办法也一样。
// - 动画进度（GroundProjectile.getAnimationProgress）：出土后 animationTicks 从 22 每刻减 1 减到 9 停住，进度 = 1 − animationTicks ÷ 20（−0.1 → 0.55 停）；
//   寿命剩 12 刻起改成 1 − (剩余 − 2) ÷ 20（0.5 → 1）。
// - 渲染器：mulPose(Y 90° − yRot)，scale(−f1, −f1, f1)（f1 = 2，进度过 0.9 缩没），translate(0, −0.626, 0)，scale(0.5)。
//   setupAnim：整体抬 (进度 + sin(进度 × 2.7)) × 0.6 × 12 像素；尖头 upper_jaw 每画一帧 yRot −= partialTick ÷ 10（跟帧率走，这里按每秒 3 弧度算）。
// 和游戏差在：地刺游戏里立 600 刻，片里 100 刻（见 尖刺.元.ts）；潜行绕身两圈、配灾厄法杖的三路不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import meta, { spikeRow, spikeLifeTicks } from './尖刺.元.ts';
import spikeModelData from 'asset:模型/法术/goety/SpikeModel';
import spikePng from 'asset:贴图/法术/goety/entity/projectiles/spike';

const spikeModel = getModel(spikeModelData, 'SpikeModel');
const image = png(spikePng);

const Spike: React.FC<{ 位: Vec3; facingAngle: number; warmup: number; 刻: number }> = ({ 位: pos, facingAngle, warmup, 刻: tick }) => {
  const a = tick - (warmup + 1);
  if (a < 0 || a >= spikeLifeTicks) return null;
  const remainTick = spikeLifeTicks - a;
  const progress = remainTick <= 12 ? (remainTick - 2 <= 0 ? 1 : 1 - (remainTick - 2) / 20) : 1 - Math.max(9, 22 - a) / 20;
  const f1 = 2 * (progress > 0.9 ? Math.max(0, (1 - progress) / 0.1) : 1);
  if (f1 <= 0) return null;
  const lift = (progress + Math.sin(progress * 2.7)) * 0.6 * 12;
  const partPoses = { base: { offset: [-5, 24 - lift, -5] }, upper_jaw: { offset: [0, 18 - lift, 0], rot: [0, -(a / 20) * 3, 0] } };
  return (
    <MinecraftSpace 位={pos}>
      <group rotation={[0, degToRad(90 - (facingAngle * 180) / Math.PI), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.626, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <ModelPart 模型={spikeModel} 图={image} partPoses={partPoses} />
            </group>
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

const Spikes: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target }) => (
  <>
    {spikeRow(from, target).map((spike, i) => (
      <Spike key={i} {...spike} 刻={sec * 20} />
    ))}
  </>
);

export default defineSpellPerformance(meta, Spikes);
