// 火球术。出处 goety 2.5.60.6：FireballSpell、ModFireball（原版 SmallFireball）、原版 AbstractHurtingProjectile、ThrownItemRenderer。
// - 弹：原版小火球，惯性 0.95、加速 0.1（稳态 1.9 格/刻），画成朝镜头的火焰弹物品片（scale 0.75），每刻一颗烟。
// - 配下界魔杖：3 颗（两边两颗起点各偏一个高斯，平行飞）。
// 没做：命中后点着的火（方块火，要地形配合）；游戏里命中没有粒子，弹直接消失。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { FireballGroup } from '../零件/甲/火球片.tsx';
import meta, { fireballShots } from './fireball.元.ts';

const Fireball: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => <FireballGroup projectiles={fireballShots(from, target, seed)} sec={sec} scale={0.75} seed={seed} />;

export default defineSpellPerformance(meta, Fireball);
