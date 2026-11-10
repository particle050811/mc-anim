// 闪电。出处 goety 2.5.60.6：LightningSpell、SpellLightningBolt、SpellLightningBoltRenderer（和原版 LightningBoltRenderer 一字不差）；原版 1.20.1 LightningBolt.tick。
// - 在目标脚下生成一道闪电实体，画法就是原版闪电，直接用库里的 LightningBolt。
// - 实体的命（LightningBolt.tick）：life 从 2 起每刻 −1；小于 0 之后，每刻有机会（life < −nextInt(10)）再闪一轮：flashes −1、life 回 1、换一个形状；flashes（1～3）用完就消失。
//   实体活着的时候闪电一直画着，每轮换一次形状。
// 和游戏的差别：库里的 LightningBolt 自带一盏照亮四周的灯，这里跟着闪电一直亮；游戏里只有 life ≥ 0 的那几刻天空发白。没做天空发白、点火。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { LightningBolt } from '@库/特效/闪电.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import 元, { 闪电最长刻 } from './闪电.元.ts';

/** 照 tick 走一遍：每一轮从第几刻起、用哪个形状种子；末 = 实体消失的刻 */
const 走 = (种子: number): { 轮们: { 起刻: number; 形: number }[]; 末: number } => {
  const r = rng(种子 * 31337 + 11);
  const 整 = (n: number) => Math.floor(r() * n);
  let life = 2;
  let flashes = 整(3) + 1;
  const 轮们 = [{ 起刻: 0, 形: 种子 * 13 + 1 }];
  for (let 刻 = 1; 刻 <= 闪电最长刻; 刻++) {
    life--;
    if (life < 0) {
      if (flashes === 0) return { 轮们, 末: 刻 };
      if (life < -整(10)) {
        flashes--;
        life = 1;
        轮们.push({ 起刻: 刻, 形: 种子 * 13 + 1 + 轮们.length });
      }
    }
  }
  return { 轮们, 末: 闪电最长刻 };
};

const 闪电: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 轮们, 末 } = 走(种子);
  if (刻 >= 末) return null;
  const 轮 = [...轮们].reverse().find((x) => x.起刻 <= 刻)!;
  return <LightningBolt seed={轮.形} flash={1} position={[目标[0], 目标[1], 目标[2]]} />;
};

export default 定义法术演出(元, 闪电);
