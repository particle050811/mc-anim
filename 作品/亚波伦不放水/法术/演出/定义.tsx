// 法术演出的组件一侧：<名>.tsx 用 定义法术演出(元, 组件) 当默认导出，各组的表（组/<组>.tsx）收它。
import type React from 'react';
import type { SpellMeta, SpellPerformanceProps } from './接口.ts';

export type SpellPerformanceComp = React.FC<SpellPerformanceProps>;
export interface SpellPerformanceEntry {
  readonly meta: SpellMeta;
  readonly spellPerformance: SpellPerformanceComp;
}
export const defineSpellPerformance = (meta: SpellMeta, spellPerformance: SpellPerformanceComp): SpellPerformanceEntry => ({ meta, spellPerformance });
