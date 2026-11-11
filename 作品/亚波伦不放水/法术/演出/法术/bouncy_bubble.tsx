// 弹跳泡泡。出处 goety 2.5.60.6：BouncyBubbleSpell、BouncyBubble（SpellHurtingProjectile）、BouncyBubbleRenderer、SoulBoltModel；原版 DripParticle、SplashParticle。
// - 弹：SoulBoltModel 换 bouncy_bubble 贴图，scale(−1, −1, 1) × (1 + size)（size 默认 0），发光层（eyes）alpha 0.5；碰到东西反弹，弹满 6 次或 100 刻爆。
// - 每刻 3～4 颗 falling_water，出生在碰撞箱里随机处。爆：一片 splash。
// 重力：BouncyBubble.getGravity 返回 0，travel 不乘惯性，匀速 0.82 格/刻。没核：反弹的算法（这里是镜面反射，不损速度）。
// 没做：爆的时候另有 8 颗 water_trail（程序画的带子）；爆的两声（BUBBLE_COLUMN_BUBBLE_POP、GENERIC_SPLASH）没进元数据（时刻随弹道变，元数据的 从命中 只能挂第一次碰到人）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { serverSendParticles, VanillaParticles, 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import { 各刻, 转向角 } from '../零件/甲/共用.ts';
import { 水滴, 水滴类 } from '../零件/甲/原版粒子.ts';
import 元, { 泡泡道 } from './bouncy_bubble.元.ts';
import 模型数据 from 'asset:模型/法术/goety/SoulBoltModel';
import 泡图 from 'asset:贴图/法术/goety/entity/projectiles/bouncy_bubble';

const 模型 = 取模型(模型数据, 'SoulBoltModel');

const 弹跳泡泡: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 爆刻 } = 泡泡道(起点, 目标);
  const r = rng(种子 * 13 + 1);
  const 滴: 粒子出生[] = 各刻(1, Math.min(刻, 爆刻)).flatMap((n) => {
    const p = 道(n);
    return Array.from({ length: 3 + (n % 2) }, () => 水滴(r, n, [p[0] + (r() - 0.5) * 0.4, p[1] + (r() - 0.5) * 0.4, p[2] + r() * 0.4]));
  });
  const 爆位 = 道(爆刻);
  const { yaw, pitch } = 转向角(弹道方向(道, 刻));
  return (
    <>
      {刻 < 爆刻 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group scale={[-1, -1, 1]}>
            <模型件 模型={模型} 图={png(泡图)} 画法="加色" 透明度={0.5} 姿态={{ bolt: { rot: [度(pitch), 度(yaw), 0] } }} />
          </group>
        </MC空间>
      )}
      <贴图粒子 类={水滴类(目标[2])} 出生们={滴} 秒={秒} />
      <VanillaParticles spawns={serverSendParticles('splash', 爆刻, [爆位[0], 爆位[1], 爆位[2] + 0.5], 30, [0.3, 0.3, 0.3], 0.5, 种子)} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 弹跳泡泡);
