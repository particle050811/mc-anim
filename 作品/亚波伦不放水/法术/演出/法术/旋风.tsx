// 旋风。出处 goety 2.5.60.6：WhirlwindSpell（EverChargeSpell）、ServerParticleUtil.windParticle、WindParticle。
// 半径 2（风系法术，下界魔杖不加成）。持续施法每刻在施法者身上发 3 条白色风带，绕着施法者转：
// 宽 1、高 −0.5；宽 1、高 1.0；宽 2、高 0.5。每条寿命 20～39 刻，见 零件/丁风.tsx。
// 这里把 起点 当成施法者（脚底 = 起点 − 0.5 格）。持续刻数是自己定的（见 旋风.元.ts）。
// 没做：施法者被托起（竖直每刻 +0.04）和周围生物被吹开。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 风粒们, type 风粒生 } from '../零件/丁风.tsx';
import 元, { 旋风持续刻 } from './旋风.元.ts';

const 旋风: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => {
  const 刻 = 秒 * 20;
  const 脚: 点 = [起点[0], 起点[1], 起点[2] - 0.5];
  const 出生们: 风粒生[] = [];
  for (let t = 0; t < 旋风持续刻; t++) {
    if (t > 刻) break;
    for (const [i, [宽, 高]] of ([[1, -0.5], [1, 1.0], [2, 0.5]] as const).entries()) {
      出生们.push({ 刻: t, 主人: () => 脚, 宽, 高, 种子: 种子 * 1009 + t * 3 + i });
    }
  }
  return <风粒们 出生们={出生们} 刻={刻} 色={[1, 1, 1]} />;
};

export default 定义法术演出(元, 旋风);
