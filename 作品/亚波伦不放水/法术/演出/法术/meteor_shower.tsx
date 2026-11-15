// 流星雨。出处 goety 2.5.60.6：MeteorShowerSpell（蓄力类，每 10 刻一轮）、Lavaball、FoggyCloudParticle；原版 ThrownItemRenderer（scale 3）、Level.explode。
// - 每轮在目标头顶的高处生熔岩炸弹朝目标砸下来，配下界魔杖每轮 3 颗；每颗生出来时放两片暗红的雾云（色 0x1A090D、0x240D12，尺寸 3，速 1）。命中爆炸。
// 自己定的：片里一次演 3 轮；高度取目标上方 15 格。没核、没做的同熔岩炸弹（爆炸威力、炸坑和火）；第一片雾云游戏里在 1.5 格内随机偏一下，这里没偏。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { VanillaParticles } from '../零件/粒子.tsx';
import { vanillaExplosion, FogCloud } from '../零件/甲/爆.tsx';
import { hexColor, trajectoryAt } from '../零件/甲/共用.ts';
import { FireballGroup } from '../零件/甲/火球片.tsx';
import meta, { meteorShots } from './meteor_shower.元.ts';

const fogColor = [hexColor(0x1a090d), hexColor(0x240d12)];

const MeteorShower: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const projectiles = meteorShots(target, seed);
  return (
    <>
      <FogCloud spawns={projectiles.flatMap((projectile, i) => fogColor.map((color, j) => ({ 刻: projectile.launchTick, 位: projectile.spawnPos, 色: color, 尺寸: 3, 速: 1, 种子: seed * 103 + i * 2 + j })))} 刻={sec * 20} />
      <FireballGroup projectiles={projectiles} 秒={sec} scale={3} 种子={seed} />
      <VanillaParticles spawns={projectiles.map((projectile, i) => vanillaExplosion(trajectoryAt(projectile.trajectory, projectile.flightTick), projectile.launchTick + projectile.flightTick, seed * 17 + i))} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, MeteorShower);
