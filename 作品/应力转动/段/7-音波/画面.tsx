// 7-3-3 音波：整场共用的 ../7-3/画面.tsx 按本段的变速和机位排出来（../7-1/变速段.tsx）。本场收在这里、硬切 7-4-1。
// 变速段 11-06 改成只画画面（7-黑暗监守 迁原生段时），本段的声音等 7-墙头追逐 迁原生段后走 段.ts 的 cue。
import React from 'react';
import type { Cam } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { 变速段 } from '../../地点/古城4x/7-1/变速段.tsx';
import { ScenePicture } from '../../场/7-墙头追逐/7-3/画面.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-3/编排.ts';

const Picture: React.FC<{ t: number; cam: Cam; width: number; height: number }> = ({ t, ...rest }) => <ScenePicture T={t} {...rest} />;
export const c733FrameCount = choreo.END;
export const C733: React.FC = () => <变速段 v={choreo.变速} camera={choreo.camera} Picture={Picture} />;
export default C733;
