// 战栗。出处 goety 2.5.60.6：WindHornSpell、CircleExplodeParticle、SmashParticle。
// 半径 3（风系法术，下界魔杖不加成），放出来当刻：
// - 施法者脚底 + 0.5 格：白色贴地扩散环（CircleExplode，大小 6 = 半径 × 2，速度 3 = 半径，所以每刻走 4 个年龄、8 刻放完）；
// - 施法者脚底 + 1.0 格：白色砸地墙（Smash，宽 3，寿命 10 刻），高只有 0.18 格，是一圈很矮的发光环。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物被推开。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 砸地墙 } from '../零件/冲击波.tsx';
import { 圆爆 } from '../零件/甲/爆.tsx';
import 元 from './战栗.元.ts';

const 战栗: React.FC<法术演出属性> = ({ 秒, 起点 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      <圆爆 位={起点} 刻={刻} 色={[1, 1, 1]} 尺寸={6} 速={3} />
      <砸地墙 位={[起点[0], 起点[1], 起点[2] + 0.5]} 刻={刻} 宽={3} 色={[1, 1, 1]} 寿命={10} />
    </>
  );
};

export default 定义法术演出(元, 战栗);
