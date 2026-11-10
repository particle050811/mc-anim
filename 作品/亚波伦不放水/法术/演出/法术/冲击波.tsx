// 冲击波。出处 goety 2.5.60.6：ShockwaveSpell、CircleExplodeParticle、SphereExplodeParticle。
// 以施法者为中心，半径 4，颜色 0x2AB2CF（青蓝），放出来当刻两样东西，都在施法者脚底 + 0.5 格：
// - 贴地扩散环（CircleExplode，大小 4，速度 1）；
// - 加色球（SphereExplode，大小 4，速度 1）。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格），同 释放。
// 没做：ShockwaveSpell 里还会飘出 2～3 个 SoulSummonVFX.bombSoul 的魂（没读它的画法）；半径内生物受击。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 圆爆, 球爆 } from '../零件/甲/爆.tsx';
import 元 from './冲击波.元.ts';

const 青 = 十六进制色(0x2ab2cf);

const 冲击波: React.FC<法术演出属性> = ({ 秒, 起点 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      <圆爆 位={起点} 刻={刻} 色={青} 尺寸={4} 速={1} />
      <球爆 位={起点} 刻={刻} 色={青} 尺寸={4} 速={1} />
    </>
  );
};

export default 定义法术演出(元, 冲击波);
