// 法术演出注册表：按 id 取组件。各组分表（组/<组>.tsx）汇总，顺序和 元表.ts 一样。
import React from 'react';
import type { 法术演出条 } from './定义.tsx';
import { 法术时长, type 法术演出属性 } from './接口.ts';
import { 样板演出 } from './组/样板.tsx';
import { 甲演出 } from './组/甲.tsx';
import { 乙演出 } from './组/乙.tsx';
import { 丙演出 } from './组/丙.tsx';
import { 丁演出 } from './组/丁.tsx';

export const 分组演出 = { 样板: 样板演出, 甲: 甲演出, 乙: 乙演出, 丙: 丙演出, 丁: 丁演出 } as const;
export const 法术演出表: readonly 法术演出条[] = Object.values(分组演出).flat();

const 按id = new Map(法术演出表.map((条) => [条.元.id, 条]));
export const 取法术演出 = (id: string): 法术演出条 => {
  const 条 = 按id.get(id);
  if (!条) throw new Error(`法术 ${id} 还没注册演出（已注册：${[...按id.keys()].join('、')}）`);
  return 条;
};

/** 放一发法术：秒 是出手后的秒，[0, 这一发的长秒) 之外不画。放在场景坐标（Z 朝上）的 group 里 */
export const 法术演出: React.FC<法术演出属性 & { id: string }> = ({ id, ...属性 }) => {
  const { 元, 画 } = 取法术演出(id);
  if (属性.秒 < 0 || 属性.秒 >= 法术时长(元, 属性.起点, 属性.目标).长秒) return null;
  return React.createElement(画, 属性);
};
