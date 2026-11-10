// 法术演出的组件一侧：<名>.tsx 用 定义法术演出(元, 组件) 当默认导出，各组的表（组/<组>.tsx）收它。
import type React from 'react';
import type { 法术元, 法术演出属性 } from './接口.ts';

export type 法术演出件 = React.FC<法术演出属性>;
export interface 法术演出条 {
  readonly 元: 法术元;
  readonly 画: 法术演出件;
}
export const 定义法术演出 = (元: 法术元, 画: 法术演出件): 法术演出条 => ({ 元, 画 });
