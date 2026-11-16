// 弹跳泡泡。出处 goety 2.5.60.6：BouncyBubbleSpell、BouncyBubble（SpellHurtingProjectile）、BouncyBubbleRenderer、SoulBoltModel；原版 DripParticle、SplashParticle。
// - 弹：SoulBoltModel 换 bouncy_bubble 贴图，scale(−1, −1, 1) × (1 + size)（size 默认 0），发光层（eyes）alpha 0.5；碰到东西反弹，弹满 6 次或 100 刻爆。
// - 每刻 3～4 颗 falling_water，出生在碰撞箱里随机处。爆：一片 splash。
// 重力：BouncyBubble.getGravity 返回 0，travel 不乘惯性，匀速 0.82 格/刻。没核：反弹的算法（这里是镜面反射，不损速度）。
// 没做：爆的时候另有 8 颗 water_trail（程序画的带子）；爆的两声（BUBBLE_COLUMN_BUBBLE_POP、GENERIC_SPLASH）没进元数据（时刻随弹道变，元数据的 从命中 只能挂第一次碰到人）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { serverSendParticles, VanillaParticles, TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import { eachTick, yawPitch } from '../零件/甲/共用.ts';
import { drip, dripClass } from '../零件/甲/原版粒子.ts';
import meta, { bubblePath } from './bouncy_bubble.元.ts';
import soulBoltModelData from 'asset:模型/法术/goety/SoulBoltModel';
import bouncyBubblePng from 'asset:贴图/法术/goety/entity/projectiles/bouncy_bubble';
import { mulberry32 } from '@engine/core/数学.ts';

const soulBoltModel = getModel(soulBoltModelData, 'SoulBoltModel');

const BouncyBubble: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  const { trajectory, burstTick } = bubblePath(from, target);
  const r = mulberry32(seed * 13 + 1);
  const drops: ParticleBirth[] = eachTick(1, Math.min(tick, burstTick)).flatMap((n) => {
    const p = trajectory(n);
    return Array.from({ length: 3 + (n % 2) }, () => drip(r, n, [p[0] + (r() - 0.5) * 0.4, p[1] + (r() - 0.5) * 0.4, p[2] + r() * 0.4]));
  });
  const burstPos = trajectory(burstTick);
  const { yaw, pitch } = yawPitch(trajectoryDir(trajectory, tick));
  return (
    <>
      {tick < burstTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group scale={[-1, -1, 1]}>
            <ModelPart model={soulBoltModel} image={png(bouncyBubblePng)} 画法="加色" opacity={0.5} partPoses={{ bolt: { rot: [degToRad(pitch), degToRad(yaw), 0] } }} />
          </group>
        </MinecraftSpace>
      )}
      <TexturedParticles type={dripClass(target[2])} spawns={drops} sec={sec} />
      <VanillaParticles spawns={serverSendParticles('splash', burstTick, [burstPos[0], burstPos[1], burstPos[2] + 0.5], 30, [0.3, 0.3, 0.3], 0.5, seed)} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, BouncyBubble);
