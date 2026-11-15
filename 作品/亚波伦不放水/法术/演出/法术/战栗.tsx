// 战栗。出处 goety 2.5.60.6：WindHornSpell、CircleExplodeParticle、SmashParticle。
// 半径 3（风系法术，下界魔杖不加成），放出来当刻：
// - 施法者脚底 + 0.5 格：白色贴地扩散环（CircleExplode，大小 6 = 半径 × 2，速度 3 = 半径，所以每刻走 4 个年龄、8 刻放完）；
// - 施法者脚底 + 1.0 格：白色砸地墙（Smash，宽 3，寿命 10 刻），高只有 0.18 格，是一圈很矮的发光环。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物被推开。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { SlamWall } from '../零件/冲击波.tsx';
import { CircleBurst } from '../零件/甲/爆.tsx';
import meta from './战栗.元.ts';

const Shudder: React.FC<SpellPerformanceProps> = ({ 秒: sec, from }) => {
  const tick = sec * 20;
  return (
    <>
      <CircleBurst 位={from} 刻={tick} 色={[1, 1, 1]} 尺寸={6} 速={3} />
      <SlamWall 位={[from[0], from[1], from[2] + 0.5]} 刻={tick} 宽={3} 色={[1, 1, 1]} 寿命={10} />
    </>
  );
};

export default defineSpellPerformance(meta, Shudder);
