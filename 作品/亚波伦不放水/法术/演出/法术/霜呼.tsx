// 霜呼（配下界魔杖：下界魔杖不是霜呼的对口法杖，走小号霜粒子那一支）。出处 goety 2.5.60.6：FrostBreathSpell.showWandBreath、IBreathingSpell.dragonBreathAttack、FrostParticle（SmallProvider）、particles/small_frost.json。
// 持续施法，每刻撒 10 颗 SMALL_FROST：速率 = 射程 8 ÷ 10 × 0.55 = 0.44 格/刻 × (1～2)，撒法见 零件/吐息.tsx 的 龙息撒。
// 粒子：半边长 (0.1～0.2) × 3 × 0.5，寿命 20 刻，摩擦 0.96，重力 −0.1（慢慢上飘），每刻水平速度 ±随机 ÷ 500；
// 贴图 frost_1～6 再倒回 1 共 11 张，每 2 刻换一张；不透明粒子表，受环境光（这里按满亮度画）；碰地就没。
// 一颗最远飞 6～12 格（速率 × Σ0.96^k），所以射程就这么远；起点离目标比这远的话喷不到，游戏里也是。
// 没做：落地时原版 SNOWFLAKE 粒子、目标身上的冰冻效果。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减 } from '../零件/弹道.ts';
import { 原始半径, 吐息粒子, 龙息撒, type 吐息出生, type 吐息粒子类 } from '../零件/吐息.tsx';
import 元, { 霜呼持续刻, 霜呼粒子寿命 } from './霜呼.元.ts';
import 霜1 from 'asset:贴图/法术/goety/particle/frost_1';
import 霜2 from 'asset:贴图/法术/goety/particle/frost_2';
import 霜3 from 'asset:贴图/法术/goety/particle/frost_3';
import 霜4 from 'asset:贴图/法术/goety/particle/frost_4';
import 霜5 from 'asset:贴图/法术/goety/particle/frost_5';
import 霜6 from 'asset:贴图/法术/goety/particle/frost_6';

const [一, 二, 三, 四, 五, 六] = [霜1, 霜2, 霜3, 霜4, 霜5, 霜6].map(png);
const 霜呼: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 类: 吐息粒子类 = {
    帧: [一!, 二!, 三!, 四!, 五!, 六!, 五!, 四!, 三!, 二!, 一!],
    帧号: (年龄) => Math.floor(年龄 / 2) % 11,
    寿命: 霜呼粒子寿命,
    重力: -0.1,
    摩擦: 0.96,
    抖横: 1 / 500,
    抖竖: 0,
    地面: 目标[2],
  };
  const 朝 = 减([目标[0], 目标[1], 目标[2] + 0.9], 起点);
  const 出生们: 吐息出生[] = [];
  for (let n = Math.max(0, Math.floor(刻) - 霜呼粒子寿命); n <= Math.min(Math.floor(刻), 霜呼持续刻 - 1); n++)
    for (const 撒 of 龙息撒(起点, 朝, 10, 0.44, n, 种子)) 出生们.push({ 刻: n, ...撒, 半径: 原始半径(rng(撒.种子 + 9)()) * 3 * 0.5 });
  return <吐息粒子 类={类} 出生们={出生们} 秒={秒} />;
};

export default 定义法术演出(元, 霜呼);
