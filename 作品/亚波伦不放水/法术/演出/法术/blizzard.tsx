// 暴雪。出处 goety 2.5.60.6：BlizzardSpell（蓄力类，每刻一颗）、IceSpike（setRain）、IceSpikeRenderer、FoggyCloudParticle；原版 SnowflakeParticle。
// - 同箭雨，落的是冰刺（箭形换 ice_spike 贴图），雾云是白的（MapColor.SNOW）。冰刺落地时往上冒一颗雪花。
// 自己定的：片里一次 2 秒 40 颗；云高取目标上方 15 格。没做：落地的浮冰碎屑（BLOCK 粒子）；飞行中每刻的雪花（冰刺术里做了，这里 40 颗一起太密，先省了）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { TexturedParticles } from '../零件/粒子.tsx';
import { ArrowRainGroup } from '../零件/甲/落雨画.tsx';
import { snowflake, snowflakeClass } from '../零件/甲/原版粒子.ts';
import meta, { blizzardShots } from './blizzard.元.ts';
import iceSpikePng from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';
import { mulberry32 } from '@engine/core/数学.ts';

const Blizzard: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => {
  const projectiles = blizzardShots(target, seed);
  const r = mulberry32(seed * 89 + 3);
  const snow = projectiles.filter((projectile) => sec * 20 >= projectile.launchTick + projectile.flightTick).map((projectile) => snowflake(r, projectile.launchTick + projectile.flightTick, projectile.trajectory(projectile.flightTick), [0, 0, 0.5]));
  return (
    <>
      <ArrowRainGroup projectiles={projectiles} sec={sec} image={png(iceSpikePng)} fogColor={[1, 1, 1]} seed={seed} />
      <TexturedParticles type={{ ...snowflakeClass, ground: target[2] }} spawns={snow} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Blizzard);
