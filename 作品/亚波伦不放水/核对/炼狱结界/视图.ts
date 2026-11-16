// 炼狱结界核对的视图表（纯数据，段.ts 也读）：一秒一个视图。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。
// 前半是原版的线框（@库/特效/炼狱结界.tsx），后半是本片的演法（../../特效/炼狱结界演出.tsx，线是本片的辉线）：史蒂夫站在原点，亚波伦悬在西边空中。
// 演法的几个视图灰底、暗红底（下界的雾色，带雾）各一组，各带一张和原版线并排的对比。
import type { V3 } from '@engine/model/parts.tsx';
import { cagePerformanceDefaults, cagePerformanceTimes, type CagePerformanceSetting } from '../../特效/炼狱结界演出状态.ts';

export const aspect = { width: 1280, height: 720 } as const;

export const yaBoLunPos: V3 = [-13, 0, 5];
export const performanceSettings: CagePerformanceSetting = { ...cagePerformanceDefaults, from: [-12, 0, 6.2], target: [0, 0, 0.9] };
const barrierTime = cagePerformanceTimes(performanceSettings);

type CameraRig = { 眼: V3; 看: V3; fov: number };
export type View = CameraRig & {
  name: string;
  note?: string;
  /** 原版：只画线框（中心在史蒂夫半身高，原版结界长在施法者身上）；演出：本片演法 */
  pictureMode: { type: '原版'; spinSec: number; ageTicks?: number; ground: boolean } | { type: '演出'; sec: number } | { type: '并排'; spinSec: number };
  /** 底色，默认灰。暗红：封面草稿那种下界的雾色，带场景雾（16～70 格），看辉线在暗红里够不够亮 */
  bottomBackground?: '灰' | '暗红';
};

/** 并排对比里两个结界的中心：左原版线、右辉线 */
export const sideBySideCenters: readonly [V3, V3] = [[-11.5, 0, 0.9], [11.5, 0, 0.9]];

const front: CameraRig = { 眼: [0, -34, 0.9], 看: [0, 0, 0.9], fov: 40 };
const groundObliqueRig: CameraRig = { 眼: [-14, -30, 12], 看: [0, 0, 3], fov: 40 };
const sideWideRig: CameraRig = { 眼: [-4, -40, 5], 看: [-4, 0, 5], fov: 40 };
const insideCageRig: CameraRig = { 眼: [2.2, -5.5, 1.5], 看: [0, 0, 2.6], fov: 60 };
const sideBySideRig: CameraRig = { 眼: [0, -50, 6], 看: [0, 0, 4], fov: 40 };
const burnCloseRig: CameraRig = { 眼: [0, -8, 1.6], 看: [0, 0, 1.1], fov: 35 };

const flyOutMidView: View = { name: '演出-飞出0.75秒', ...sideWideRig, pictureMode: { type: '演出', sec: 0.75 }, note: '飞出 1.5 秒的一半：位置、半径走了 75%，透明度 0.5' };
const enclosedWideView: View = { name: '演出-罩住-全景', ...sideWideRig, pictureMode: { type: '演出', sec: barrierTime.engulf + 3 } };
const enclosedInsideCageView: View = { name: '演出-罩住-结界里', ...insideCageRig, pictureMode: { type: '演出', sec: barrierTime.engulf + 3 }, note: '史蒂夫身边往上看' };
const shrinkMidView: View = { name: '演出-收缩中途', ...sideWideRig, pictureMode: { type: '演出', sec: barrierTime.shrinkBurnSec + 0.75 }, note: '收缩 1.5 秒的一半' };
const sideBySide: View = { name: '并排-左原版线-右辉线', ...sideBySideRig, pictureMode: { type: '并排', spinSec: 1 }, note: '同一个大小（半径系数 5.89）、同一个转角；左：照原版的线，右：本片的辉线' };
const withDarkRed = (v: View): View => ({ ...v, name: `暗红底-${v.name}`, bottomBackground: '暗红' });

export const views: readonly View[] = [
  { name: '原版-正面-没转', ...front, pictureMode: { type: '原版', spinSec: 0, ground: false }, note: '没有地面，看整个线框：正十二面体，原版半径系数 5.89，中间是史蒂夫（1.8 格高）' },
  { name: '原版-转1秒', ...front, pictureMode: { type: '原版', spinSec: 1, ground: false }, note: '绕 X、Y、Z 各转 50°' },
  { name: '原版-转2.5秒', ...front, pictureMode: { type: '原版', spinSec: 2.5, ground: false }, note: '各转 125°' },
  { name: '原版-转4秒', ...front, pictureMode: { type: '原版', spinSec: 4, ground: false }, note: '各转 200°' },
  { name: '原版-地面上', ...groundObliqueRig, pictureMode: { type: '原版', spinSec: 1, ground: true }, note: '游戏里的样子：中心在施法者半身高，下半截埋在地下' },
  { name: '原版-淡入15刻', ...groundObliqueRig, pictureMode: { type: '原版', spinSec: 0.75, ageTicks: 15, ground: true }, note: '30 刻淡入的一半，透明度 0.5' },
  { name: '演出-飞出0.3秒', ...sideWideRig, pictureMode: { type: '演出', sec: 0.3 }, note: '刚离手' },
  flyOutMidView,
  enclosedWideView,
  enclosedInsideCageView,
  shrinkMidView,
  { name: '演出-焚烧-全景', ...sideWideRig, pictureMode: { type: '演出', sec: barrierTime.shrinkBurnSec + 2.1 }, note: '缩到一人大小；火是占位' },
  { name: '演出-焚烧-近景', ...burnCloseRig, pictureMode: { type: '演出', sec: barrierTime.shrinkBurnSec + 2.1 }, note: '火是占位（原版 flame、smoke 粒子放大 3 倍）' },
  sideBySide,
  withDarkRed(flyOutMidView),
  withDarkRed(enclosedWideView),
  withDarkRed(enclosedInsideCageView),
  withDarkRed(shrinkMidView),
  withDarkRed(sideBySide),
];
