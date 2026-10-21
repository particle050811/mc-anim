// 7-1 戏各部分共用的：缓动、插值、角度小工具，地面高度，场时刻 → 游戏秒。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { yawTo } from '../../6-4-1/古城戏.ts';
import * as K649 from '../../6-4-9/编排.ts';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
export const FPS = timeline.FPS;
export const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerpV = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const pulseWindow = (t: number, a: number, b: number, rampIn = 0.2, rampOut = 0.2) => ss((t - a) / rampIn) * (1 - ss((t - b) / rampOut));
export const yawFromTo = (from: number[], to: number[]) => yawTo(to[0] - from[0], to[1] - from[1]);
export const elevationDeg = (from: number[], to: number[]) => (Math.atan2(to[2] - from[2], Math.hypot(to[0] - from[0], to[1] - from[1])) * 180) / Math.PI;
export const groundZ = geom.floorZ;
export const gameSec = (t: number) => K649.gameSecAt(geom.handoffFrame649) + t;
// 6-4-9 末帧以后的场时刻 t 照 6-4-9 接着演的：吼叫动画（吼到一半切过来）、二人的姿势（顶着吼声压低、吼完起来、喘气）
export const roarAnimSec = (t: number) => K649.roarAnimSec(geom.handoffFrame649 + t * FPS);
export const pursuersAfter649 = (t: number) => K649.pursuers(geom.handoffFrame649 + t * FPS);
