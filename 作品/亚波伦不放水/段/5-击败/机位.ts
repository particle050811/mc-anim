// 第 5 幕 击败的镜头表（纯模块）：画面.tsx 照它摆镜头，地形视图.ts 拿它给加载计划，两边同一份。
import { rigSpline, type Cam, type SplineKey } from '@engine/core/机位.ts';
import { lerp, lerpV } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { pickShot, type Shot } from '../../场/1-台地/台地机位.ts';
import { steveEye, steveFoot } from '../../场/1-台地/编排-击败.ts';
import { yaBoLunPos, towardYaBoLun, dashTo, actStart, shotStart, landSec } from '../../场/1-台地/击败拍.ts';
import seg from './段.ts';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const atHeight = (z: number): V3 => [0, 0, z];
const S = steveFoot;
/** 水平单位向量 a → b */
const dirBetween = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const vecLength = Math.hypot(x, y) || 1;
  return [x / vecLength, y / vecLength, 0];
};

const sideKey = (sec: number, degrees: number, radius: number, height: number, aim: number): SplineKey => {
  const angle = degrees * Math.PI / 180;
  const [east, north] = towardYaBoLun;
  const side: V3 = [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), 0];
  return [sec, {
    pos: addVec(addVec(S, side, radius), atHeight(height)),
    tgt: lerpV(addVec(S, atHeight(0.8)), addVec(dashTo, atHeight(1)), aim),
    lens: 18,
  }];
};
const sideKeys = [sideKey(0, 80, 8.6, 1.6, 0.55), sideKey(1, 84, 9.4, 2.2, 0.6), sideKey(shotStart.deathScreen, 88, 10.2, 2.8, 0.62)];
const deathCamera: Cam = {
  pos: steveEye,
  tgt: addVec(yaBoLunPos(actStart + (shotStart.deathScreen + shotStart.landing) / 2), atHeight(-0.6)),
  lens: 14.46,
  roll: -(40 - 8000 / 220),
};
const shotTable: Shot[] = [
  { name: '5-01', start: shotStart.fall, cameraRig: (_progress, shotSec) => rigSpline(sideKeys, shotSec) },
  { name: '5-02', start: shotStart.deathScreen, cameraRig: () => deathCamera },
  {
    name: '5-03',
    start: shotStart.landing,
    cameraRig: (k, s) => {
      const t = actStart + shotStart.landing + s;
      const yaBoLun = yaBoLunPos(t);
      const forward = dirBetween(yaBoLun, S);
      const leftDir: V3 = [-forward[1], forward[0], 0];
      const landTime = landSec - (actStart + shotStart.landing);
      const nearProgress = Math.min(1, s / landTime);
      const mixT = Math.max(0, Math.min(1, (s - landTime) / 0.8));
      const eyeHeight = lerp(lerp(0.3, 0.9, nearProgress), 1.6, mixT);
      return {
        pos: addVec(addVec(addVec(yaBoLun, forward, lerp(lerp(2.5, 1.9, nearProgress), 2.2, mixT)), leftDir, lerp(lerp(-4.6, -3.6, nearProgress), -4.2, mixT)), atHeight(eyeHeight)),
        tgt: addVec(addVec(yaBoLun, forward, lerp(0, 0.4, mixT)), atHeight(lerp(1.7, 1.25, mixT))),
        lens: lerp(20, 22, k),
      };
    },
  },
];
export const actFiveShotTable = shotTable;
/** 段内第 sec 秒（幕内秒）的镜头 */
export const actFiveShotAt = (sec: number) => pickShot(shotTable, sec, seg.sec);
