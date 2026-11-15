// 上升气流。出处 goety 2.5.60.6：UpdraftSpell、UpdraftBlast、WindParticle。
// 半径 1（风系法术，下界魔杖不加成）。在目标脚底放一个 UpdraftBlast 实体，活 30 刻：
// - 每刻 2 条白色风带绕着它转：宽 f−1+随机×0.5 和 f+随机×0.5（f = 1.5 + 半径 ÷ 2 = 2），高 0，寿命 20～39 刻；
// - 第 20 刻起实体自己每刻往上走 0.25 格，风带跟着升（风带的主人是它）。
// 没做：目标被顶起（第 20 刻往上 1.0 格的速度）、受伤。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { WindParticles, type WindBirth } from '../零件/丁风.tsx';
import meta from './上升气流.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const f = 1.5 + 1 / 2;

const Updraft: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const r = mulberry32(seed * 7919 + 23);
  const originAt = (absTick: number): Vec3 => [target[0], target[1], target[2] + Math.max(0, absTick - 20) * 0.25];
  const spawns: WindBirth[] = [];
  for (let t = 0; t < 30; t++) {
    if (t > tick) break;
    spawns.push({ 刻: t, originAt, 宽: f - 1 + r() * 0.5, 高: 0, 种子: seed * 1009 + t * 2 });
    spawns.push({ 刻: t, originAt, 宽: f + r() * 0.5, 高: 0, 种子: seed * 1009 + t * 2 + 1 });
  }
  return <WindParticles spawns={spawns} 刻={tick} 色={[1, 1, 1]} />;
};

export default defineSpellPerformance(meta, Updraft);
