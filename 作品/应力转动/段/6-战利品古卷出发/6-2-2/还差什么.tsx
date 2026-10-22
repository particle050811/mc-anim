// 6-2-2 还差什么：第 2 场基地谋划前三段那条共用时间线上的第二个窗口（首帧 = 6-2-1 末帧）。戏、时刻、机位在 6-2-1/编排.ts，画面在 6-2-1/画面.tsx，
// 台词和音效在 6-2-1/声音.tsx；这一段打开的 JEI 铁砧页（古卷）和思索标注在 模型/界面/古卷.tsx。
import React from 'react';
import { segmentFrames } from '../6-2-1/编排.ts';
import { BasePlanSegment } from '../6-2-1/画面.tsx';
import { BasePlanSound } from '../6-2-1/声音.tsx';

export const WHAT_ELSE_FRAMES = segmentFrames('6-2-2');
export const WhatElse: React.FC = () => (
  <>
    <BasePlanSegment segment="6-2-2" />
    <BasePlanSound segment="6-2-2" />
  </>
);
