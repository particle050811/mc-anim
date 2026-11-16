// 7-4-3 镜头 1 坑口：刘心忠、黄叛从竖井里强者跳上来，落在坑北沿（用户 10-19 定：只演最后一跳，镜头要看到他们从下往上飞起来）。纯函数，输入段内秒。
// 场景、坑、竖井、卫兵和 6-3-10 末帧同一套（6-3-8/画面.tsx 的 PursuerScene）；坑口没有幽灵马：召唤的马爬不上 141 米的竖井，留在了下面。
// 6-3-10 围在坑口的九个卫兵还在原位往下看（`guardPoseAt` 取 6-3-10 末帧）；两人冒出井口时各自一惊：蹲着的站起来、往后让半步，
//   头先、身子随后转过去盯着离自己近的那一个。
// 跳：古城4x布局/强者.ts 的 `eliteLeap`（重力 32），起点在井下 15 米、落点井心往北 4.5 米；往上冲出井口时竖直 30 米/秒，出井口时水平才走了 1 米，不擦井壁。
import type { V3 } from '@engine/model/parts.tsx';
import { type FigurePose } from '@库/角色/骨架.tsx';
import { eliteLeap, type Jump } from '../../../地点/古城4x/布局/强者.ts';
import { FPS as cityPlayFps, flightPose, landPose, mixPose, nearYaw, standAt } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { shaftCellCenter } from '../../../地点/边城/6-3-下坠/编排.ts';
import pitSurfaceTable from 'asset:数据/镜头/6-3-下坠/竖井4x.坑面';
import { guardPoseAt, lastSec as lastSec6, guardPositions, type GuardPose } from '../../../地点/边城/6-3-8/编排.ts';
import { borderTownPos } from '../../../地点/主世界116.ts';
import { smoothstep01, lerp } from '@engine/core/数学.ts';
import type { Cam } from '@engine/core/机位.ts';

// `eliteLeap` 的 f0、f1 和 `flightPose`、`landPose` 的帧都按 古城戏 的旧网格（1/24 秒一格）数，这里秒乘它换过去
const leapCellsPerSec = cityPlayFps;
const D2R = Math.PI / 180;
const add = (a: number[], b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const yawTo = (p: number[], q: number[]) => Math.atan2(-(q[0] - p[0]), q[1] - p[1]) / D2R;
const pitchTo = (p: number[], q: number[]) => Math.atan2(q[2] - p[2], Math.hypot(q[0] - p[0], q[1] - p[1])) / D2R;
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

// 坑面高度（同 6-3-8/编排/卫兵.ts 的 groundHeight：井心 ±11 格，井口和表外按 0）
const surfaceZ = (x: number, y: number) => {
  const c = shaftCellCenter();
  const h = (pitSurfaceTable as unknown as { 高: (number | null)[][] }).高[Math.round(x - c[0]) + 11]?.[Math.round(y - c[1]) + 11];
  return c[2] + (typeof h === 'number' ? Math.max(h, -2) : 0);
};
const onSurface = (dx: number, dy: number): V3 => {
  const c = shaftCellCenter();
  return [c[0] + dx, c[1] + dy, surfaceZ(c[0] + dx, c[1] + dy)];
};

// ---------- 两人 ----------
const LAND_SEC = 0.25; // 落地深蹲（强者.ts 的 landingSquatSec）
const RISE_SEC = 1 / 3; // 蹲完站直
type Leaper = { leap: Jump; armRScale: number; look: (t: number) => { yaw: number; headYaw: number; headPitch: number } };
const leaper = (dx0: number, dy0: number, dx1: number, dy1: number, startSec: number) => {
  const c = shaftCellCenter();
  return eliteLeap(add(c, [dx0, dy0, -15]), onSurface(dx1, dy1), 7, startSec * leapCellsPerSec);
};
const liuLeap = leaper(-0.6, -0.7, -1.3, 4.7, 5 / 12);
const huangLeap = leaper(0.6, -0.5, 1.4, 4.4, 0.625);
const landSec = (L: Jump) => L.f1 / leapCellsPerSec;
// 冒出井口（脚底高过井口一圈的坑面）的那一刻，卫兵从这一刻起反应
const emergeSec = (L: Jump) => L.f0 / leapCellsPerSec + L.tUp - Math.sqrt(Math.max(0, L.top - (L.p0[2] + 7)) / 16);

// 落地站直以后：黄叛先扭头看刘心忠、身子跟着侧过来；刘心忠扫一眼东边围着的卫兵，身子也带过去一点
const huangLook = (t: number) => {
  const k = smoothstep01((t - landSec(huangLeap) - LAND_SEC - 1 / 12) / (7 / 24));
  const toLiu = wrap(yawTo(huangLeap.p1, liuLeap.p1) - huangLeap.yaw);
  const body = smoothstep01((t - landSec(huangLeap) - LAND_SEC - 5 / 24) / 0.375) * toLiu * 0.45;
  return { yaw: huangLeap.yaw + body, headYaw: k * toLiu - body, headPitch: -4 * k };
};
const liuLook = (t: number) => {
  const k = smoothstep01((t - landSec(liuLeap) - LAND_SEC - 0.25) / (1 / 3));
  const body = smoothstep01((t - landSec(liuLeap) - LAND_SEC - 0.375) / (5 / 12)) * -14;
  return { yaw: liuLeap.yaw + body, headYaw: -30 * k - body, headPitch: -6 * k };
};
const LEAPERS: Record<'刘' | '黄', Leaper> = {
  刘: { leap: liuLeap, armRScale: 0.5, look: liuLook },
  黄: { leap: huangLeap, armRScale: 1, look: huangLook },
};
export const leaperPose = (who: '刘' | '黄', t: number): FigurePose | null => {
  const { leap, armRScale, look } = LEAPERS[who];
  const cell = t * leapCellsPerSec;
  const landCells = LAND_SEC * leapCellsPerSec;
  if (cell < leap.f0) return null; // 还在井下
  if (cell < leap.f1) return flightPose(leap, cell, { place: false, armRScale });
  const s = cell - leap.f1;
  const lk = look(t);
  if (s < landCells) return landPose(leap.p1, leap.yaw, s, landCells);
  const stand = standAt(leap.p1, nearYaw(leap.yaw, lk.yaw), lk.headYaw, lk.headPitch);
  return mixPose(landPose(leap.p1, leap.yaw, landCells, landCells), { ...stand, loc: leap.p1 }, smoothstep01((s / leapCellsPerSec - LAND_SEC) / RISE_SEC));
};
const chestOf = (who: '刘' | '黄', t: number): V3 | null => {
  const p = leaperPose(who, t);
  return p ? add(p.loc, [0, 0, 1.2]) : null;
};

// ---------- 卫兵 ----------
// 6-3-10 末帧的站位、姿势
const guardBaseSec = lastSec6;
const jitter01 = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
export const guardCount = guardPositions.length;
// 盯着的人：落点离自己近的那一个；冒出井口后 1/8～1/3 秒反应过来
const guardReaction = (i: number) => {
  const feet = add(borderTownPos, guardPoseAt(guardBaseSec, i).pos);
  const who: '刘' | '黄' = Math.hypot(liuLeap.p1[0] - feet[0], liuLeap.p1[1] - feet[1]) < Math.hypot(huangLeap.p1[0] - feet[0], huangLeap.p1[1] - feet[1]) ? '刘' : '黄';
  return { who, feet, react: emergeSec(LEAPERS[who].leap) + 0.125 + (5 / 24) * jitter01(i, 21) };
};
export const guardPose = (t: number, i: number): GuardPose => {
  const base = guardPoseAt(guardBaseSec, i);
  const { who, react, feet } = guardReaction(i);
  const k = (t0: number, dur: number) => smoothstep01((t - t0) / dur);
  const stand = k(react, 0.2);
  // 往后让半步：背离那个人的落点
  const away = [feet[0] - LEAPERS[who].leap.p1[0], feet[1] - LEAPERS[who].leap.p1[1]];
  const awayLen = Math.hypot(away[0], away[1]) || 1;
  const backK = k(react + 0.05, 0.4);
  const backDist = 0.7 * backK;
  const pos: V3 = [base.pos[0] + (away[0] / awayLen) * backDist, base.pos[1] + (away[1] / awayLen) * backDist, base.pos[2]];
  // 头先、身子晚 0.12 秒跟着转过去（转八成五）
  const target = chestOf(who, t) ?? add(shaftCellCenter(), [0, 0, -3]);
  const eye = add(add(borderTownPos, pos), [0, 0, 1.62]);
  const wantYaw = base.bodyYaw + wrap(yawTo(eye, target) - base.bodyYaw);
  const bodyYaw = lerp(base.bodyYaw, base.bodyYaw + wrap(wantYaw - base.bodyYaw) * 0.85, k(react + 0.12, 0.35));
  const headYaw = Math.max(-70, Math.min(70, wrap(wantYaw - bodyYaw))) * k(react, 0.15) + base.headYaw * (1 - k(react, 0.15));
  const headPitch = lerp(base.headPitch, -pitchTo(eye, target), k(react, 0.12));
  return {
    ...base, pos, bodyYaw, headYaw, headPitch,
    crouch: base.crouch * (1 - stand),
    limbSwing: base.limbSwing + backDist / 0.28,
    stride: 0.6 * Math.sin(Math.PI * backK),
    capeLift: 0,
  };
};

// ---------- 机位 ----------
// 坑北边、两个北侧卫兵身后高处（离地 4.8 米）往南俯看井口；两人冲上来、落到镜头前面，镜头只跟着俯仰、左右摇（不推）
const rawTarget = (t: number): V3 => {
  const c = shaftCellCenter();
  const pts = (['刘', '黄'] as const).map((w) => chestOf(w, t)).filter((p): p is V3 => !!p && p[2] > c[2] - 7);
  if (!pts.length) return add(c, [0, 0.8, -3]);
  const m = pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3).map((v) => v / pts.length) as V3;
  return [lerp(c[0], m[0], 0.7), m[1], m[2] - 0.6];
};
// 取平均的取样：1/24 秒一个（沿用 24 帧网格时的取样）
const camSamplesPerSec = 24;
export const pitCam = (t: number): Cam => {
  const c = shaftCellCenter();
  // 前后 9 个取样的平均（往前多看几个，人冲得快，镜头不能落在后面），免得人一冒头镜头就一跳
  let acc: V3 = [0, 0, 0];
  for (let k = -3; k <= 5; k++) acc = add(acc, rawTarget(t + k / camSamplesPerSec));
  return { pos: add(c, [0.4, 10.5, 4.8]), tgt: acc.map((v) => v / 9) as V3, lens: 26 };
};
