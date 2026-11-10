// 星陨。出处 goety 2.5.60.6：VoidShockSpell（蓄力类）、VoidShock；画法见 ../零件/甲/虚空震画.tsx。
// - 蓄到第 10 刻起每 5 刻在施法者头顶附近生一颗虚空震弹，悬 10 刻后锁定目标直冲过去（1 格/刻），撞上爆。
// 自己定的：游戏里按住多久生多久，片里一次演 4 颗；片里时长照 种子 1 的摆法算。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 虚空震们 } from '../零件/甲/虚空震画.tsx';
import 元, { 星陨震 } from './stellar.元.ts';

const 星陨: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => <虚空震们 震们={星陨震(起点, 种子)} 目标={目标} 秒={秒} 种子={种子} />;

export default 定义法术演出(元, 星陨);
