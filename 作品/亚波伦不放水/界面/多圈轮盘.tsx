// 多圈聚晶轮盘：亚波伦张开的大法术轮盘（用户 11-09 定「原版玩家法术轮盘只有一圈，我想改成多圈以容纳所有法术」）。
// 照原版的：每圈的带子（底色、悬停色、格与格没有缝、第 0 格朝正上顺时针排）、16×16 图标、圆心画一个聚晶图标、背景贴图 focus_wheel.png、
//   最里一圈的 2.5 刻线性弹开、弹完才出图标（都用 库/界面/径向轮盘画.ts 的原版画法；出图标 给 盘心移出 时图标改成从圆心散出去，见 分圈.ts 的 移出态）。
// 圆心：原版画的是法杖上当前装的聚晶；本片固定画启示录的炼狱聚晶（用户 11-09 定「法术中间肯定有炼狱聚晶，以符合他下界之主的身份」），是 默认圆心。
// 本片原创的：多圈和分圈（分圈.ts）、外圈一圈圈依次弹开、各圈慢转、不进齐放的图标压暗、学派分色（默认关，颜色是自己配的，Goety 的 SpellType 没有颜色）、背景贴图随外圈放大（默认不放大）。
// 屏幕上用 <多圈轮盘>；在世界里用 杖尖轮盘.tsx 的 <杖尖轮盘>（以下界魔杖的杖尖为圆心，用户 11-10 定；底下是 库/界面/径向轮盘世界.tsx 的 <轮盘世界面>）。
import React from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { argbColor, iconTopLeft, radialWheelConst, cellRange } from '@库/界面/径向轮盘数.ts';
import { WheelCanvas } from '@库/界面/径向轮盘.tsx';
import { drawPixelImage, drawBackdrop, drawRingBands, type CanvasPos } from '@库/界面/径向轮盘画.ts';
import focusWheelPng from 'asset:贴图/界面/聚晶轮盘';
import { focusIcons } from '../物品/聚晶图标.ts';
import { ringRadius, RingState, ringRotation, retractRingState, openDoneTick, moveOutState, defaultRingShape, defaultOpenClose, type OpenClose } from './分圈.ts';
import { arrangeWheel, type ArrangeOptions, type WheelItem } from './轮盘法术.ts';
import { schoolColor, defaultCenter, type MultiRingParams } from './多圈轮盘参数.ts';

export { schoolColor, defaultCenter, wheelOuterRadius, type MultiRingParams } from './多圈轮盘参数.ts';

/** 闪的那一格：带子的颜色、图标亮度（亮度按 0.1 取整，小画布按亮度缓存） */
const flashColor = (k: number) => `rgba(255,232,180,${(0.35 + 0.6 * k).toFixed(3)})`;
const sparkleLevel = (k: number) => 1 + Math.round(k * 12) / 10;

const itemImage = (focusKey: string): Png | null => {
  const url = (focusIcons as Record<string, string | undefined>)[focusKey];
  return url ? png(url) : null;
};

/** 排盘里图标对照表（物品/聚晶图标.ts）没有的聚晶键 */
export const missingIcons = (options: ArrangeOptions = {}): string[] => arrangeWheel(options).items.flatMap((item) => (itemImage(item.key) ? [] : [item.key]));

const withAlpha = (color: string, opacity: number) => `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${opacity})`;

export const drawMultiRingWheel = (canvasPos: CanvasPos, ringParams: MultiRingParams) => {
  if (ringParams.刻 < 0) return;
  const ringShape = ringParams.ringShape ?? defaultRingShape;
  const ringOpen = { ...defaultOpenClose, ...ringParams.openClose };
  const { cellsPerRing, items: items } = arrangeWheel(ringParams);
  const ringCount = cellsPerRing.length;
  const ringStates = cellsPerRing.map((_, k) => (ringParams.closeTick === undefined ? RingState(k, ringParams.刻, ringShape, ringOpen) : retractRingState(k, ringParams.刻, ringParams.closeTick, ringCount, ringShape, ringOpen)));
  if (!ringStates[0]) return;

  const backdropMode = ringParams.backdropMode ?? '原大';
  if (backdropMode === '原大') drawBackdrop(canvasPos, png(focusWheelPng), ringStates[0]!.progress);
  else if (backdropMode === '随外圈') drawBackdrop(canvasPos, png(focusWheelPng), (ringRadius(ringCount - 1, ringShape).outerRadius / (radialWheelConst.fullInnerRadius * radialWheelConst.outerInnerRatio)) * Math.min(1, ringParams.刻 / openDoneTick(ringCount, ringOpen)));

  const byRing: WheelItem[][] = cellsPerRing.map(() => []);
  for (const item of items) byRing[item.ring]!.push(item);

  // 先画完各圈的带子，再画图标：相邻圈的图标不会被外一圈的带子盖住
  ringStates.forEach((ringState, k) => {
    if (!ringState) return;
    const n = cellsPerRing[k]!;
    drawRingBands(
      canvasPos,
      ringState.内,
      ringState.outerRadius,
      byRing[k]!.map((item, i) => {
        const { start: startAngle, end: end } = cellRange(i, n);
        const isBright = !ringState.animating && (typeof ringParams.selectedId === 'string' ? item.key === ringParams.selectedId : !!ringParams.selectedId?.includes(item.key));
        const flash = ringState.animating ? 0 : (ringParams.flash?.[item.key] ?? 0);
        const color = flash > 0 ? flashColor(flash) : isBright ? argbColor(radialWheelConst.hoverColor) : ringParams.colorBySchool ? withAlpha(schoolColor[item.法.school], ringParams.schoolAlpha ?? 0.4) : argbColor(radialWheelConst.底色);
        return { start: startAngle + ringState.angleRad, end: end + ringState.angleRad, 色: color };
      }),
    );
  });
  const isMoveOut = ringParams.exitIcon === '盘心移出' && ringParams.closeTick === undefined;
  ringStates.forEach((ringState, k) => {
    // 走在路上的（还没弹到、或正在弹的那几圈）：落定的半径、角按 移出态 收拢到圆心
    const exitState = isMoveOut && (!ringState || ringState.animating) ? moveOutState(k, ringParams.刻, ringOpen) : null;
    if (!exitState && (!ringState || ringState.animating)) return;
    const n = cellsPerRing[k]!;
    byRing[k]!.forEach((item, i) => {
      const itemTexture = itemImage(item.key);
      if (!itemTexture) return;
      const flash = ringParams.flash?.[item.key] ?? 0;
      const brightness = item.inReveal ? (flash > 0 ? sparkleLevel(flash) : 1) : (ringParams.dimLevel ?? 0.35);
      if (exitState) {
        const angle = cellRange(i, n).中 + ringRotation(k, ringParams.刻, ringOpen) + exitState.roll;
        const r = ringRadius(k, ringShape).iconRadius * exitState.ratio;
        const side = radialWheelConst.iconEdge * exitState.scale;
        drawPixelImage(canvasPos, itemTexture, r * Math.cos(angle) - side / 2, r * Math.sin(angle) - side / 2, side, side, { brightness });
        return;
      }
      const angle = cellRange(i, n).中 + ringState!.angleRad;
      // 不转时照原版把图标落在 GUI 像素格上；转起来还落格的话图标会一格一格跳，改成只对齐到画布像素
      const side = radialWheelConst.iconEdge;
      const [left, top] = ringOpen.rotSpeed === 0 ? iconTopLeft(angle, ringState!.iconRadius) : [ringState!.iconRadius * Math.cos(angle) - side / 2, ringState!.iconRadius * Math.sin(angle) - side / 2];
      drawPixelImage(canvasPos, itemTexture, left, top, side, side, { brightness });
    });
  });
  const hubKey = ringParams.centerIcon === undefined ? defaultCenter : ringParams.centerIcon;
  const hubMove = isMoveOut && ringStates[0]!.animating ? moveOutState(0, ringParams.刻, ringOpen) : null;
  const centerImage = hubKey && (!ringStates[0]!.animating || hubMove) ? itemImage(hubKey) : null;
  const hubSize = radialWheelConst.iconEdge * (ringParams.centerScale ?? 1) * (hubMove?.scale ?? 1);
  if (centerImage) drawPixelImage(canvasPos, centerImage, -hubSize / 2, -hubSize / 2, hubSize, hubSize);
};

/** 屏幕上的多圈轮盘：圆心在容器正中；s 是 GUI 缩放（见 库/界面/径向轮盘.tsx） */
export const MultiRingWheel: React.FC<MultiRingParams & { width: number; height: number; s: number }> = ({ width: width, height: height, s, ...ringParams }) => <WheelCanvas width={width} height={height} s={s} draw={(canvasPos) => drawMultiRingWheel(canvasPos, ringParams)} />;
