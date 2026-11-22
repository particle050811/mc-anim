// 第 4 幕 齐放的镜头表（纯模块）：画面.tsx 照它摆镜头，地形视图.ts 拿它给加载计划，两边同一份。
import * as THREE from 'three';
import { deg, lerp, rad, smoothstep01 } from '@engine/core/数学.ts';
import { rigSpline, type Cam, type SplineKey } from '@engine/core/机位.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { pickShot, type Shot } from '../../场/1-台地/台地机位.ts';
import { releaseRig } from '../../场/1-台地/绕拍.ts';
import { hurtTilt } from '../../场/1-台地/齐放拍.ts';
import { yaBoLunPos, steveViewAt, steveFoot, secAt, cameraStart } from '../../场/1-台地/编排-齐放.ts';
import seg from './段.ts';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const mixVec = (a: readonly number[], b: readonly number[], u: number): V3 => [lerp(a[0]!, b[0]!, u), lerp(a[1]!, b[1]!, u), lerp(a[2]!, b[2]!, u)];
const atHeight = (z: number): V3 => [0, 0, z];
const S = steveFoot;
/** 她在幕内第 s 秒的脚底、胸口 */
const yaBoLunAt = (s: number) => yaBoLunPos(secAt(s));
const chestAt = (s: number) => addVec(yaBoLunAt(s), atHeight(1.1));
const openingSpread = Math.hypot(...chestAt(0).map((coord, index) => coord - S[index]!));
/** 水平单位向量 a → b；侧 = 它往右转 90 度 */
const dirBetween = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const vecLength = Math.hypot(x, y) || 1;
  return [x / vecLength, y / vecLength, 0];
};
const perpendicular = (v: V3): V3 => [v[1], -v[0], 0];
const keyframe = (s: number, pos: V3, tgt: V3, lens: number): SplineKey => [s, { pos, tgt, lens }];
const linspace = (startSec: number, end: number, n: number) => Array.from({ length: n + 1 }, (_, i) => startSec + ((end - startSec) * i) / n);
/** 跟拍：从 起 到 止 每 步 秒放一个关键机位（她一下冲 0.3～0.55 秒、峰值 24～29 格/秒，关键隔得稀样条就跟不上） */
const follow = (startSec: number, end: number, cameraRig: (s: number) => [V3, V3, number], stepSec = 0.1): SplineKey[] =>
  linspace(startSec, end, Math.max(1, Math.ceil((end - startSec) / stepSec - 1e-9))).map((s) => keyframe(s, ...cameraRig(s)));
const makeShot = (name: string, startSec: number, keyframes: readonly SplineKey[]): Shot => ({ name: name, start: startSec, cameraRig: (_u, shotSec): Cam => rigSpline(keyframes, startSec + shotSec) });

/** 原版默认 fov 70（竖直）的焦距，同第 5 幕 */
const firstPersonLensMm = 14.46;
/** bobHurt 在视图空间的转轴（齐放拍.ts 的 受伤们 开头）：视图空间 x 右、y 上、−z 往前 */
export const hurtAxis = (yawDeg: number) => new THREE.Vector3(Math.sin(rad(yawDeg)), 0, -Math.cos(rad(yawDeg)));
const upAxis = new THREE.Vector3(0, 0, 1);
/** 第一人称机位：原版投影前先乘 R（bobHurt），世界里的相机就转 R⁻¹；换成看点 + 绕视线的 roll（engine/core/机位.ts 的约定：lookAt 以后 rotateZ(+roll)） */
const firstPersonRig = (actSec: number): Cam => {
  const { eye, look: lookAt } = steveViewAt(secAt(actSec));
  const { tiltDeg, dirDeg: yawDeg } = hurtTilt(actSec);
  if (tiltDeg === 0) return { pos: eye, tgt: lookAt, lens: firstPersonLensMm };
  const forward = new THREE.Vector3(lookAt[0] - eye[0], lookAt[1] - eye[1], lookAt[2] - eye[2]);
  const vecLength = forward.length();
  forward.normalize();
  const right = forward.clone().cross(upAxis).normalize();
  // 视图空间（x 右、y 上、z 往后）→ 场景，再右乘 R⁻¹
  const m = new THREE.Matrix4().makeBasis(right, right.clone().cross(forward), forward.clone().negate()).multiply(new THREE.Matrix4().makeRotationAxis(hurtAxis(yawDeg), rad(-tiltDeg)));
  const newForward = new THREE.Vector3(0, 0, -1).applyMatrix4(m);
  const newUp = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
  const rightVec = newForward.clone().cross(upAxis).normalize();
  const roll = deg(Math.atan2(-newUp.dot(rightVec), newUp.dot(rightVec.clone().cross(newForward))));
  return { pos: eye, tgt: addVec(eye, [newForward.x, newForward.y, newForward.z], vecLength), lens: firstPersonLensMm, roll };
};
const sideWideStart = 7 / 60;

/** 镜头表（幕内秒） */
const shotTable: readonly Shot[] = [
  // 侧镜按首发斜距留出弹道，上缘避开血条。
  { name: '离杖', start: cameraStart.side, cameraRig: (_progress, sec) => releaseRig(sec) },
  makeShot('侧', sideWideStart, follow(sideWideStart, cameraStart.firstPerson, (s) => {
    const u = smoothstep01(s / cameraStart.firstPerson);
    const centerPos = mixVec(yaBoLunAt(s), S, lerp(0.5, 0.56, u));
    const right = dirBetween(yaBoLunAt(0), S);
    return [addVec(addVec(addVec(centerPos, perpendicular(right), Math.max(20, openingSpread * 1.18) + 2 * (1 - u)), right, lerp(-1, 1, u)), atHeight(lerp(-1.5, -0.8, u))), addVec(centerPos, atHeight(lerp(3.1, 2.7, u))), 20];
  }, 0.25)),
  { name: '第一人称', start: cameraStart.firstPerson, cameraRig: (_u, shotSec) => firstPersonRig(cameraStart.firstPerson + shotSec) },
];
export const volleyShots = shotTable;
/** 段内第 sec 秒（幕内秒）的镜头 */
export const volleyShotAt = (sec: number) => pickShot(shotTable, sec, seg.sec);
