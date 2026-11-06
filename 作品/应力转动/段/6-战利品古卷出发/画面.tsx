// 6-2-1至4 战利品古卷出发：原生段（段.ts 写了 时钟: '秒'）。照旧 6-2至6-3段界/段表.ts 的 6-2-1至4 截表，把旧段组件按 [从, 到) 拼起来，截表的数是 1/24 秒一格，按秒放；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { 拼段 } from '@engine/core/拼段.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { Loot } from './6-2-1/战利品.tsx';
import { WhatElse } from './6-2-2/还差什么.tsx';
import { AncientScroll } from './6-2-3/古卷.tsx';
import { SetOff } from './6-2-4/出发.tsx';
import { FPS, segmentFrames as frames621 } from './6-2-1/编排/时间线.ts';
import { FRAMES as frames624 } from './6-2-4/编排.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

const 截们 = [
  { 段: '6-2-1', 画: Loot, 从: 0, 到: frames621('6-2-1') },
  { 段: '6-2-2', 画: WhatElse, 从: 1, 到: frames621('6-2-2') },
  { 段: '6-2-3', 画: AncientScroll, 从: 1, 到: frames621('6-2-3') - 1 },
  { 段: '6-2-4', 画: SetOff, 从: 0, 到: frames624 },
];

export default 定义画面(段, 声音地址, () => <拼段 截们={截们} 每秒={FPS} />);
