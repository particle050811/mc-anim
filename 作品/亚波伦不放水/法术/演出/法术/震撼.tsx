// 震撼。出处 goety 2.5.60.6：ShockingSpell、SLightningPacket、ClientProxy.shock、BoltRenderInfo.shock。
// - 持续施法：每刻从施法者眼睛到目标半身高发一道细电弧（shock 预设，粗 0.04），颜色 0xB1ABF1，寿命 5 刻；所以同一时刻叠着 5 道形状各异的。
// - 连锁电弧只在配风暴法杖时有，配下界魔杖没有。
// 没做：目标身上的受击火花。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 十六进制色 } from '../零件/材质.ts';
import 元, { 震撼寿命刻, 震撼持续刻, 震撼落点 } from './震撼.元.ts';

const 电色 = 十六进制色(0xb1abf1);

const 震撼: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 道们: number[] = [];
  for (let n = Math.max(0, Math.ceil(刻 - 震撼寿命刻)); n <= Math.min(Math.floor(刻), 震撼持续刻 - 1); n++) 道们.push(n);
  return (
    <>
      {道们.map((n) => (
        <电弧 key={n} 起={起点} 终={震撼落点(目标)} 设定={电弧预设.shock} 刻={刻 - n} 寿命刻={震撼寿命刻} 色={电色} 种子={种子 * 977 + n} />
      ))}
    </>
  );
};

export default 定义法术演出(元, 震撼);
