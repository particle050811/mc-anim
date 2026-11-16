// 熔岩炸弹。出处 goety 2.5.60.6：LavaballSpell、Lavaball（原版 LargeFireball 一类）、原版 ThrownItemRenderer（scale 3.0）、Level.explode。
// - 弹：惯性 0.95、加速 0.1，画成朝镜头的火焰弹物品片放大到 3 倍（1.5 格宽），每刻一颗烟；配下界魔杖 3 颗。
// - 命中：爆炸。这里每颗放一颗原版 explosion 粒子（威力 < 2 的画法）。
// 没核：Lavaball 默认爆炸威力（同步数据的默认值没翻到）；威力 ≥ 2 时游戏放的是 explosion_emitter（一团十几颗），这里只放了一颗。没做：炸出的坑和火。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { vanillaExplosion } from '../零件/甲/爆.tsx';
import { trajectoryAt } from '../零件/甲/共用.ts';
import { FireballGroup } from '../零件/甲/火球片.tsx';
import { VanillaParticles } from '../零件/粒子.tsx';
import meta, { lavaBombShots } from './lavaball.元.ts';

const LavaBomb: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const projectiles = lavaBombShots(from, target, seed);
  return (
    <>
      <FireballGroup projectiles={projectiles} sec={sec} scale={3} seed={seed} />
      <VanillaParticles spawns={projectiles.map((projectile, i) => vanillaExplosion(trajectoryAt(projectile.trajectory, projectile.flightTick), projectile.launchTick + projectile.flightTick, seed * 17 + i))} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, LavaBomb);
