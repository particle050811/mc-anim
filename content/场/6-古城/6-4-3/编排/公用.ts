// 6-4-3 编排各部分共用的：向量小工具、全局帧 → 剧情秒、黄叛本地坐标（右、前、上）→ 场景。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { G4 } from '../../../../../world/地点/古城4x.tsx';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
export const gameToScene = G4;
export const ss = geom.ss;
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const lerpV = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const norm = (vec: V3): V3 => {
  const mag = Math.hypot(vec[0], vec[1], vec[2]) || 1;
  return [vec[0] / mag, vec[1] / mag, vec[2] / mag];
};
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const storySecAt = (g: number) => timeline.剧情时间(g);
export const fromHuangPanLocal = (x: number, y: number, z: number): V3 => {
  const yawRad = (geom.黄叛朝向 * Math.PI) / 180;
  const foot = geom.黄叛脚底;
  return [foot[0] + x * Math.cos(yawRad) - y * Math.sin(yawRad), foot[1] + x * Math.sin(yawRad) + y * Math.cos(yawRad), foot[2] + z];
};
