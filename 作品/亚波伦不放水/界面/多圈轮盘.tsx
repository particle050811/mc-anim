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
import { ringRadius, RingState, retractRingState, openDoneTick, moveOutSlot, defaultRingShape, defaultOpenClose } from './分圈.ts';
import { arrangeWheel, type ArrangeOptions, type WheelItem } from './轮盘法术.ts';
import { schoolColor, defaultCenter, type MultiRingParams } from './多圈轮盘参数.ts';
import { chargeIcon } from './聚晶自发光.ts';

export { schoolColor, defaultCenter, wheelOuterRadius, type MultiRingParams } from './多圈轮盘参数.ts';

const itemImage = (focusKey: string): Png | null => {
  const url = (focusIcons as Record<string, string | undefined>)[focusKey];
  return url ? png(url) : null;
};

/** 排盘里图标对照表（物品/聚晶图标.ts）没有的聚晶键 */
export const missingIcons = (options: ArrangeOptions = {}): string[] => arrangeWheel(options).items.flatMap((item) => (itemImage(item.key) ? [] : [item.key]));

const withAlpha = (color: string, opacity: number) => `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${opacity})`;

const iconEdge = radialWheelConst.iconEdge;
type Corner = [number, number];
type IconCover = { corner: Corner; size: number };
const iconCorner = (angle: number, radius: number, snap: boolean): Corner => snap ? iconTopLeft(angle, radius) : [radius * Math.cos(angle) - iconEdge / 2, radius * Math.sin(angle) - iconEdge / 2];

/** 从上一格背后抽出。遮的是整枚贴图（包括透明孔），边缘与 drawPixelImage 对齐到同一画布像素。 */
const drawEmergingIcon = (pos: CanvasPos, image: Png, corner: Corner, brightness: number, covers: IconCover[]) => {
  const left = Math.round(pos.centerX + corner[0] * pos.scale);
  const top = Math.round(pos.centerY + corner[1] * pos.scale);
  const side = Math.round(iconEdge * pos.scale);
  pos.ctx.save();
  for (const cover of covers) {
    const dx = Math.round(pos.centerX + cover.corner[0] * pos.scale) - left;
    const dy = Math.round(pos.centerY + cover.corner[1] * pos.scale) - top;
    const coverSide = Math.round(cover.size * pos.scale);
    if (dx >= side || dy >= side || dx + coverSide <= 0 || dy + coverSide <= 0) continue;
    if (dx <= 0 && dy <= 0 && dx + coverSide >= side && dy + coverSide >= side) {
      pos.ctx.restore();
      return;
    }
    pos.ctx.beginPath();
    pos.ctx.rect(left, top, side, side);
    pos.ctx.rect(left + dx, top + dy, coverSide, coverSide);
    pos.ctx.clip('evenodd');
  }
  drawPixelImage(pos, image, ...corner, iconEdge, iconEdge, { brightness });
  pos.ctx.restore();
};

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
        const color = isBright ? argbColor(radialWheelConst.hoverColor) : ringParams.colorBySchool ? withAlpha(schoolColor[item.法.school], ringParams.schoolAlpha ?? 0.4) : argbColor(radialWheelConst.底色);
        return { start: startAngle + ringState.angleRad, end: end + ringState.angleRad, 色: color };
      }),
    );
  });
  const isMoveOut = ringParams.exitIcon === '盘心移出' && ringParams.closeTick === undefined;
  const hubKey = ringParams.centerIcon === undefined ? defaultCenter : ringParams.centerIcon;
  const centerImage = hubKey && (!ringStates[0]!.animating || isMoveOut) ? itemImage(hubKey) : null;
  const hubSize = iconEdge * (ringParams.centerScale ?? 1);
  const sharedCovers = new Map<number, IconCover[]>();
  ringStates.forEach((ringState, k) => {
    const moving = !ringState || ringState.animating;
    if (moving && !isMoveOut) return;
    const n = cellsPerRing[k]!;
    byRing[k]!.forEach((item, i) => {
      const slot = moving ? moveOutSlot(k, i, cellsPerRing, ringParams.刻, ringShape, ringOpen) : null;
      const icon = itemImage(item.key);
      if (!icon) return;
      const itemTexture = chargeIcon(icon, item.inReveal ? ringParams.flash?.[item.key] ?? 0 : 0);
      const brightness = item.inReveal ? 1 : (ringParams.dimLevel ?? 0.35);
      const snap = ringOpen.rotSpeed === 0;
      const corner = slot ? iconCorner(slot.angle, slot.radius, snap && !!slot.carrier?.settled) : iconCorner(cellRange(i, n).中 + ringState!.angleRad, ringState!.iconRadius, snap);
      if (slot?.carrier) {
        const carrier = slot.carrier;
        const covers = sharedCovers.get(carrier.cell) ?? [{ corner: iconCorner(carrier.angle, carrier.radius, snap && carrier.settled), size: iconEdge }];
        drawEmergingIcon(canvasPos, itemTexture, corner, brightness, covers);
        covers.push({ corner, size: iconEdge });
        sharedCovers.set(carrier.cell, covers);
      } else if (slot && centerImage) drawEmergingIcon(canvasPos, itemTexture, corner, brightness, [{ corner: [-hubSize / 2, -hubSize / 2], size: hubSize }]);
      else drawPixelImage(canvasPos, itemTexture, ...corner, iconEdge, iconEdge, { brightness });
    });
  });
  if (centerImage && hubKey) {
    const pulse = ringParams.flash?.[hubKey] ?? 0;
    drawPixelImage(canvasPos, chargeIcon(centerImage, pulse), -hubSize / 2, -hubSize / 2, hubSize, hubSize);
  }
};

/** 屏幕上的多圈轮盘：圆心在容器正中；s 是 GUI 缩放（见 库/界面/径向轮盘.tsx） */
export const MultiRingWheel: React.FC<MultiRingParams & { width: number; height: number; s: number }> = ({ width: width, height: height, s, ...ringParams }) => <WheelCanvas width={width} height={height} s={s} draw={(canvasPos) => drawMultiRingWheel(canvasPos, ringParams)} />;
