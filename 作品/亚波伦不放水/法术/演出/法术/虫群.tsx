// 虫群。出处 goety 2.5.60.6：SwarmSpell.showWandBreath、IBreathingSpell.breathAttack、FireParticle（FlyProvider）、particles/fly.json。
// 持续施法，每刻撒 2 只苍蝇粒子（FLY）：速率 0.3 格/刻 × (1～2)，散布 5，出生位置在口附近 高斯 ÷ 2 散开，撒法见 零件/吐息.tsx 的 吐息撒。
// 粒子：半边长 (0.1～0.2) × 3，寿命 8 刻，摩擦 0.96，重力 −0.1（从第 2 刻起），每刻水平速度 ±随机 ÷ 100、竖直 +随机 ÷ 100；
// 贴图 fly1、fly2、fly3、fly2 按年龄换（年龄 × 3 ÷ 8）；不透明粒子表；亮度随年龄升到满（这里按满亮度画）。
// 一只最远飞 2～4 格，射程就这么远。
// 没做：目标被咬死后生成的 InsectSwarm 实体（片里史蒂夫不是这么死的）；咬中的 INSECT_SWARM_BITE 声。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减 } from '../零件/弹道.ts';
import { 原始半径, 吐息粒子, 吐息撒, type 吐息出生, type 吐息粒子类 } from '../零件/吐息.tsx';
import 元, { 虫群持续刻, 虫群粒子寿命 } from './虫群.元.ts';
import 蝇1 from 'asset:贴图/法术/goety/particle/fly1';
import 蝇2 from 'asset:贴图/法术/goety/particle/fly2';
import 蝇3 from 'asset:贴图/法术/goety/particle/fly3';

const [一, 二, 三] = [蝇1, 蝇2, 蝇3].map(png);
const 类: 吐息粒子类 = {
  帧: [一!, 二!, 三!, 二!],
  帧号: (年龄) => Math.floor((年龄 * 3) / 虫群粒子寿命),
  寿命: 虫群粒子寿命,
  重力: -0.1,
  首刻无重力: true,
  摩擦: 0.96,
  抖横: 1 / 100,
  抖竖: 1 / 100,
};

const 虫群: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 朝 = 减([目标[0], 目标[1], 目标[2] + 0.9], 起点);
  const 出生们: 吐息出生[] = [];
  for (let n = Math.max(0, Math.floor(刻) - 虫群粒子寿命); n <= Math.min(Math.floor(刻), 虫群持续刻 - 1); n++)
    for (const 撒 of 吐息撒(起点, 朝, 2, 0.3, 5, n, 种子)) 出生们.push({ 刻: n, ...撒, 半径: 原始半径(rng(撒.种子 + 9)()) * 3 });
  return <吐息粒子 类={类} 出生们={出生们} 秒={秒} />;
};

export default 定义法术演出(元, 虫群);
