// 7-1-7 骏马：整场共用的 ../7-1/画面.tsx 和声音按本段的变速和机位排出来（../7-1/变速段.tsx）。
import React from 'react';
import { 变速段 } from '../../../world/地点/古城4x/7-1/变速段.tsx';
import * as choreo from '../../场/7-黑暗监守/7-1-7/编排.ts';

export const c717FrameCount = choreo.END;
// 下一段切到 7-2-1 李樱，响过段尾的（马蹄）淡掉
export const C717: React.FC = () => <变速段 v={choreo.变速} camera={choreo.camera} segId={choreo.号} tailFade />;
