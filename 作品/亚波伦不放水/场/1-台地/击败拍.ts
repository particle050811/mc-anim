import { clamp01, hermite, lerp, lerpV, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { steveDropCount, deathDropTrack } from '../../角色/史蒂夫掉落轨迹.ts';
import { terracePoint } from './布局.ts';
import { slowExtraSec } from './开盘拍.ts';
import timeline from './时间线.ts';
import { dashProgress, steveFoot, eyeHeight, act5StartPos } from './齐放拍.ts';

const events = timeline.events;
/** 本幕开头（编排的钟，现身后几秒的世界秒，比片上慢第 2 幕的 慢放多出）：他死的那一刻 */
export const actStart = events.volleyDone.sec - events.yaBoLunAppears.sec - slowExtraSec;
export const actDur = events.defeatDone.sec - events.volleyDone.sec;
export const secAt = (s: number) => actStart + s;

export const shotStart = { fall: 0, deathScreen: 1.8, landing: 5.3 } as const;
export const landingShotDur = 2.3;
if (Math.abs(actDur - shotStart.landing - landingShotDur) > 1e-6) throw new Error('击败幕长与三镜时长不符');

/** 754e4e4c：现身后 2.8 + 5.4 + 11.25 秒切到击败。姿势、浮动和头发仍采样这口钟，不受前幕重剪影响。 */
export const v6Start = 19.45;
export const performanceClock = (worldSec: number) => v6Start + (worldSec - actStart);

export const towardYaBoLun: V3 = (() => {
  const [x, y] = [act5StartPos[0] - steveFoot[0], act5StartPos[1] - steveFoot[1]];
  const vecLength = Math.hypot(x, y);
  return [x / vecLength, y / vecLength, 0];
})();
/** 往她 往右转 90 度（从上往下看顺时针） */
export const rightDir: V3 = [towardYaBoLun[1], -towardYaBoLun[0], 0];
/** 从史蒂夫脚底往她那边 前 格、往右 右 格、比他脚底高 高 格的点 */
const airPoint = (forward: number, right: number, height: number): V3 => [steveFoot[0] + towardYaBoLun[0] * forward + rightDir[0] * right, steveFoot[1] + towardYaBoLun[1] * forward + rightDir[1] * right, steveFoot[2] + height];

export const yaBoLunBeats = {
  dashStart: 0.35,
  dashDur: 0.45,
  retractPoseSec: 7 / 60,
  descendStart: shotStart.landing + 0.45,
  descendSec: 0.25,
  /** 落地后带着劲往前滑到站住 */
  glideSec: 0.6,
} as const;
export const landSec = secAt(yaBoLunBeats.descendStart + yaBoLunBeats.descendSec);
export const standStillSec = landSec + yaBoLunBeats.glideSec;
export const dashTo: V3 = airPoint(5.5, 0, 5);
const driftFlat = airPoint(4.2, 3.6, 4.5);
/** 站脚仍在 V6 掉落物之间；大半水平速度在脚落地前卸掉。 */
const standFlat = airPoint(1.2, 3.4, 0);
const glideDist = 0.48;
const glideSpeed = (2 * glideDist) / yaBoLunBeats.glideSec;
const flatDir: V3 = (() => {
  const [x, y] = [standFlat[0] - driftFlat[0], standFlat[1] - driftFlat[1]];
  const vecLength = Math.hypot(x, y);
  return [x / vecLength, y / vecLength, 0];
})();
const groundPoint = (p: V3): V3 => terracePoint(p[0], -p[1]);
const standFoot: V3 = groundPoint(standFlat);
export const landFoot: V3 = groundPoint([standFlat[0] - flatDir[0] * glideDist, standFlat[1] - flatDir[1] * glideDist, 0]);
const driftTo: V3 = [standFlat[0] - flatDir[0] * 2.2, standFlat[1] - flatDir[1] * 2.2, driftFlat[2]];
const mixVec3 = (a: V3, b: V3, u: number) => lerpV(a, b, u) as V3;
const driftStart = yaBoLunBeats.dashStart + yaBoLunBeats.dashDur;
const driftDur = yaBoLunBeats.descendStart - driftStart;
const driftAt = (sec: number) => mixVec3(dashTo, driftTo, smoothstep01((sec - driftStart) / driftDur));
const arcStart = driftAt(shotStart.landing);
const driftPhase = (shotStart.landing - driftStart) / driftDur;
const driftRate = 6 * driftPhase * (1 - driftPhase) / driftDur;

/** 她的脚底（七版的编排钟） */
export const positionAtElapsed = (s: number): V3 => {
  const { dashStart, dashDur, descendStart, descendSec } = yaBoLunBeats;
  const dashEnd = dashStart + dashDur;
  if (s < dashEnd) return mixVec3(act5StartPos, dashTo, dashProgress((s - dashStart) / dashDur, 0.1, 0.3));
  if (s < shotStart.landing) return driftAt(s);
  const landTime = descendStart + descendSec;
  if (s < landTime) {
    const arcDur = landTime - shotStart.landing;
    const progress = (s - shotStart.landing) / arcDur;
    const bank = 0.85 * Math.sin(Math.PI * progress) ** 2;
    const horizontal = (axis: 0 | 1) => hermite(arcStart[axis], (driftTo[axis] - dashTo[axis]) * driftRate * arcDur, landFoot[axis], flatDir[axis] * glideSpeed * arcDur, progress) + rightDir[axis] * bank;
    const height = s < descendStart ? driftAt(s)[2] : lerp(driftTo[2], landFoot[2], dashProgress((s - descendStart) / descendSec, 0.10, 0.52));
    return [horizontal(0), horizontal(1), height];
  }
  const slideProgress = Math.min(s - landTime, yaBoLunBeats.glideSec) / yaBoLunBeats.glideSec;
  return mixVec3(landFoot, standFoot, 1 - (1 - slideProgress) * (1 - slideProgress));
};
/** 她的脚底（编排的钟） */
export const yaBoLunPos = (t: number): V3 => positionAtElapsed(t - actStart);
if (Math.hypot(...yaBoLunPos(actStart).map((x, i) => x - act5StartPos[i]!)) > 1e-6) throw new Error('击败：本幕开头她不在第 4 幕末停的 第五幕起位（齐放拍.ts）');

/** 撒出来的东西（第 5 幕画面用同一份：角色/史蒂夫掉落轨迹.ts，种子 掉落种子，停下的地方同第六版）。她落地后的脚底离每一件（停在地上的位置）都要有 离物 格以上 */
export const dropSeed = 3;
const itemClear = 1.2;
{
  const drops = deathDropTrack(steveFoot, steveDropCount, dropSeed, { 眼高: eyeHeight }).map((x) => x.lane[x.lane.length - 1]!);
  for (let k = 0; k <= 10; k++) {
    const p = yaBoLunPos(landSec + (yaBoLunBeats.glideSec * k) / 10);
    const nearDist = Math.min(...drops.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
    if (nearDist < itemClear) throw new Error(`击败：她落地滑停时离地上的东西只有 ${nearDist.toFixed(2)} 格（击败拍.ts 的 站平）`);
  }
}

// ── 死亡界面的光标（GUI 像素，界面 480 × 270 = 战斗界面.tsx 的 guiScale，5-02 镜内秒）：打开时原版把鼠标放在窗口正中；20 刻后按钮能按，移到「重生」上，幕末前点下去 ──
// 「重生」在 (140～340, 139～159)：正中 (240, 135) 在它上沿外面一点，往下挪进去（界面 640 × 360 时正中本来就在按钮里，是往上挪 10）
export const cursorMove = { start: [240, 135] as const, dest: [246, 148] as const, moveStart: 1.35, moveSec: 0.45, points: 2.6 };
export const cursorAt = (shotSec: number): readonly [number, number] => {
  const u = smoothstep01(clamp01((shotSec - cursorMove.moveStart) / cursorMove.moveSec));
  return [lerp(cursorMove.start[0], cursorMove.dest[0], u), lerp(cursorMove.start[1], cursorMove.dest[1], u)];
};
