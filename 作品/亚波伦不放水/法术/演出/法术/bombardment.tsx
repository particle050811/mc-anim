// 轰击。出处 goety 2.5.60.6：BombardmentSpell（蓄力类，按住每 6 刻放一发 ModFireball）、原版 SmallFireball。
// - 每发同火球术的小火球；配下界魔杖每发 3 颗。
// 自己定的：游戏里按住多久放多久，片里一次演 5 发（轰击发数）。没做：点着的火。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 火球们 } from '../零件/甲/火球片.tsx';
import 元, { 轰击弹 } from './bombardment.元.ts';

const 轰击: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => <火球们 弹们={轰击弹(起点, 目标, 种子)} 秒={秒} 倍={0.75} 种子={种子} />;

export default 定义法术演出(元, 轰击);
