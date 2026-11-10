// 冰刺。出处 goety 2.5.60.6：IceSpikeSpell、IceSpike（AbstractArrow）、IceSpikeRenderer（原版箭的几何换 ice_spike 贴图，满亮度）；原版 SnowflakeParticle。
// - 弹：箭形，出手 1.6 格/刻、重力 0.05。每刻一颗雪花：出生在 位置 + 速度 × 0.75，初速 = 弹的速度（所以雪花跟着往前冲一段）。
// - 命中：sendParticles(SNOWFLAKE, 数量 0, 速度 (0, 0.5, 0) × 1) 一颗往上的雪花。
// 没做：命中时的浮冰碎屑（BLOCK 粒子，要方块贴图切片）；配霜冻法杖才出的大冰矛（IceSpear）不算。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减, 加, 乘, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { 贴图粒子 } from '../零件/粒子.tsx';
import { 各刻 } from '../零件/甲/共用.ts';
import { 箭形 } from '../零件/甲/箭形.tsx';
import { 雪花, 雪花类 } from '../零件/甲/原版粒子.ts';
import 元, { 冰刺道 } from './ice_spike.元.ts';
import 冰刺图 from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';

const 冰刺: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 冰刺道(起点, 目标);
  const r = rng(种子 * 3 + 1);
  const 雪 = 各刻(1, Math.min(刻, 到刻)).map((n) => {
    const 速 = 减(道(n + 1), 道(n));
    return 雪花(r, n, 加(道(n), 乘(速, 0.75)), 速);
  });
  if (刻 >= 到刻) 雪.push(雪花(r, 到刻, 道(到刻), [0, 0, 0.5]));
  return (
    <>
      {刻 < 到刻 && <箭形 位={弹道位置(道, 刻)} 向={弹道方向(道, 刻)} 图={png(冰刺图)} />}
      <贴图粒子 类={{ ...雪花类, 地面: 目标[2] }} 出生们={雪} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 冰刺);
