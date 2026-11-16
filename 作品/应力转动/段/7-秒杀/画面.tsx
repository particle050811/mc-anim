// 7-1-3 秒杀：整场共用的 ../7-1/画面.tsx 按本段的变速和机位排出来（../7-1/变速段.tsx）。声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import React from 'react';
import { definePicture } from '@engine/段/段画面.tsx';
import { SpeedRampSegment } from '../../地点/古城4x/7-1/变速段.tsx';
import * as choreo from './编排.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export const C713: React.FC = () => <SpeedRampSegment v={choreo.speedRamp} camera={choreo.camera} />;
export default definePicture(seg, soundUrl, C713);
