// 法术演出注册表：按 id 取组件。各组分表（组/<组>.tsx）汇总，顺序和 元表.ts 一样。
import React from 'react';
import type { SpellPerformanceEntry } from './定义.tsx';
import { spellDuration, type SpellPerformanceProps } from './接口.ts';
import { samplePerformance } from './组/样板.tsx';
import { groupAPerformance } from './组/甲.tsx';
import { groupBPerformance } from './组/乙.tsx';
import { groupCPerformance } from './组/丙.tsx';
import { groupDPerformance } from './组/丁.tsx';

export const groupPerformance = { 样板: samplePerformance, 甲: groupAPerformance, 乙: groupBPerformance, 丙: groupCPerformance, 丁: groupDPerformance } as const;
export const spellPerformances: readonly SpellPerformanceEntry[] = Object.values(groupPerformance).flat();

const byId = new Map(spellPerformances.map((entry) => [entry.meta.id, entry]));
export const getSpellPerformance = (id: string): SpellPerformanceEntry => {
  const entry = byId.get(id);
  if (!entry) throw new Error(`法术 ${id} 还没注册演出（已注册：${[...byId.keys()].join('、')}）`);
  return entry;
};

/** 放一发法术：秒 是出手后的秒，[0, 这一发的长秒) 之外不画。放在场景坐标（Z 朝上）的 group 里 */
export const SpellPerformance: React.FC<SpellPerformanceProps & { id: string }> = ({ id, ...props }) => {
  const { meta, spellPerformance } = getSpellPerformance(id);
  if (props.秒 < 0 || props.秒 >= spellDuration(meta, props.from, props.目标, props.options).长秒) return null;
  return React.createElement(spellPerformance, props);
};
