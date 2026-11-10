// 流星雨。出处 goety 2.5.60.6：MeteorShowerSpell（蓄力类，每 10 刻一轮）、Lavaball、FoggyCloudParticle；原版 ThrownItemRenderer（scale 3）、Level.explode。
// - 每轮在目标头顶的高处生熔岩炸弹朝目标砸下来，配下界魔杖每轮 3 颗；每颗生出来时放两片暗红的雾云（色 0x1A090D、0x240D12，尺寸 3，速 1）。命中爆炸。
// 自己定的：片里一次演 3 轮；高度取目标上方 15 格。没核、没做的同熔岩炸弹（爆炸威力、炸坑和火）；第一片雾云游戏里在 1.5 格内随机偏一下，这里没偏。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { VanillaParticles } from '../零件/粒子.tsx';
import { 原版爆, 雾云 } from '../零件/甲/爆.tsx';
import { 十六色, 道上 } from '../零件/甲/共用.ts';
import { 火球们 } from '../零件/甲/火球片.tsx';
import 元, { 流星雨弹 } from './meteor_shower.元.ts';

const 雾色 = [十六色(0x1a090d), 十六色(0x240d12)];

const 流星雨: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 弹们 = 流星雨弹(目标, 种子);
  return (
    <>
      <雾云 出生们={弹们.flatMap((弹, i) => 雾色.map((色, j) => ({ 刻: 弹.出刻, 位: 弹.生位, 色, 尺寸: 3, 速: 1, 种子: 种子 * 103 + i * 2 + j })))} 刻={秒 * 20} />
      <火球们 弹们={弹们} 秒={秒} 倍={3} 种子={种子} />
      <VanillaParticles spawns={弹们.map((弹, i) => 原版爆(道上(弹.道, 弹.飞刻), 弹.出刻 + 弹.飞刻, 种子 * 17 + i))} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 流星雨);
