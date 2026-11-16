// 第 5 幕击败的纯计算部分：幕内时刻、她怎么飞怎么落。段.ts 排声音也引，所以不引模型、贴图、React；她的姿势、盘在 编排-击败.ts。
// 用户 11-11 看完七版：5-01 东西撒一地那一镜单拍没意义，去掉；「死后亚伯伦 环绕的镜头 我觉得做得挺好 不改」，又更正「就在死亡界面撒一地」。
// 所以本幕只剩一镜：七版 5-03（她收盘、一下俯冲落地滑停、低头看），机位、她的走位和姿势一帧不改，照七版的钟取；
// 死亡界面盖在上面，他一死（第 4 幕最后一刻 = 本幕第 0 秒）东西照原版死亡掉落从他身上撒出去。
// 七版的钟：本幕第 s 秒 = 七版第 5 幕第 七版五三 + s 秒。她的位置、浮动、待机动画都照七版的钟走，第 2 幕改长改短这里也不变（第 4 幕末她停在 第五幕起位，下面核对）。
import { clamp01, lerp, lerpV, smoothstep01 } from '@engine/core/数学.ts';
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

/** 七版：第 5 幕开头在现身后 19.45 秒，5-03 从第 5 幕第 5.3 秒起、长 2.3 秒 */
const rev7ActStart = 19.45;
const v7OffsetSec = 5.3;
const fiveThreeDur = 2.3;
if (Math.abs(actDur - fiveThreeDur) > 1e-6) throw new Error(`击败的幕长 ${actDur} 秒要等于七版 5-03 的 ${fiveThreeDur} 秒（场/1-台地/时间线.ts 的 第五幕长）`);
/** 编排的钟 → 七版的编排钟 */
export const rev7Clock = (t: number) => t - actStart + rev7ActStart + v7OffsetSec;
/** 七版的编排钟 → 七版第 5 幕幕内秒 */
const v7ActElapsed = (τ: number) => τ - rev7ActStart;

/** 七版第 4 幕末她停的地方（起位关于史蒂夫对称的那一点）：七版第 5 幕的走位都从它量，写死，第 4 幕起点再改也不跟着动 */
const v7EndPos: V3 = [914.5, 287.5, 62];
/** 史蒂夫脚底 → 七版末位 的水平单位向量 */
export const towardYaBoLun: V3 = (() => {
  const [x, y] = [v7EndPos[0] - steveFoot[0], v7EndPos[1] - steveFoot[1]];
  const vecLength = Math.hypot(x, y);
  return [x / vecLength, y / vecLength, 0];
})();
/** 往她 往右转 90 度（从上往下看顺时针） */
export const rightDir: V3 = [towardYaBoLun[1], -towardYaBoLun[0], 0];
/** 从史蒂夫脚底往她那边 前 格、往右 右 格、比他脚底高 高 格的点 */
const airPoint = (forward: number, right: number, height: number): V3 => [steveFoot[0] + towardYaBoLun[0] * forward + rightDir[0] * right, steveFoot[1] + towardYaBoLun[1] * forward + rightDir[1] * right, steveFoot[2] + height];

/** 她的拍子（本幕幕内秒，七版的减 七版五三） */
export const yaBoLunBeats = {
  /** 开头 7 帧摆出收盘的姿势（杖竖到身前），姿势快到位时盘开始收 */
  retractPoseSec: 7 / 60,
  retractStart: 0.05,
  /** 盘收完（每圈 2.5 刻、相邻两圈隔 2.5 刻，三圈 7.5 刻 = 0.375 秒）就俯冲下去，0.25 秒落地 */
  descendStart: 0.45,
  descendSec: 0.25,
  /** 落地后带着劲往前滑到站住 */
  glideSec: 0.6,
} as const;
export const landSec = secAt(yaBoLunBeats.descendStart + yaBoLunBeats.descendSec);
export const standStillSec = landSec + yaBoLunBeats.glideSec;
/** 盘收的时刻（编排的钟） */
export const retractStart = secAt(yaBoLunBeats.retractStart);

// 七版的走位（七版第 5 幕幕内秒）：0.35 秒起冲到 冲到、0.8 秒起慢慢往下漂到 漂到、5.75 秒俯冲。本幕从 5.3 秒接上，只剩漂的尾巴、俯冲、滑停
const v7DashStopSec = 0.8;
const rev7DescendStart = v7OffsetSec + yaBoLunBeats.descendStart;
const dashTo: V3 = airPoint(5.5, 0, 5);
const driftFlat = airPoint(4.2, 3.6, 4.5);
/** 站脚：撒出来的东西之间的空当。俯冲的水平一段照 滑速 匀速走，落地接得上滑，滑 滑距 匀减到站住 */
const standFlat = airPoint(1.2, 3.4, 0);
const glideDist = 1.2;
const glideSpeed = (2 * glideDist) / yaBoLunBeats.glideSec;
const flatDir: V3 = (() => {
  const [x, y] = [standFlat[0] - driftFlat[0], standFlat[1] - driftFlat[1]];
  const vecLength = Math.hypot(x, y);
  return [x / vecLength, y / vecLength, 0];
})();
const groundPoint = (p: V3): V3 => terracePoint(p[0], -p[1]);
const standFoot: V3 = groundPoint(standFlat);
export const landFoot: V3 = groundPoint([standFlat[0] - flatDir[0] * glideDist, standFlat[1] - flatDir[1] * glideDist, 0]);
const driftTo: V3 = [landFoot[0] - flatDir[0] * glideSpeed * yaBoLunBeats.descendSec, landFoot[1] - flatDir[1] * glideSpeed * yaBoLunBeats.descendSec, driftFlat[2]];
const mixVec3 = (a: V3, b: V3, u: number) => lerpV(a, b, u) as V3;

/** 她的脚底（七版的编排钟） */
export const v7Pos = (τ: number): V3 => {
  const s = v7ActElapsed(τ);
  if (s < rev7DescendStart) return mixVec3(dashTo, driftTo, smoothstep01((s - v7DashStopSec) / (rev7DescendStart - v7DashStopSec)));
  const landTime = rev7DescendStart + yaBoLunBeats.descendSec;
  if (s < landTime) {
    const u = (s - rev7DescendStart) / yaBoLunBeats.descendSec;
    const blendPos = mixVec3(driftTo, landFoot, u);
    return [blendPos[0], blendPos[1], driftTo[2] + (landFoot[2] - driftTo[2]) * dashProgress(u, 0.1, 0.3)];
  }
  const slideProgress = Math.min(s - landTime, yaBoLunBeats.glideSec) / yaBoLunBeats.glideSec;
  return mixVec3(landFoot, standFoot, 1 - (1 - slideProgress) * (1 - slideProgress));
};
/** 她的脚底（编排的钟） */
export const yaBoLunPos = (t: number): V3 => v7Pos(rev7Clock(t));
if (Math.hypot(...yaBoLunPos(actStart).map((x, i) => x - act5StartPos[i]!)) > 1e-6) throw new Error('击败：本幕开头她不在第 4 幕末停的 第五幕起位（齐放拍.ts）');

/** 撒出来的东西（第 5 幕画面用同一份：角色/史蒂夫掉落轨迹.ts，种子 掉落种子，停下的地方同七版）。她落地后的脚底离每一件（停在地上的位置）都要有 离物 格以上 */
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

// ── 死亡界面的光标（GUI 像素，界面 640 × 360，幕内秒）：打开时原版把鼠标放在窗口正中；20 刻后按钮能按，移到「重生」上，幕末前点下去 ──
export const cursorMove = { start: [320, 180] as const, dest: [326, 170] as const, moveStart: 1.1, moveSec: 0.35, points: 1.9 };
export const cursorAt = (actSec: number): readonly [number, number] => {
  const u = smoothstep01(clamp01((actSec - cursorMove.moveStart) / cursorMove.moveSec));
  return [lerp(cursorMove.start[0], cursorMove.dest[0], u), lerp(cursorMove.start[1], cursorMove.dest[1], u)];
};
