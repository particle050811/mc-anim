// 星陨。出处 goety 2.5.60.6：VoidShockSpell（蓄力类）、VoidShock；画法见 ../零件/甲/虚空震画.tsx。
// - 蓄到第 10 刻起每 5 刻在施法者头顶附近生一颗虚空震弹，悬 10 刻后锁定目标直冲过去（1 格/刻），撞上爆。
// 自己定的：游戏里按住多久生多久，片里一次演 4 颗；片里时长照 种子 1 的摆法算。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { VoidShockGroup } from '../零件/甲/虚空震画.tsx';
import meta, { starfallShocks } from './stellar.元.ts';

const Starfall: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => <VoidShockGroup shocks={starfallShocks(from, seed)} 目标={target} 秒={sec} 种子={seed} />;

export default defineSpellPerformance(meta, Starfall);
