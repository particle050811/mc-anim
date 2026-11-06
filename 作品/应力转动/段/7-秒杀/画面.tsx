// 7-1-3 秒杀：整场共用的 ../7-1/画面.tsx 按本段的变速和机位排出来（../7-1/变速段.tsx）。原生段（段.ts 写了 时钟: '秒'），声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出，变速段不再挂声音。
import React from 'react';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { 变速段 } from '../../地点/古城4x/7-1/变速段.tsx';
import * as choreo from './编排.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export const c713FrameCount = choreo.END;
export const C713: React.FC = () => <变速段 v={choreo.变速} camera={choreo.camera} segId={choreo.号} 带声音={false} />;
export default 定义画面(段, 声音地址, C713);
