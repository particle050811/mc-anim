// 6-3-5 举锤：6-3 下坠（镜头/6-3-下坠/）这条共用时间线上的一个窗口。戏、时钟、机位在 6-3-下坠/编排.ts、时间线.ts，画面在 画面.tsx。
// 声音照 6-举锤砸穿 段.ts 的 cue 放（定义画面 自动挂），不再挂 6-3-下坠/声音.tsx。
import React from 'react';
import { FallSegment } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { 段帧数 } from '../../../地点/边城/6-3-下坠/时间线.ts';

export const RaiseMace_FRAMES = 段帧数('6-3-5');
export const RaiseMace: React.FC = () => <FallSegment segment="6-3-5" />;
