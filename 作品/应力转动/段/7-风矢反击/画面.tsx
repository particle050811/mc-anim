// 7-1-5 风矢：整场共用的 ../7-1/画面.tsx 和声音按本段的变速和机位排出来（../7-1/变速段.tsx）。
import React from 'react';
import { 变速段 } from '../../地点/古城4x/7-1/变速段.tsx';
import * as choreo from '../../场/7-黑暗监守/7-1-5/编排.ts';

export const c715FrameCount = choreo.END;
export const C715: React.FC = () => <变速段 v={choreo.变速} camera={choreo.camera} segId={choreo.号} />;
export default C715;
