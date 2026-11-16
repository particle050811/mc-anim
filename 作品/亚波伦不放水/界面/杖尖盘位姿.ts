// 杖尖轮盘的摆法（纯模块）：轮盘从下界魔杖的杖尖张开、以杖尖为圆心（用户 11-10 定：「亚波伦拿着法杖，然后法杖尖端展开面板」，不是立在她背后）。
// 输入杖的位置和方向（角色/娘化亚波伦.tsx 的 持杖位姿），算盘面的圆心、法向和「上」；盘面怎么朝向有三种，哪种当全片默认还没定（分镜.md 第 10 节）。
// 盘跟不跟着杖走由调用的人定：每帧给当前的杖位姿就是跟着走，给张开那一刻的就是留在原地。坐标都是场景坐标（Z 朝上，单位格）。
import type { Cam } from '@engine/core/机位.ts';
import { sightDir } from '@engine/core/机位.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { cellRange } from '@库/界面/径向轮盘数.ts';
import { RingState, defaultRingShape, defaultOpenClose, type OpenClose } from './分圈.ts';
import { arrangeWheel, type ArrangeOptions } from './轮盘法术.ts';

/**
 * 盘面朝哪：
 * 垂直杖身 = 盘面和杖身垂直、杖尖顶着圆心，像撑开的伞；杖指哪盘朝哪。
 * 正对 = 盘面和这个机位的画面平行（圆心还钉在杖尖），在画面里永远是正圆。
 * 法向 = 盘面朝一个定死的方向（如朝上张在头顶），不随杖和镜头转。
 */
export type PlateFacing = '垂直杖身' | { faceCamera: Pick<Cam, 'pos' | 'tgt'> } | { normal: V3 };

export type PlatePose = {
  心: V3;
  /** 盘面正面朝的方向（图标从这一侧看是正的，从背面看左右相反） */
  normal: V3;
  /** 盘上第 0 格（原版朝正上）指的方向 */
  上: V3;
  /** 从正面看的右手边 */
  right: V3;
};

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const normalize = (a: readonly number[]): V3 => {
  const n = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / n, a[1]! / n, a[2]! / n];
};

export type DiscPlacement = {
  facing: PlateFacing;
  /** 垂直杖身时盘的正面朝杖尖指的方向（默认）还是朝杖尾（反面） */
  reverseSide?: boolean;
  /** 「上」的参考方向，投到盘面上当第 0 格的方向；默认世界的上 (0, 0, 1)，盘面水平时改用北 (0, 1, 0) */
  upRef?: V3;
  /** 圆心沿杖身再往外伸多少格，默认 0（圆心就在杖尖） */
  tipOffset?: number;
  /** 圆心沿盘的法向往正面挪多少格，默认 0。正对镜头时给一点，圆心的聚晶图标就不会被杖头挡住 */
  lift?: number;
};

export const staffTipPlatePose = (staff: { tip: V3; axis: V3 }, { facing, reverseSide, upRef, tipOffset = 0, lift = 0 }: DiscPlacement): PlatePose => {
  const normal = normalize(facing === '垂直杖身' ? addVec([0, 0, 0], staff.axis, reverseSide ? -1 : 1) : 'faceCamera' in facing ? addVec([0, 0, 0], sightDir(facing.faceCamera), -1) : facing.normal);
  const toPlane = (v: readonly number[]) => addVec(v, normal, -dot(v, normal));
  let up = toPlane(upRef ?? [0, 0, 1]);
  if (Math.hypot(...up) < 0.05) up = toPlane([0, 1, 0]);
  up = normalize(up);
  return { 心: addVec(addVec(staff.tip, staff.axis, tipOffset), normal, lift), normal, 上: up, right: cross(up, normal) };
};

/** 盘面上的一点：x、y 是轮盘画布的 GUI 像素（圆心为原点，x 朝右、y 朝下，同 库/界面/径向轮盘画.ts） */
export const discPoint = (disc: PlatePose, cellsPerPixel: number, x: number, y: number): V3 => addVec(addVec(disc.心, disc.right, x * cellsPerPixel), disc.上, -y * cellsPerPixel);

/** 某个聚晶那一格的图标中心在场景里的位置（法术从盘上自己那一格出手用）；盘上没有这个聚晶、或那一圈还没弹开返回 null */
export const discCellPos = (disc: PlatePose, cellsPerPixel: number, plateParams: ArrangeOptions & { 刻: number; openClose?: Partial<OpenClose> }, focusKey: string): V3 | null => {
  const { cellsPerRing, items: items } = arrangeWheel(plateParams);
  const item = items.find((p) => p.key === focusKey);
  const ringState = item && RingState(item.ring, plateParams.刻, plateParams.ringShape ?? defaultRingShape, { ...defaultOpenClose, ...plateParams.openClose });
  if (!item || !ringState) return null;
  const angle = cellRange(item.cell, cellsPerRing[item.ring]!).中 + ringState.angleRad;
  return discPoint(disc, cellsPerPixel, ringState.iconRadius * Math.cos(angle), ringState.iconRadius * Math.sin(angle));
};
