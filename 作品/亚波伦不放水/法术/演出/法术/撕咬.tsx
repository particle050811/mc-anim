// 撕咬。出处 goety 2.5.60.6：FangSpell、WandUtil.spawnFangs、Fangs、FangsRenderer（尖牙本身见 ../零件/尖牙.tsx）。
// - 默认法杖（下界魔杖对它不是对应学派）、不潜行：从施法者朝目标方向排一排 range（16）颗，间隔 1.25 格，warmup 依次 0、1、2…刻；
//   每颗在那一列从上往下找到的第一块实心地面上（施法者飞在天上时，牙出在她脚下到目标这条线的地面上，会越过目标继续排完）。
// 没做：潜行时绕身两圈的摆法；配灾厄法杖的 spawnFangLine。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 尖牙, 尖牙暴击, 暴击星 } from '../零件/尖牙.tsx';
import 元, { 撕咬一排 } from './撕咬.元.ts';

const 撕咬: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 排 = 撕咬一排(起点, 目标);
  return (
    <>
      {排.map((牙, i) => (
        <尖牙 key={i} {...牙} 刻={刻} />
      ))}
      <暴击星 出生们={排.flatMap((牙, i) => 尖牙暴击(牙.位, 牙.warmup, 刻, 种子 * 100 + i))} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 撕咬);
