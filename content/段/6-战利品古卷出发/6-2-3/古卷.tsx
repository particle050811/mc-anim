// 6-2-3 古卷：第 2 场基地谋划前三段那条共用时间线上的第三个窗口（首帧 = 6-2-2 末帧，末帧 = 6-2-4 首帧）。
// 戏、时刻、机位在 6-2-1/编排.ts，画面在 6-2-1/画面.tsx，台词和音效在 6-2-1/声音.tsx；指南针（指针会转）是 模型/物品/结构指南针.tsx，
// 中间插的结构罗盘搜索界面（游戏里录的）是 模型/界面/结构罗盘.tsx。段长见 6-2-1/编排/时间线.ts 的段表（含插入的 66 帧界面）。
import React from 'react';
import { segmentFrames } from '../6-2-1/编排.ts';
import { BasePlanSegment } from '../6-2-1/画面.tsx';
import { BasePlanSound } from '../6-2-1/声音.tsx';

export const SCROLL_FRAMES = segmentFrames('6-2-3');
export const AncientScroll: React.FC = () => (
  <>
    <BasePlanSegment segment="6-2-3" />
    <BasePlanSound segment="6-2-3" />
  </>
);
