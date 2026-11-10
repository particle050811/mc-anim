// 熔岩炸弹。出处 goety 2.5.60.6：LavaballSpell、Lavaball（原版 LargeFireball 一类）、原版 ThrownItemRenderer（scale 3.0）、Level.explode。
// - 弹：惯性 0.95、加速 0.1，画成朝镜头的火焰弹物品片放大到 3 倍（1.5 格宽），每刻一颗烟；配下界魔杖 3 颗。
// - 命中：爆炸。这里每颗放一颗原版 explosion 粒子（威力 < 2 的画法）。
// 没核：Lavaball 默认爆炸威力（同步数据的默认值没翻到）；威力 ≥ 2 时游戏放的是 explosion_emitter（一团十几颗），这里只放了一颗。没做：炸出的坑和火。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 原版爆 } from '../零件/甲/爆.tsx';
import { 道上 } from '../零件/甲/共用.ts';
import { 火球们 } from '../零件/甲/火球片.tsx';
import { VanillaParticles } from '../零件/粒子.tsx';
import 元, { 熔岩炸弹弹 } from './lavaball.元.ts';

const 熔岩炸弹: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 弹们 = 熔岩炸弹弹(起点, 目标, 种子);
  return (
    <>
      <火球们 弹们={弹们} 秒={秒} 倍={3} 种子={种子} />
      <VanillaParticles spawns={弹们.map((弹, i) => 原版爆(道上(弹.道, 弹.飞刻), 弹.出刻 + 弹.飞刻, 种子 * 17 + i))} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 熔岩炸弹);
