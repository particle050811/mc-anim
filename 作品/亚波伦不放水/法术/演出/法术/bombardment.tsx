// 轰击。出处 goety 2.5.60.6：BombardmentSpell（蓄力类，按住每 6 刻放一发 ModFireball）、原版 SmallFireball。
// - 每发同火球术的小火球；配下界魔杖每发 3 颗。
// 自己定的：游戏里按住多久放多久，片里一次演 5 发（轰击发数）。没做：点着的火。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { FireballGroup } from '../零件/甲/火球片.tsx';
import meta, { bombardmentShots } from './bombardment.元.ts';

const bombardment: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => <FireballGroup projectiles={bombardmentShots(from, target, seed)} 秒={sec} scale={0.75} 种子={seed} />;

export default defineSpellPerformance(meta, bombardment);
