// 北城墙东段的 9 个卫兵：瞭望 → 听见回头 → 看见金光举镜（6-3-4），以及望远镜视野用的右眼位置。
import type { V3 } from '@engine/model/parts.tsx';
import { BORDER_TOWN } from '../../../边城轮廓.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import { 城防, 物理时间 } from '../时间线.ts';
import { ss, lerp, lerp3, add, sub, D2R } from './工具.ts';
import { liYing, maceHeadPos } from './李樱.ts';

// ---------- 卫兵：北城墙东段一排 9 个，站在城垛的缺口里值守，望远镜收着 ----------
// 原文第 6 章：城墙上的卫兵配了望远镜。用户 10-02 要求卫兵用望远镜看他砸下来；10-13 嫌他们一出场就举镜对天，改成按因果分三步（按物理时间走，慢放只缩时钟）：
// 1. 瞭望（`察觉` 以前）：站在缺口里面朝城外，头慢慢左右扫，各人相位错开；5 号沿走道往西巡逻。望远镜收着（卫兵.tsx 举镜 < 0.85 时不画）；手臂轻晃是原版待机摆动（`giantPose`）。
// 2. 听见回头（`察觉` 起）：呼啸从身后高空传来，4 号先听见：0.1 秒后头先扭、身子跟着转（略冲过再回稳），头往上找金光。其余人离 4 号越远越晚（0.22～0.4 秒），5 号先收住脚步再回头。
// 3. 看见金光、举镜：4 号 `察觉` 后约 0.85 秒找到金光、1.0 秒开始举镜，其余人紧跟着在 0.05～0.17 秒里先后举起，0.15 秒举好（用户 10-20 嫌举镜反应太慢），放 item.spyglass.use（声音.tsx）。
// 城墙顶走道 z = 28.5（城局部坐标），北墙中线 y = 200、墙厚 6（走道 y 197～202，里侧无女墙），墙垛在 y 202～203、每 4 格两格垛两格缺口（垛 x 21～23、25～27…），
// 缺口中心 x 24、28…56；城门在 x ±12、门楼到 ±20，往东第一座塔楼在 x 73～87。
export const guardPositions: V3[] = Array.from({ length: 9 }, (_, i) => [24 + i * 4, BORDER_TOWN.d / 2 + 2.2, BORDER_TOWN.h + 0.5]);
export const guardHeadDown = 45; // 边城/预览.tsx 用（举着望远镜低头看城墙底下的旧站姿），6-3-4 现在不用
export const GUARD_I = 4; // 第一个听见、镜头切进他望远镜的卫兵（x = 40，城垛缺口正中）
const GUARD_NECK = 1.406; // 头的转轴（脖子）离脚底：24 像素 × 卫兵缩放 0.9375 / 16
const GUARD_PX = 0.9375 / 16; // 卫兵模型一像素多少格
// 每个人站得略有不同（扫视的周期、相位、站的朝向），免得一排人像复制出来的
const jitter = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};
// 望远镜对准的点：李樱的髋往锤头那边挪一点（脚到锤头这一整条的中间，望远镜里他在正中）
export const aimPoint = (physSec: number): V3 => {
  const ly = liYing(physSec);
  return lerp3(ly.hip, maceHeadPos(ly), 0.2);
};
// 从 from 看向 p 要转身多少度（0 = 朝北，正 = 往左转，同 画面.tsx 的 转身）、抬头多少度（正 = 往上）
const facingAngles = (from: V3, target: V3) => {
  const delta = sub(target, from);
  return { 转: Math.atan2(-delta[0], delta[1]) / D2R, 仰: Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) / D2R };
};
// 稍微冲过头再回稳（转身带着惯性）：x 0～1，过冲约 s × 4%
const overshoot = (x: number, amount = 0.6) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const y = x - 1;
  return 1 + (amount + 1) * y * y * y + amount * y * y;
};
// 听见到举镜这一串反应的快慢：下面各时刻都乘它（用户 10-20 嫌反应慢，回头、找金光、举镜一起快一倍；时间线.ts 的回头、见光两拍跟着缩）
const REACT = 0.5;
// 听见的时刻（相对 察觉 的物理秒）：4 号最先，其余的人离他越远越晚
const hearDelay = (i: number) => REACT * (i === GUARD_I ? 0.1 : 0.18 + 0.04 * Math.abs(i - GUARD_I) + 0.06 * (jitter(i, 3) + 0.5));
// 开始举镜（相对 察觉 的物理秒）：4 号头对准金光就举（6-3-4 切到举镜那一拍的那一刻）；其余的人看他举了跟着举，离他越远晚一点，各自也刚好对准金光
const raiseStart = (i: number) => REACT * (i === GUARD_I ? 1.0 : 1.03 + 0.025 * Math.abs(i - GUARD_I) + 0.04 * (jitter(i, 6) + 0.5));
export const raiseDuration = 0.15;
// 第 i 个卫兵开始举镜的物理时刻
export const guardRaiseSec = (i: number) => 物理时间(城防.察觉) + raiseStart(i);
// 巡逻：5 号沿走道（y 199.5，缺口那排人身后 2.7 米）往西走，1.3 米/秒（原版走路 4.3 米/秒），听见后 0.12 秒内收住脚步，停在 x 42.4（4 号右后方 3.6 米）。
// 步、步幅照原版 limbSwing：每刻 步幅 = min(1, 每刻位移 × 4)、步 += 步幅，即 步 = 4 × 走过的米数
const patrol = { i: 5, stop: [42.4, 199.5] as [number, number], speed: 1.3, decelTime: 0.25 * REACT };
const patrolState = (physSec: number) => {
  const stopSec = 物理时间(城防.察觉) + hearDelay(patrol.i) + 0.12 * REACT;
  const decelStart = stopSec - patrol.decelTime;
  // 离停下的地方还差几米（减速段 1 − smoothstep 的积分）
  let remaining: number;
  if (physSec <= decelStart) remaining = patrol.speed * (decelStart - physSec) + patrol.speed * patrol.decelTime * 0.5;
  else if (physSec >= stopSec) remaining = 0;
  else {
    const decelFrac = (physSec - decelStart) / patrol.decelTime;
    remaining = patrol.speed * patrol.decelTime * (0.5 - decelFrac + decelFrac * decelFrac * decelFrac - (decelFrac * decelFrac * decelFrac * decelFrac) / 2);
  }
  const speed = physSec <= decelStart ? patrol.speed : physSec >= stopSec ? 0 : patrol.speed * (1 - ss((physSec - decelStart) / patrol.decelTime));
  return { remaining: remaining, stride: Math.min(1, (speed / 20) * 4), 步: -4 * remaining };
};
// 第 i 个卫兵脚底相对 卫兵位置 的偏移（城的局部坐标）：只有巡逻的 5 号在动
const guardOffset = (i: number, physSec: number): V3 => {
  if (i !== patrol.i) return [0, 0, 0];
  const basePos = guardPositions[i];
  return [patrol.stop[0] + patrolState(physSec).remaining - basePos[0], patrol.stop[1] - basePos[1], 0]; // 从东边往西走过来
};
export const guardFeet = (i: number, w = 0): V3 => add(add(borderTownPos, guardPositions[i]), guardOffset(i, w));
export const guardNeck = (i: number, w = 0): V3 => add(guardFeet(i, w), [0, 0, GUARD_NECK]);
// headPitch 是视线（望远镜视野、声音位置、6-3-5 起飞都按它）；画头仰 是画出来的头（举镜时比视线低 `SCOPE_SHOWN_LOWER`）
export type GuardPose = { 举镜: number; headPitch: number; 画头仰: number; 头偏: number; 转身: number; 偏移: V3; 步: number; stride: number };
// 举好望远镜时画出来的头和镜筒比视线低几度（用户 10-18 定：放低，构图更和谐，不必对准李樱）。随举镜从 0 加到这么多，切进镜中以后镜头在他眼里、看不见他
export const SCOPE_SHOWN_LOWER = 20;
// 瞭望时的站姿（物理时间 w 的函数，一直在动）：身子朝向、头相对身子的左右、低头多少度（正 = 低头，同 卫兵.tsx）。
// 人看远处不是匀速扫：头停一个方向看一会儿，再用 0.45 秒转到另一处（左右 ±32°、上下几度），每人隔 1.2～2.2 秒换一次、起点错开；身子跟着头有 ±3° 的慢摆
const glanceShift = (i: number, physSec: number, amplitude: number, k0: number) => {
  const period = 1.2 + (jitter(i, 5) + 0.5); // 隔多久换一处看
  const phase = period * (jitter(i, 7) + 0.5);
  const glanceIdx = Math.floor((physSec + phase) / period);
  const turnFrac = ss(((physSec + phase) - glanceIdx * period) / 0.45);
  return lerp(amplitude * 2 * jitter(i, k0 + glanceIdx - 1), amplitude * 2 * jitter(i, k0 + glanceIdx), turnFrac);
};
const lookoutPose = (i: number, physSec: number) => {
  // 两头的人朝墙的走向多转一点（看墙外两侧），中间的人朝正北
  const bodyYaw = (i === 0 ? 22 : i === 8 ? -18 : 16 * jitter(i, 4)) + 3 * Math.sin((6.283 * physSec) / 6.5 + 6.283 * jitter(i, 8));
  if (i === patrol.i) return { 身: 90, 头: -40 + 0.4 * glanceShift(i, physSec, 32, 20), 仰: 6 }; // 面朝西走，头扭向右边看城外
  const headYaw = Math.max(-60, Math.min(60, 10 * jitter(i, 2) + glanceShift(i, physSec, 32, 20)));
  const lookPitch = 5 + 6 * jitter(i, 1) + glanceShift(i, physSec, 4, 60); // 看远处：略低头几度
  return { 身: bodyYaw, 头: headYaw, 仰: lookPitch };
};
// 第 i 个卫兵在全局帧 G 的姿势
export const guardPoseAt = (globalFrame: number, i: number): GuardPose => {
  const physSec = 物理时间(globalFrame);
  const offset = guardOffset(i, physSec);
  const walk = i === patrol.i ? patrolState(physSec) : { 步: 0, stride: 0 };
  const lookout = lookoutPose(i, physSec);
  const tt = physSec - 物理时间(城防.察觉) - hearDelay(i);
  if (tt <= 0) return { 举镜: 0, headPitch: lookout.仰, 画头仰: lookout.仰, 头偏: lookout.头, 转身: lookout.身, 偏移: offset, 步: walk.步, stride: walk.stride };
  const aim = facingAngles(guardNeck(i, physSec), aimPoint(physSec));
  // 头先扭过去，身子稍晚起转（略冲过再回稳），头相对身子的角度不超过原版的 75°；时长都乘 `REACT`
  const headTotalYaw = lerp(lookout.身 + lookout.头, aim.转, ss(tt / (0.42 * REACT)));
  const bodyYaw = lerp(lookout.身, aim.转, overshoot((tt - 0.12 * REACT) / (0.5 * REACT)));
  const headYaw = Math.max(-75, Math.min(75, headTotalYaw - bodyYaw));
  // 先抬头往身后的天上看（抬到 20°），再找到金光、对准
  const headPitch = lerp(lerp(lookout.仰, -20, ss(tt / (0.35 * REACT))), -aim.仰, ss((tt - 0.3 * REACT) / (0.45 * REACT)));
  const scopeRaise = ss((physSec - guardRaiseSec(i)) / raiseDuration);
  return { 举镜: scopeRaise, headPitch, 画头仰: headPitch + SCOPE_SHOWN_LOWER * scopeRaise, 头偏: headYaw, 转身: bodyYaw, 偏移: offset, 步: walk.步, stride: walk.stride };
};
// 第 i 个卫兵的右眼（场景坐标）和视线方向（望远镜视野用）：头绕脖子转，右眼在头的转轴上方 3.375 像素、往前 4.5 像素、往右 1.5625 像素（同 卫兵.tsx 望远镜目镜端面的中心）
export const guardEye = (i: number, globalFrame: number) => {
  const pose = guardPoseAt(globalFrame, i);
  const yaw = (pose.转身 + pose.头偏) * D2R;
  const pitchRad = -pose.headPitch * D2R;
  const fh: V3 = [-Math.sin(yaw), Math.cos(yaw), 0];
  const right: V3 = [Math.cos(yaw), Math.sin(yaw), 0];
  const dir: V3 = [fh[0] * Math.cos(pitchRad), fh[1] * Math.cos(pitchRad), Math.sin(pitchRad)];
  const up: V3 = [-fh[0] * Math.sin(pitchRad), -fh[1] * Math.sin(pitchRad), Math.cos(pitchRad)];
  const neck = guardNeck(i, 物理时间(globalFrame));
  const pos: V3 = [0, 1, 2].map((k) => neck[k] + (up[k] * 3.375 + dir[k] * 4.5 + right[k] * 1.5625) * GUARD_PX) as V3;
  return { pos, dir, fh, right };
};
