// 6-3-8 编排共用的小工具：插值、方向、城的局部坐标。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { borderTownPos } from '../../../主世界116.ts';

export const D2R = Math.PI / 180;
export const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerp3 = (a: number[], b: number[], k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const add = (a: number[], b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm = (vec: number[]): V3 => {
  const len = Math.hypot(vec[0], vec[1], vec[2]) || 1;
  return [vec[0] / len, vec[1] / len, vec[2] / len];
};
export const slerpDir = (dirA: V3, dirB: V3, k: number): V3 => {
  const va = new THREE.Vector3(...dirA);
  const quat = new THREE.Quaternion().setFromUnitVectors(va, new THREE.Vector3(...dirB));
  const rotated = va.applyQuaternion(new THREE.Quaternion().slerp(quat, k));
  return [rotated.x, rotated.y, rotated.z];
};
// 城的局部坐标 → 场景坐标
export const town = (x: number, y: number, z: number): V3 => [borderTownPos[0] + x, borderTownPos[1] + y, borderTownPos[2] + z];
