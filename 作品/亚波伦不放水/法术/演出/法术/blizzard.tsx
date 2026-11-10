// 暴雪。出处 goety 2.5.60.6：BlizzardSpell（蓄力类，每刻一颗）、IceSpike（setRain）、IceSpikeRenderer、FoggyCloudParticle；原版 SnowflakeParticle。
// - 同箭雨，落的是冰刺（箭形换 ice_spike 贴图），雾云是白的（MapColor.SNOW）。冰刺落地时往上冒一颗雪花。
// 自己定的：片里一次 2 秒 40 颗；云高取目标上方 15 格。没做：落地的浮冰碎屑（BLOCK 粒子）；飞行中每刻的雪花（冰刺术里做了，这里 40 颗一起太密，先省了）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 贴图粒子 } from '../零件/粒子.tsx';
import { 落雨们 } from '../零件/甲/落雨画.tsx';
import { 雪花, 雪花类 } from '../零件/甲/原版粒子.ts';
import 元, { 暴雪弹 } from './blizzard.元.ts';
import 冰刺图 from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';

const 暴雪: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 弹们 = 暴雪弹(目标, 种子);
  const r = rng(种子 * 89 + 3);
  const 雪 = 弹们.filter((弹) => 秒 * 20 >= 弹.出刻 + 弹.飞刻).map((弹) => 雪花(r, 弹.出刻 + 弹.飞刻, 弹.道(弹.飞刻), [0, 0, 0.5]));
  return (
    <>
      <落雨们 弹们={弹们} 秒={秒} 图={png(冰刺图)} 雾色={[1, 1, 1]} 种子={种子} />
      <贴图粒子 类={{ ...雪花类, 地面: 目标[2] }} 出生们={雪} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 暴雪);
