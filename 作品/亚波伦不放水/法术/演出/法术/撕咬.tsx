// 撕咬。出处 goety 2.5.60.6：FangSpell、WandUtil.spawnFangs、Fangs、FangsRenderer（尖牙本身见 ../零件/尖牙.tsx）。
// - 默认法杖（下界魔杖对它不是对应学派）、不潜行：从施法者朝目标方向排一排 range（16）颗，间隔 1.25 格，warmup 依次 0、1、2…刻；
//   每颗在那一列从上往下找到的第一块实心地面上（施法者飞在天上时，牙出在她脚下到目标这条线的地面上，会越过目标继续排完）。
// 没做：潜行时绕身两圈的摆法；配灾厄法杖的 spawnFangLine。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { Fang, fangCritSpawns, CritStar } from '../零件/尖牙.tsx';
import meta, { biteRow } from './撕咬.元.ts';

const Bite: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const teeth = biteRow(from, target);
  return (
    <>
      {teeth.map((fang, i) => (
        <Fang key={i} {...fang} 刻={tick} />
      ))}
      <CritStar spawns={teeth.flatMap((fang, i) => fangCritSpawns(fang.位, fang.warmup, tick, seed * 100 + i))} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Bite);
