// 凋灵之首。出处 goety 2.5.60.6：WitherSkullSpell、ModWitherSkull（原版 WitherSkull）；原版 WitherSkullRenderer、SkullModel。
// - 弹：原版凋灵之首，惯性 0.95、加速 0.1（不潜行；潜行放的危险凋灵之首才是 0.73）；模型是一个 8×8×8 的头（贴图 wither.png 的 (0,0)，64×64），渲染器 scale(−1, −1, 1)，头 yRot = yaw、xRot = pitch，亮度固定 15；每刻一颗烟。
// - 命中：威力 1 的爆炸，一颗 explosion 粒子。配下界魔杖 3 颗。
// 头的模型原版写在 SkullModel.createHeadModel 里，没走导出，这里照着手写了一个方盒。没做：炸坑、凋零效果的粒子。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, degToRad, ModelPart, type EntityModelData } from '../零件/实体.tsx';
import { VanillaParticles } from '../零件/粒子.tsx';
import { vanillaExplosion } from '../零件/甲/爆.tsx';
import { yawPitch, trajectoryAt } from '../零件/甲/共用.ts';
import { fireballSmoke } from '../零件/甲/火球片.tsx';
import meta, { witherSkullShots } from './wither_skull.元.ts';
import witherPng from 'asset:贴图/法术/minecraft/entity/wither/wither';

const headModel: EntityModelData = {
  texSize: [64, 64],
  root: { name: 'root', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [], children: [{ name: 'head', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8], grow: [0, 0, 0], mirror: false }], children: [] }] },
};

const WitherSkull: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  const projectiles = witherSkullShots(from, target, seed);
  return (
    <>
      {projectiles.map((projectile, i) => {
        if (tick >= projectile.flightTick) return null;
        const { yaw, pitch } = yawPitch(trajectoryDir(projectile.trajectory, tick));
        return (
          <MinecraftSpace key={i} 位={trajectoryPos(projectile.trajectory, tick)}>
            <group scale={[-1, -1, 1]}>
              <ModelPart model={headModel} image={png(witherPng)} 画法="镂空" partPoses={{ head: { rot: [degToRad(pitch), degToRad(yaw), 0] } }} />
            </group>
          </MinecraftSpace>
        );
      })}
      <VanillaParticles spawns={[...fireballSmoke(projectiles, tick, seed), ...projectiles.map((projectile, i) => vanillaExplosion(trajectoryAt(projectile.trajectory, projectile.flightTick), projectile.flightTick, seed * 17 + i))]} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, WitherSkull);
