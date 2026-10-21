// 6-4-6、6-4-7 两个追兵的走位：强者跳着走。用户 10-13 嫌原版玩家疾跑跳（一跳 0.65 秒、离地 1.25 格）太短，
// 现照 ../古城4x布局.ts 的 `elite` 参数：重力照原版 32 米/秒²；用户 10-18 定人跑跳 30 米/秒，一跳 32～40 米、滞空 1.1～1.5 秒、水平 26～30 米/秒（跳着走不掉速）。
// 一路的落点、每一跳的离地是布局文件定的（`pursuerPath` / `liuXinzhongPursuitPath`、`pursuerApexHeights` / `liuXinzhongApexHeights`，核对.py 核过碰撞箱沿弹道不撞），这里只排时间、摆姿势：
// - 时钟：`追兵钟` = 秒，从 6-4-5 第 0 帧起（6-4-5 → 6-4-6 → 6-4-7 全局帧连着，各段换算见各段 编排.ts）。
// - 第一跳在 `startSec` 离地（`handoffs.pursuerStart`，刘心忠再晚 `liuXinzhongStartDelaySec`），之前 `elite`.起跳蓄力秒 蹲下蓄力。
// - 落地深蹲 `elite`.落地卸力秒（0.25 秒），这一蹲就是下一跳的蓄力；最后一跳落地后几步刹住（`elite`.刹停秒），滑到 `standPos` 那格。
// 姿势要像强者大跳（用户 10-18 定：优先观感、不必严格重力）：动作是 ../6-4-1/古城戏.ts 共用的那一套（蓄力两帧蹬直、空中收腿 → 顶点舒展 → 伸腿、落地压到最深前栽），
// 每跳顶点停多久不一样（`withHang`，黄叛、刘心忠错开）；起落时刻、弧不变（振动链、尖啸时刻靠落地时刻）。
// 刘心忠右手拿杖：`LiuXinzhong` 每帧先过 `liuHoldStaff`（追兵.tsx），这里只别让右臂甩太狠（摆幅压到一半）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { walkPose } from '../../../../world/角色/追兵.tsx';
import { flightPose, groundPose, landPose, mixPose, nearYaw, takeoffPose, yawTo } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { elite, eliteLeap, footOf, withHang, type BlockPos, type 跳 } from '../../../../world/地点/古城4x/布局.ts';

export const FPS = 24;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 强者在空中的姿势：古城戏.ts 的 `flightPose`，不垫羊毛；rightArmScale 右臂摆幅
export const eliteAirPose = (leap: 跳, frame: number, rightArmScale = 1): FigurePose => flightPose(leap, frame, { place: false, armRScale: rightArmScale });

export type EliteRoute = {
  跳们: 跳[]; // f0、f1 是追兵钟的帧（秒 × FPS）
  startSec: number;
  landSec: number; // 最后一跳落地
  standPos: V3;
  standYaw: number;
  // 追兵钟 t 秒的姿势（站着的那几段由 站姿 给：开头起跳前、刹住以后）
  pose: (t: number, standPose?: (loc: V3, yaw: number) => FigurePose) => FigurePose;
  // 落地（hit_ground）、刹步（step）发振动的时刻和位置（场景），给 振动链.ts
  振动: { 名: string; t: number; p: V3 }[];
};

// 点们：脚底格（第 0 个是起跳处）；离地们：每一跳；起秒：第一跳离地；站定：最后落地后刹住的格（不给 = 落在哪站在哪）
export const buildEliteRoute = (cells: BlockPos[], jumpHeights: number[], startSec: number, standCell?: BlockPos, label = ''): EliteRoute => {
  const jumps: 跳[] = [];
  let t = startSec;
  for (let i = 1; i < cells.length; i++) {
    const leap = withHang(eliteLeap(footOf(cells[i - 1]), footOf(cells[i]), jumpHeights[i - 1], t * FPS, FPS), i - 1 + (label === '刘' ? 3 : 0));
    jumps.push(leap);
    t = leap.f1 / FPS + elite.landingSquatSec;
  }
  const lastLeap = jumps[jumps.length - 1];
  const landSec = lastLeap.f1 / FPS;
  const landPos = lastLeap.p1;
  const standPos = standCell ? footOf(standCell) : landPos;
  const brakeSec = elite.brakeSec;
  const standYaw = lastLeap.yaw;
  // 朝向：每一跳的方向；落地蹲着的时候转到下一跳的方向（走近的那一边）
  const yaws: number[] = [];
  jumps.forEach((L, i) => yaws.push(i === 0 ? L.yaw : nearYaw(yaws[i - 1], L.yaw)));
  const brakePosAt = (sinceLand: number): V3 => {
    // 落地后匀减速滑到站定：位移 = d × (1 − (1 − k)²)
    const k = Math.min(1, Math.max(0, sinceLand / brakeSec));
    const eased = 1 - (1 - k) * (1 - k);
    return [lerp(landPos[0], standPos[0], eased), lerp(landPos[1], standPos[1], eased), lerp(landPos[2], standPos[2], eased)];
  };
  const vibrations = [
    ...jumps.map((L, i) => ({ 名: `${label}落地${i + 1}`, t: L.f1 / FPS, p: L.p1 })),
    // 刹住那一两步：滑出去超过半格才算迈了一步（step 事件，同 Entity.moveDist 每 1/0.6 格一步；刹步就算一步）
    ...(Math.hypot(standPos[0] - landPos[0], standPos[1] - landPos[1]) > 0.5 ? [{ 名: `${label}刹步`, t: landSec + brakeSec * 0.6, p: brakePosAt(brakeSec * 0.6) }] : []),
  ];
  const stand = (loc: V3, yaw: number) => walkPose(loc, yaw, 0, 0, 0);
  const pose = (tt: number, standPose = stand): FigurePose => {
    const frame = tt * FPS;
    const firstLeap = jumps[0];
    if (frame < firstLeap.f0) {
      const crouchProgress = (tt - (startSec - elite.takeoffCrouchSec)) / elite.takeoffCrouchSec;
      if (crouchProgress <= 0) return standPose(firstLeap.p0, yaws[0]);
      return takeoffPose(firstLeap.p0, yaws[0], crouchProgress);
    }
    for (let i = 0; i < jumps.length; i++) {
      const leap = jumps[i];
      if (frame < leap.f1) return { ...eliteAirPose(leap, frame, label === '刘' ? 0.5 : 1), yaw: yaws[i] };
      const nextLeap = jumps[i + 1];
      // 落地卸力 → 蓄力 → 蹬起，身子同时转向下一跳
      if (nextLeap && frame < nextLeap.f0) return groundPose(leap.p1, yaws[i], yaws[i + 1], frame - leap.f1, nextLeap.f0 - leap.f1);
    }
    // 最后一跳落地：一蹲到底卸力，同时往前滑着刹住，0.6 秒站直
    const sinceLand = tt - landSec;
    const loc = brakePosAt(sinceLand);
    if (sinceLand < 0.6) return mixPose(landPose(loc, standYaw, sinceLand * FPS, 0.6 * FPS), standPose(loc, standYaw), ss((sinceLand / 0.6 - 0.6) / 0.4));
    return standPose(loc, standYaw);
  };
  return { 跳们: jumps, startSec, landSec, standPos, standYaw, pose, 振动: vibrations };
};

// 看：世界坐标里看着哪一点，身子转一部分（身随），其余靠头；w 0～1 是看过去的程度（同老 6-4-6/编排.ts）
const eyeHeight = 1.62;
export const lookToward = (pose: FigurePose, point: V3, weight: number, bodyFollow = 0.35): FigurePose => {
  if (weight <= 0) return pose;
  const delta = [point[0] - pose.loc[0], point[1] - pose.loc[1], point[2] - pose.loc[2] - eyeHeight];
  const y0 = pose.yaw ?? 0;
  const to = y0 + ((((yawTo(delta[0], delta[1]) - y0 + 540) % 360) + 360) % 360) - 180;
  const pitchDeg = (Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) * 180) / Math.PI;
  const yaw = y0 + (to - y0) * bodyFollow * weight;
  return { ...pose, yaw, headYaw: pose.headYaw * (1 - weight) + (to - yaw) * weight, headPitch: pose.headPitch * (1 - weight) + (pitchDeg - pose.pitch) * weight };
};
