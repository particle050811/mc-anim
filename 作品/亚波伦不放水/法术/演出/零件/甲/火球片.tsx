// 画原版火球一类：ThrownItemRenderer 把物品（火焰弹）当朝镜头的方片画，小火球 scale 0.75、大火球（恶魂火球）scale 3.0；
// 物品的 GROUND 变换再缩 0.5、抬 2/16 格 → 半边长 0.25 × scale，中心比实体位置高 0.125 × scale。
// 每刻在 位置 + 0.5 格 放一颗 smoke（AbstractHurtingProjectile.tick 的 getTrailParticle）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { trajectoryPos } from '../弹道.ts';
import { facePatch, QuadGroup } from '../面片.tsx';
import { VanillaParticles, type ParticleSpawn } from '../粒子.tsx';
import { eachTick } from './共用.ts';
import type { Fireball } from './火球.ts';
import fireChargePng from 'asset:贴图/法术/minecraft/item/fire_charge';

export const fireballSmoke = (projectiles: readonly Fireball[], tick: number, seed: number): ParticleSpawn[] =>
  projectiles.flatMap((projectile, i) =>
    eachTick(1, Math.min(tick - projectile.launchTick, projectile.flightTick)).map((n) => {
      const p = projectile.trajectory(n);
      return { kind: 'smoke' as const, 刻: projectile.launchTick + n, p: [p[0], p[1], p[2] + 0.5] as [number, number, number], seed: seed * 131 + i * 977 + n };
    }),
  );

export const FireballGroup: React.FC<{ projectiles: readonly Fireball[]; sec: number; /** 渲染器的 scale：小火球 0.75，大火球 3 */ scale: number; seed: number }> = ({ projectiles, sec: sec, scale, seed: seed }) => {
  const tick = sec * 20;
  const items = projectiles
    .filter((projectile) => tick >= projectile.launchTick && tick - projectile.launchTick < projectile.flightTick)
    .map((projectile) => {
      const p = trajectoryPos(projectile.trajectory, tick - projectile.launchTick);
      return facePatch([p[0], p[1], p[2] + 0.125 * scale], 0.25 * scale);
    });
  return (
    <>
      <QuadGroup image={png(fireChargePng)} items={items} blend="镂空" />
      <VanillaParticles spawns={fireballSmoke(projectiles, tick, seed)} sec={sec} />
    </>
  );
};
