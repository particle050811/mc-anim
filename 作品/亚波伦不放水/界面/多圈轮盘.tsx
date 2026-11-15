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
import type { SpellSchool } from '../法术/法术表.ts';
import { focusIcons } from '../物品/聚晶图标.ts';
import { ringRadius, RingState, ringRotation, retractRingState, openDoneTick, moveOutState, defaultRingShape, defaultOpenClose, type OpenClose } from './分圈.ts';
import { arrangeWheel, type ArrangeOptions, type WheelItem } from './轮盘法术.ts';

/** 学派分色用的颜色：自己配的（原创），只在 学派分色 打开时用 */
export const schoolColor: Record<SpellSchool, string> = {
  魔法: '#c8c8d8',
  死灵: '#38c9b0',
  下界: '#ff5a2a',
  灾厄: '#7d8fa3',
  霜冻: '#8fdcff',
  占卜: '#b08a52',
  烈风: '#cfe8d0',
  风暴: '#ffe14d',
  深渊: '#2a6fd6',
  荒野: '#5fbf3a',
  虚空: '#9a3fd6',
};

/** 圆心默认画的聚晶：启示录的炼狱聚晶（goety_revelation:revelation_focus），用户 11-09 定 */
export const defaultCenter = 'goety_revelation:revelation_focus';

export type MultiRingParams = ArrangeOptions & {
  /** 打开后第几刻（可带小数，1 刻 = 1/20 秒） */
  刻: number;
  /** 高亮的格（聚晶键，如 goety:fireball_focus；齐放时给一串），画成原版的悬停色；那一圈弹完才亮 */
  selectedId?: string | readonly string[];
  /** 圆心画哪个聚晶的图标（聚晶键）；不给 = 默认圆心（炼狱聚晶），null = 不画。最里一圈弹完才画，同原版 */
  centerIcon?: string | null;
  /** 圆心图标放大几倍，默认 1（原版 16 GUI 像素）。封面草稿里放大当「头顶的第二个光环」试过，正片不用 */
  centerScale?: number;
  /** 背景贴图：原大 = 和原版一圈时一样大（默认）；随外圈 = 按最外圈和原版外半径的比例放大；无 = 不画 */
  backdropMode?: '原大' | '随外圈' | '无';
  /** 带子按学派上色（原创，默认关） */
  colorBySchool?: boolean;
  /** 学派分色时带子颜色的不透明度，默认 0.4 */
  schoolAlpha?: number;
  /** 「全部」档里不进齐放的图标亮度，默认 0.35 */
  dimLevel?: number;
  /** 图标怎么出来：弹完（默认，同原版 isReady() 了一下全出来）；盘心移出（原创，第 2 幕张盘，用户 11-11）：一开盘全缩成一小团叠在圆心，
   *  边往外走边放大，那一圈弹完正好落到格上（分圈.ts 的 移出态），圆心图标也从小长到原大。收盘（收刻）不管它 */
  exitIcon?: '弹完' | '盘心移出';
  /** 弹开节奏和转速，没给的项用 默认开合 */
  openClose?: Partial<OpenClose>;
  /** 收盘：开始收后第几刻（原创，第 5 幕；分圈.ts 的 收圈态）。不给 = 不收 */
  closeTick?: number;
  /** 一闪（原创，第 4 幕出手时那一格的法术离手）：聚晶键 → 0～1，带子往暖白提、图标提亮；那一圈弹完才闪 */
  flash?: Readonly<Record<string, number>>;
};

/** 闪的那一格：带子的颜色、图标亮度（亮度按 0.1 取整，小画布按亮度缓存） */
const flashColor = (k: number) => `rgba(255,232,180,${(0.35 + 0.6 * k).toFixed(3)})`;
const sparkleLevel = (k: number) => 1 + Math.round(k * 12) / 10;

const itemImage = (focusKey: string): Png | null => {
  const url = (focusIcons as Record<string, string | undefined>)[focusKey];
  return url ? png(url) : null;
};

/** 排盘里图标对照表（物品/聚晶图标.ts）没有的聚晶键 */
export const missingIcons = (options: ArrangeOptions = {}): string[] => arrangeWheel(options).项.flatMap((item) => (itemImage(item.键) ? [] : [item.键]));

const withAlpha = (color: string, opacity: number) => `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${opacity})`;

/** 最外圈张开后的外半径（GUI 像素）：摆位置、定缩放用 */
export const wheelOuterRadius = (options: ArrangeOptions = {}) => ringRadius(arrangeWheel(options).cellsPerRing.length - 1, options.ringShape ?? defaultRingShape).outerRadius;

export const drawMultiRingWheel = (canvasPos: CanvasPos, ringParams: MultiRingParams) => {
  if (ringParams.刻 < 0) return;
  const ringShape = ringParams.ringShape ?? defaultRingShape;
  const ringOpen = { ...defaultOpenClose, ...ringParams.openClose };
  const { cellsPerRing, 项: items } = arrangeWheel(ringParams);
  const ringCount = cellsPerRing.length;
  const ringStates = cellsPerRing.map((_, k) => (ringParams.closeTick === undefined ? RingState(k, ringParams.刻, ringShape, ringOpen) : retractRingState(k, ringParams.刻, ringParams.closeTick, ringCount, ringShape, ringOpen)));
  if (!ringStates[0]) return;

  const backdropMode = ringParams.backdropMode ?? '原大';
  if (backdropMode === '原大') drawBackdrop(canvasPos, png(focusWheelPng), ringStates[0]!.进度);
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
        const { 起: startAngle, 止: end } = cellRange(i, n);
        const isBright = !ringState.animating && (typeof ringParams.selectedId === 'string' ? item.键 === ringParams.selectedId : !!ringParams.selectedId?.includes(item.键));
        const flash = ringState.animating ? 0 : (ringParams.flash?.[item.键] ?? 0);
        const color = flash > 0 ? flashColor(flash) : isBright ? argbColor(radialWheelConst.hoverColor) : ringParams.colorBySchool ? withAlpha(schoolColor[item.法.school], ringParams.schoolAlpha ?? 0.4) : argbColor(radialWheelConst.底色);
        return { 起: startAngle + ringState.angleRad, 止: end + ringState.angleRad, 色: color };
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
      const itemTexture = itemImage(item.键);
      if (!itemTexture) return;
      const flash = ringParams.flash?.[item.键] ?? 0;
      const brightness = item.inReveal ? (flash > 0 ? sparkleLevel(flash) : 1) : (ringParams.dimLevel ?? 0.35);
      if (exitState) {
        const angle = cellRange(i, n).中 + ringRotation(k, ringParams.刻, ringOpen) + exitState.roll;
        const r = ringRadius(k, ringShape).iconRadius * exitState.ratio;
        const side = radialWheelConst.iconEdge * exitState.缩放;
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
  const hubSize = radialWheelConst.iconEdge * (ringParams.centerScale ?? 1) * (hubMove?.缩放 ?? 1);
  if (centerImage) drawPixelImage(canvasPos, centerImage, -hubSize / 2, -hubSize / 2, hubSize, hubSize);
};

/** 屏幕上的多圈轮盘：圆心在容器正中；s 是 GUI 缩放（见 库/界面/径向轮盘.tsx） */
export const MultiRingWheel: React.FC<MultiRingParams & { 宽: number; 高: number; s: number }> = ({ 宽: width, 高: height, s, ...ringParams }) => <WheelCanvas 宽={width} 高={height} s={s} draw={(canvasPos) => drawMultiRingWheel(canvasPos, ringParams)} />;
