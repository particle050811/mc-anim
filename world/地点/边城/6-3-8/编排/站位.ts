// 两人在北城墙走道上的站位，和朝竖井口看的角度（城的局部坐标 → 场景坐标）。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { BORDER_TOWN } from '../../布局.ts';
import { shaftCellCenter } from '../../6-3-下坠/编排.ts';
import { D2R, add, town } from './工具.ts';

// ---------- 站位 ----------
export const WALK = BORDER_TOWN.h + 0.5; // 走道顶面（城的局部高度）
export const innerEdgeY = BORDER_TOWN.d / 2 - BORDER_TOWN.thick / 2; // 197：城墙内侧墙面
// 两人站在走道上离内沿 1.7 米，刘心忠在西、黄叛在东，中间隔 1.7 米
export const liuStand = town(21.6, innerEdgeY + 1.7, WALK);
export const huangStand = town(23.3, innerEdgeY + 1.7, WALK);
const eyeHeight = 1.62;
// 竖井口（井心在城的地面上）
export const shaftMouth = (): V3 => shaftCellCenter();
// 从 p 看向 q 要转多少（Figure 的 yaw：0 = 朝北，正 = 往左转）、低头多少（headPitch 负 = 低头）
export const yawFromTo = (p: number[], q: number[]) => Math.atan2(-(q[0] - p[0]), q[1] - p[1]) / D2R;
export const pitchTo = (p: number[], q: number[]) => Math.atan2(q[2] - p[2], Math.hypot(q[0] - p[0], q[1] - p[1])) / D2R;
export const faceShaft = (standPos: V3) => ({ yaw: yawFromTo(standPos, shaftMouth()), pitch: pitchTo(add(standPos, [0, 0, eyeHeight]), shaftMouth()) });
