// 古城4x 的强者参数（跳、跑；用户「为适应这个放大化的世界 你各个参数」）、原版参数，强者跳的弹道函数。
// 李樱、黄叛、刘心忠是强者（用户 10-13 要按放大世界重定参数），地面不用原版玩家疾跑 5.6 米/秒、跳 1.25 格。弹道按原版重力 0.08 格/刻²（32 米/秒²），只放大起跳速度：
// 基准速度（用户 10-18 定，全古城）：人 30、马 50、监守者 60 米/秒——人骑着马也没有监守者快，靠拉扯让它走远路。
// 一跳离地 7 米（竖直初速 21.2 米/秒，滞空 1.32 秒），跳远 40 米（水平 30 米/秒），疾跑 30 米/秒；跳和跑同速，跳着走不掉速（6-4-6 追兵就这么跳着走）。
// 李樱比追兵强：跳远上限 44、疾跑上限 33，迅冲斩 40 米/秒照 6-1-2。
// 第 7 章闪避用「闪避跳」：离地 2.5 米、横 10 米、0.79 秒，躲一拍 / 音爆。
// 下面 vanilla 是原版数值，只给机制核对用；动画里的跑速用 `baseSpeed`。音爆照原版第 34 刻放出，但能边走边放、不限 15 格（用户 10-18）。
// 原版：监守者追击 5.7 米/秒、攻击冷却 18 刻、音爆蓄力 34 刻（够不着又在 15 格内才放）；恼鬼冲锋照 VexMoveControl（javap 核过，每刻加 0.05 格/刻，阻力 ×0.91，极速约 10.1 米/秒）；幽灵马 10.9 米/秒。
import type { V3 } from '@engine/model/parts.tsx';
import { RAMP_SEC } from '@库/角色/跑步.ts';

export const baseSpeed = { 人: 30, 马: 50, 监守者: 60 }; // 米/秒，用户 10-18 定
// 边城快追（6-3-8 上岸以后、6-3-10 坑口）：刘心忠、黄叛两个精英和古城里的人一样 30、卫兵 20 米/秒（用户 10-20：「古城里 30 嘛 那就改成 30」），跑的样子见 模型/角色/跑步.ts
export const chaseSpeed = { 精英: baseSpeed.人, 卫兵: 20 };
export const gravity = 32; // 米/秒²：原版 0.08 格/刻²（实体下落），弹道都按它
export const elite = {
  离地: 7, // 一跳最高点比起跳点（两头较高的那头）高多少，米；受洞顶限制时往下降，最低 4
  apexHeightRange: [4, 8] as [number, number],
  maxRise: 8.5, // 最高点比起跳点最多高多少：往高处跳时（落点比起跳点高 Δ）离地自动降到 8.5 − Δ（最低 1.5），竖直初速不超过 23.3 米/秒
  跳远: 40, // 米：平地一跳（= 疾跑 × 滞空）
  jumpDistRange: [36, 44] as [number, number], // 44 是李樱的上限；追兵 36～40
  滞空: 2 * Math.sqrt((2 * 7) / 32), // 1.32 秒：平地、离地 7 米
  疾跑: baseSpeed.人, // 米/秒：地面上跑（= 跳远 / 滞空，跳着走不掉速）
  sprintRange: [28, 33] as [number, number], // 追兵 28～30，李樱到 33
  takeoffCrouchSec: 0.2, // 蹲下蓄力（古城戏.ts 的 CROUCH 5 帧）
  landingSquatSec: 0.25, // 落地深蹲 6 帧，连跳时就是下一跳的蓄力（6-4-1、6-4-2 李樱的连跳另按 ../6-4-1/跳搭.ts 的 `jumpStyle`）
  brakeSec: RAMP_SEC, // 疾跑或落地后刹住（默认的起停时间，用户 10-21「按照规矩来」）
  闪避跳: { 离地: 2.5, 跳远: 10, 滞空: 2 * Math.sqrt((2 * 2.5) / 32) }, // 0.79 秒，第 7 章躲拍、躲音爆
  liYingDashSpeed: 40, // 米/秒，6-1-2 迅冲斩，不变
};
export const vanilla = {
  监守者: { chaseSpeed: 5.7, attackCooldownTicks: 18, sonicBoomChargeTicks: 34, sonicBoomRange: 15, summonRange: 5 /* 尖啸体周围水平 ±5 */, wardenSilenceRange: 24 /* 尖啸体 ±24 格盒子里有监守者就不叫 */ },
  恼鬼: { chargeAccel: 0.05 /* 格/刻² */, drag: 0.91, chargeMaxSpeed: (0.05 * 0.91) / 0.09 * 20 /* ≈ 10.1 米/秒 */ },
  幽灵马: 10.9,
  shriekResponseTicks: 90,
  warningCooldownSec: 10,
  vibrationRange: 8,
};

// 强者跳：脚底 p0 → p1（场景坐标，Z 朝上），最高点比两头较高的那头高 离地 米，第 f0 帧离地。水平匀速、竖直按 重力 的抛物线。
// 字段和 ../镜头/6-4-1/古城戏.ts 的 Leap 一样（p0、p1、top、f0、T、tUp、f1、yaw），可以直接喂 leapAt / airPose / placeFrame。
// hang：顶点前后慢多少（见 `flightWarp`），没有就照重力匀着走（6-4-1、6-4-2 李樱的连跳自己在 ../6-4-1/跳搭.ts 里变形，不填）
export type 跳 = { p0: V3; p1: V3; top: number; f0: number; T: number; tUp: number; f1: number; yaw: number; 水平: number; horizSpeed: number; launchVz: number; hang?: number };
export const eliteLeap = (p0: V3, p1: V3, apexHeight = elite.离地, f0 = 0, fps = 24): 跳 => {
  const rise = Math.max(0, p1[2] - p0[2]);
  const top = Math.max(p0[2], p1[2]) + Math.max(1.5, Math.min(apexHeight, elite.maxRise - rise));
  const tUp = Math.sqrt((2 * (top - p0[2])) / gravity);
  const flightSec = tUp + Math.sqrt((2 * (top - p1[2])) / gravity);
  const horizDist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return {
    p0, p1, top, f0, T: flightSec, tUp, f1: f0 + flightSec * fps,
    yaw: (Math.atan2(-(p1[0] - p0[0]), p1[1] - p0[1]) * 180) / Math.PI,
    水平: horizDist, horizSpeed: horizDist / flightSec, launchVz: gravity * tUp,
  };
};
// 给定水平速度（米/秒）反求离地：一跳正好用 水平 / 速 秒（二分；速太慢、要的离地超过 离地范围 上限时夹到上限）
export const eliteLeapAtSpeed = (p0: V3, p1: V3, speed = elite.疾跑, f0 = 0, fps = 24): 跳 => {
  const horizDist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const targetSec = horizDist / speed;
  let lo = 0.05;
  let hi = elite.apexHeightRange[1];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (eliteLeap(p0, p1, mid).T < targetSec) lo = mid;
    else hi = mid;
  }
  return eliteLeap(p0, p1, (lo + hi) / 2, f0, fps);
};
// 跳的走法（用户 10-18 定：跳跃优先观感、不必严格重力）：空中的画面进度 u（0 离地、1 落地）→ 弧上的进度。顶点（ua）两边各一段，
// 蹬地后快、到顶点只剩 1 − hang 倍速、落地前又快到 1 + hang 倍；弧的形状、总时长、顶点时刻都不变，落点照旧准。同 ../6-4-1/跳搭.ts 的 warp
export const flightWarp = (u: number, ua: number, hang: number) => {
  if (u < ua) {
    const s = u / ua;
    return ua * (s + hang * s * (1 - s));
  }
  const s = (u - ua) / (1 - ua);
  return ua + (1 - ua) * (s - hang * s * (1 - s));
};
// 每跳顶点停多久不一样（同 跳搭.ts 的 HANG）：第 i 跳轮着取；滞空不到 1.2 秒的按比例少停（0.8 秒的闪避跳不能飘）
const HANGS = [0.32, 0.42, 0.26, 0.38, 0.46, 0.3, 0.36];
export const withHang = <L extends { T: number }>(leap: L, i: number): L & { hang: number } => ({ ...leap, hang: HANGS[((i % HANGS.length) + HANGS.length) % HANGS.length] * Math.min(1, leap.T / 1.2) });
// 第 f 帧的脚底（f 在 f0～f1 之外夹到两端）；有 hang 就按 `flightWarp` 走
export const leapFeetAt = (leap: 跳, frame: number, fps = 24): V3 => {
  const t0 = Math.min(leap.T, Math.max(0, (frame - leap.f0) / fps));
  const t = leap.hang ? flightWarp(t0 / leap.T, leap.tUp / leap.T, leap.hang) * leap.T : t0;
  const k = t / leap.T;
  return [leap.p0[0] + (leap.p1[0] - leap.p0[0]) * k, leap.p0[1] + (leap.p1[1] - leap.p0[1]) * k, leap.p0[2] + gravity * leap.tUp * t - 0.5 * gravity * t * t];
};
