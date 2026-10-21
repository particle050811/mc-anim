// 迁移生成：照旧 6-2至6-3段界/段表.ts 的 6-2-1至4 截表，把旧段组件按 [从, 到) 拼起来（6-3-2 用带思索界面的整片版）。
import React from 'react';
import { 拼段 } from '../../../engine/core/拼段.tsx';
import { Loot } from './6-2-1/战利品.tsx';
import { WhatElse } from './6-2-2/还差什么.tsx';
import { AncientScroll } from './6-2-3/古卷.tsx';
import { SetOff } from './6-2-4/出发.tsx';
import { segmentFrames as frames621 } from './6-2-1/编排/时间线.ts';
import { FRAMES as frames624 } from './6-2-4/编排.ts';

const 截们 = [
  { 段: '6-2-1', 画: Loot, 从: 0, 到: frames621('6-2-1') },
  { 段: '6-2-2', 画: WhatElse, 从: 1, 到: frames621('6-2-2') },
  { 段: '6-2-3', 画: AncientScroll, 从: 1, 到: frames621('6-2-3') - 1 },
  { 段: '6-2-4', 画: SetOff, 从: 0, 到: frames624 },
];

const 画面: React.FC = () => <拼段 截们={截们} />;
export default 画面;
