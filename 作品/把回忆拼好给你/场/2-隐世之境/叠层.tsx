// 第 15 句重逢这一场叠在 3D 画布上面的 2D：她头顶的车万女仆气泡、封面版聊天行。都放在铺满画面、position 不是 static 的容器里（AbsoluteFill）。
// 气泡照游戏挂在名牌点上、按游戏里的大小（一个气泡像素 0.025 格）取整数缩放，所以跟着机位算：机位要和画 3D 的那台同一组参数。
// 封面版聊天行只在封面上用（片里是原版位置的 库/界面/像素聊天栏），位置、缩放见 参数.ts 的 封面聊天。
import React, { useLayoutEffect, useRef } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { MaidBubble, bubbleAnchorHeight, bubblePixelSize } from '@库/界面/女仆气泡.tsx';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { chatLineOpacity } from '@库/界面/像素聊天栏.tsx';
import { filmScale } from '@库/界面/像素字表.ts';
import { aspect } from '../../分镜/时间.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { liYing, bubbleText, coverChatLayout } from './参数.ts';
import { doorwayRig } from './布景.tsx';
import { coverChatBox } from './封面.ts';

type PerspectiveRigSpec = { 眼: V3; 看: V3; fov: number };

/** 气泡挂在哪、多大：锚 = 名牌点（脚底 + 女仆气泡锚高）投到页面上的位置（页面像素）；缩放 = 一个气泡像素在锚点处几个成片像素，四舍五入 */
export const bubblePlacement = (rig: PerspectiveRigSpec = doorwayRig, feet: V3 = liYing.feet, width: number = aspect.width, height: number = aspect.height) => {
  const cam = makePerspectiveCamera({ 眼: zUpToThree(rig.眼), 看: zUpToThree(rig.看), fov: rig.fov, width: width, height: height });
  const p = projectToPage(cam, zUpToThree([feet[0], feet[1], feet[2] + bubbleAnchorHeight()]), width, height);
  return { 锚: { x: p.x, y: p.y }, scale: Math.max(1, Math.round(p.pxPerCell * bubblePixelSize * filmScale)), inFront: p.inFront };
};

/** 她头顶的气泡。文字默认 参数 的 气泡字；弹出见 库/界面/女仆气泡.tsx */
export const ReunionBubble: React.FC<{ 文字?: string; cameraRig?: PerspectiveRigSpec; feet?: V3; popProgress?: number }> = ({ 文字: text = bubbleText, cameraRig = doorwayRig, feet = liYing.feet, popProgress }) => {
  const { 锚: anchor, scale: scale, inFront } = bubblePlacement(cameraRig, feet);
  if (!inFront) return null;
  return <MaidBubble 锚={anchor} scale={scale} 文字={text} 字体={pixelFont} popProgress={popProgress} />;
};

const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const systemBarColor = [208, 208, 208]; // #D0D0D0，GuiMessageTag.system()
/** 封面版聊天行：一行原版聊天（黑条半透明、左边系统竖条、字带原版阴影），刚出来那一刻的不透明度。
 *  竖条 = false 不画左边那根灰竖条（第 15 句封面，主会话 10-24 美术定稿：去掉 B 站封面左边那根灰竖条），黑条照旧从 0 起 */
export const CoverChatLine: React.FC<{ 文字?: string; 色?: string; layout?: typeof coverChatLayout; verticalBar?: boolean }> = ({
  文字: text = 'Steve加入了游戏',
  色: color = yellow,
  layout = coverChatLayout,
  verticalBar = true,
}) => {
  const s = layout.scale;
  if (!Number.isInteger(s) || s < 1) throw new Error(`封面聊天行的缩放要是正整数（成片像素），给的是 ${s}`);
  const ref = useRef<HTMLCanvasElement>(null);
  const rowWidth = pixelFont.textWidth(text) + 8;
  const a = chatLineOpacity(0)!;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = `rgba(0,0,0,${a.bottomAlpha / 255})`;
    ctx.fillRect(0, 0, rowWidth * s, 9 * s);
    if (verticalBar) {
      ctx.fillStyle = `rgba(${systemBarColor.join(',')},${a.char / 255})`;
      ctx.fillRect(0, 0, 2 * s, 9 * s);
    }
    pixelFont.draw(ctx, text, { x: 0, y: 0 }, 4, 1, color, s, { shadow: true, opacity: a.char });
  });
  const b = coverChatBox(pixelFont.textWidth(text), layout);
  // 画布往下多 1 个界面像素，给字的阴影
  return (
    <canvas
      ref={ref}
      width={rowWidth * s}
      height={10 * s}
      style={{ position: 'absolute', left: b.x0, top: b.y0, width: (rowWidth * s) / filmScale, height: (10 * s) / filmScale }}
    />
  );
};
