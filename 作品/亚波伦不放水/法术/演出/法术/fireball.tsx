// 火球术。出处 goety 2.5.60.6：FireballSpell、ModFireball（原版 SmallFireball）、原版 AbstractHurtingProjectile、ThrownItemRenderer。
// - 弹：原版小火球，惯性 0.95、加速 0.1（稳态 1.9 格/刻），画成朝镜头的火焰弹物品片（scale 0.75），每刻一颗烟。
// - 配下界魔杖：3 颗（两边两颗起点各偏一个高斯，平行飞）。
// 没做：命中后点着的火（方块火，要地形配合）；游戏里命中没有粒子，弹直接消失。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 火球们 } from '../零件/甲/火球片.tsx';
import 元, { 火球术弹 } from './fireball.元.ts';

const 火球术: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => <火球们 弹们={火球术弹(起点, 目标, 种子)} 秒={秒} 倍={0.75} 种子={种子} />;

export default 定义法术演出(元, 火球术);
