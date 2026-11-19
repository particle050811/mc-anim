// 冰刺。出处 goety 2.5.60.6：IceSpikeSpell、IceSpike（AbstractArrow）、IceSpikeRenderer（原版箭的几何换 ice_spike 贴图，满亮度）；原版 SnowflakeParticle。
// - 弹：箭形，出手 1.6 格/刻、重力 0.05。每刻一颗雪花：出生在 位置 + 速度 × 0.75，初速 = 弹的速度（所以雪花跟着往前冲一段）。
// - 命中：sendParticles(SNOWFLAKE, 数量 0, 速度 (0, 0.5, 0) × 1) 一颗往上的雪花。
// 没做：命中时的浮冰碎屑（BLOCK 粒子，要方块贴图切片）；配霜冻法杖才出的大冰矛（IceSpear）不算。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub, addVec, scaleVec, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { TexturedParticles } from '../零件/粒子.tsx';
import { eachTick } from '../零件/甲/共用.ts';
import { ArrowShape } from '../零件/甲/箭形.tsx';
import { snowflake, snowflakeClass } from '../零件/甲/原版粒子.ts';
import meta, { iceSpikePath } from './ice_spike.元.ts';
import iceSpikePng from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';
import { mulberry32 } from '@engine/core/数学.ts';

const iceSpike: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = iceSpikePath(from, target, options?.highSpeed, options?.flightPower);
  const r = mulberry32(seed * 3 + 1);
  const snow = eachTick(1, Math.min(tick, arriveTick)).map((n) => {
    const speedVec = sub(trajectory(n + 1), trajectory(n));
    return snowflake(r, n, addVec(trajectory(n), scaleVec(speedVec, 0.75)), speedVec);
  });
  if (tick >= arriveTick) snow.push(snowflake(r, arriveTick, trajectory(arriveTick), [0, 0, 0.5]));
  return (
    <>
      {tick < arriveTick && <ArrowShape 位={trajectoryPos(trajectory, tick)} dir={trajectoryDir(trajectory, tick)} image={png(iceSpikePng)} />}
      <TexturedParticles type={{ ...snowflakeClass, ground: target[2] }} spawns={snow} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, iceSpike);
