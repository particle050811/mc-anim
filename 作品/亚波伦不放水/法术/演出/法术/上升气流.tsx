// 上升气流。出处 goety 2.5.60.6：UpdraftSpell、UpdraftBlast、WindParticle。
// 半径 1（风系法术，下界魔杖不加成）。在目标脚底放一个 UpdraftBlast 实体，活 30 刻：
// - 每刻 2 条白色风带绕着它转：宽 f−1+随机×0.5 和 f+随机×0.5（f = 1.5 + 半径 ÷ 2 = 2），高 0，寿命 20～39 刻；
// - 第 20 刻起实体自己每刻往上走 0.25 格，风带跟着升（风带的主人是它）。
// 没做：目标被顶起（第 20 刻往上 1.0 格的速度）、受伤。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 风粒们, type 风粒生 } from '../零件/丁风.tsx';
import 元 from './上升气流.元.ts';

const f = 1.5 + 1 / 2;

const 上升气流: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const r = rng(种子 * 7919 + 23);
  const 主人 = (绝对刻: number): 点 => [目标[0], 目标[1], 目标[2] + Math.max(0, 绝对刻 - 20) * 0.25];
  const 出生们: 风粒生[] = [];
  for (let t = 0; t < 30; t++) {
    if (t > 刻) break;
    出生们.push({ 刻: t, 主人, 宽: f - 1 + r() * 0.5, 高: 0, 种子: 种子 * 1009 + t * 2 });
    出生们.push({ 刻: t, 主人, 宽: f + r() * 0.5, 高: 0, 种子: 种子 * 1009 + t * 2 + 1 });
  }
  return <风粒们 出生们={出生们} 刻={刻} 色={[1, 1, 1]} />;
};

export default 定义法术演出(元, 上升气流);
