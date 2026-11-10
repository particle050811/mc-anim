// 炎呼（配下界魔杖：对口法杖，喷大号龙焰）。出处 goety 2.5.60.6：FireBreathSpell.showWandBreath、IBreathingSpell.dragonBreathAttack、DragonFlameParticle（Provider，isBig）、particles/dragon_flame.json。
// 持续施法，每刻撒 10 颗 DRAGON_FLAME：速率 = 射程 8 ÷ 10 × 0.35 = 0.28 格/刻 × (1～2)，撒法见 零件/吐息.tsx 的 龙息撒。
// 粒子：半边长 (0.1～0.2) × 3，寿命 14 刻，摩擦 0.96，重力 −0.1，每刻水平速度 ±随机 ÷ 500；
// 贴图照 particles/dragon_flame.json 是 big_soul_fire_1～8（青蓝色的魂火，不是橙红），每 2 刻换一张；不透明粒子表、满亮度；碰地就没。
// 一颗最远飞 3～6 格，射程就这么远。
// 没做：每颗每刻 25% 掉一粒 DRAGON_FLAME_DROP 火星；落地的 BIG_SOUL_FIRE_GROUND 地火粒子；「周围随机点火」（在方块上放火）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减 } from '../零件/弹道.ts';
import { 原始半径, 吐息粒子, 龙息撒, type 吐息出生, type 吐息粒子类 } from '../零件/吐息.tsx';
import 元, { 炎呼持续刻, 炎呼粒子寿命 } from './炎呼.元.ts';
import 火1 from 'asset:贴图/法术/goety/particle/big_soul_fire_1';
import 火2 from 'asset:贴图/法术/goety/particle/big_soul_fire_2';
import 火3 from 'asset:贴图/法术/goety/particle/big_soul_fire_3';
import 火4 from 'asset:贴图/法术/goety/particle/big_soul_fire_4';
import 火5 from 'asset:贴图/法术/goety/particle/big_soul_fire_5';
import 火6 from 'asset:贴图/法术/goety/particle/big_soul_fire_6';
import 火7 from 'asset:贴图/法术/goety/particle/big_soul_fire_7';
import 火8 from 'asset:贴图/法术/goety/particle/big_soul_fire_8';

const 帧 = [火1, 火2, 火3, 火4, 火5, 火6, 火7, 火8].map(png);
const 炎呼: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 类: 吐息粒子类 = { 帧, 帧号: (年龄) => Math.floor(年龄 / 2) % 8, 寿命: 炎呼粒子寿命, 重力: -0.1, 摩擦: 0.96, 抖横: 1 / 500, 抖竖: 0, 地面: 目标[2] };
  const 朝 = 减([目标[0], 目标[1], 目标[2] + 0.9], 起点);
  const 出生们: 吐息出生[] = [];
  for (let n = Math.max(0, Math.floor(刻) - 炎呼粒子寿命); n <= Math.min(Math.floor(刻), 炎呼持续刻 - 1); n++)
    for (const 撒 of 龙息撒(起点, 朝, 10, 0.28, n, 种子)) 出生们.push({ 刻: n, ...撒, 半径: 原始半径(rng(撒.种子 + 9)()) * 3 });
  return <吐息粒子 类={类} 出生们={出生们} 秒={秒} />;
};

export default 定义法术演出(元, 炎呼);
