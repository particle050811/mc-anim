// 7-1-3 秒杀：整场共用的 ../7-1/画面.tsx 和声音按本段的变速和机位排出来（../7-1/变速段.tsx）。
import React from 'react';
import { 变速段 } from '../../../world/地点/古城4x/7-1/变速段.tsx';
import * as choreo from './编排.ts';

export const c713FrameCount = choreo.END;
export const C713: React.FC = () => <变速段 v={choreo.变速} camera={choreo.camera} segId={choreo.号} />;
