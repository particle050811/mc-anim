// 7-2-2至3 开到了、传送的 Composition：画面（../7-2/画面.tsx）+ 箱子界面层 + 声音。编排见 编排.ts。
// 远景（第 1 场的人和监守者）在小石屋里拍不到，不画。
// 界面层：原版箱子界面的箱子部分（模型/界面/箱子界面.tsx）出在箱子正上方，像从箱子里弹出来（用户 10-19 定），跟着箱子投到画面上的位置走；
//   右边让开他的脸和身子。古卷那格往上拉一根思索引线，说明框在窗口上方（同 6-2-2 古卷的标注）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { mouthAt } from '../../配音/口型.ts';
import { ScenePicture } from '../../场/7-李樱撤离/7-2/画面.tsx';
import { ChestScreen, chestWindowOverLid } from '@库/界面/箱子界面.tsx';
import { G4 } from '../../地点/古城4x.tsx';
import { chest722 } from '../../地点/古城4x/布局.ts';
import { CHEST } from '@库/物品/箱子.tsx';
import { slotPos } from '@库/界面/箱子格子.ts';
import { PonderCallout } from '@库/界面/思索.tsx';
import { tomeCalloutLines } from '@库/界面/古卷.tsx';
import * as choreo from './编排.ts';
import { GotItTeleportSound } from './声音.tsx';

export const gotItTeleportFrameCount = choreo.帧数;

// 箱盖开满竖起来的上沿（模型/物品/箱子.tsx 的 CHEST.开满盖沿高），窗口下沿就贴在这
const lidTop = G4(chest722.block[0] + 0.5, chest722.block[1] + CHEST.开满盖沿高, chest722.block[2] + 0.5);
// 箱盖中点落在窗口宽度的这个比例处（0.5 是正中）：他站在箱子右边，窗口往左让开他的脸
const WIN_ANCHOR_X = 0.75;

const ChestUiLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const ui = choreo.chestUi(frame);
  if (ui.visibility <= 0) return null;
  const win = chestWindowOverLid(lidTop, choreo.camera(frame), WIN_ANCHOR_X, width, height);
  const s = win.s;
  const [tx, ty] = slotPos(choreo.tomeSlot);
  const lineStart: [number, number] = [win.x + (tx + 8) * s, win.y + (ty - 1) * s];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <ChestScreen s={s} x={win.x} y={win.y} title="箱子" visibility={ui.visibility} chest={ui.chest} hovered={ui.hovered} t={frame / choreo.FPS} />
      <div style={{ opacity: ui.calloutOpacity * ui.visibility }}>
        <PonderCallout
          s={s}
          lineStart={lineStart}
          boxPos={[lineStart[0] - 24 * s, win.y - 12 * s]}
          boxAbove
          slotOutline={[win.x + (tx - 1.5) * s, win.y + (ty - 1.5) * s, 19 * s]}
          lines={tomeCalloutLines[1]}
          progress={ui.callout}
        />
      </div>
    </AbsoluteFill>
  );
};

export const GotItTeleport: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <ScenePicture sf={choreo.sf(frame)} cam={choreo.camera(frame)} 嘴={mouthAt(choreo.台词, '李樱', frame, choreo.FPS)} />
      <ChestUiLayer frame={frame} />
      <GotItTeleportSound />
    </>
  );
};
export default GotItTeleport;
