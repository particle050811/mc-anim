// 7-4-3 镜头 1 坑口：刘心忠、黄叛从竖井里强者跳上来，落在坑北沿（用户 10-19 定：只演最后一跳，镜头要看到他们从下往上飞起来）。纯函数，输入段内帧 f。
// 场景、坑、竖井、卫兵和 6-3-10 末帧同一套（6-3-8/画面.tsx 的 PursuerScene）；坑口没有幽灵马：召唤的马爬不上 141 米的竖井，留在了下面。
// 6-3-10 围在坑口的九个卫兵还在原位往下看（`guardPoseAt` 取 6-3-10 末帧）；两人冒出井口时各自一惊：蹲着的站起来、往后让半步，
//   头先、身子随后转过去盯着离自己近的那一个。
// 跳：古城4x布局/强者.ts 的 `eliteLeap`（重力 32），起点在井下 15 米、落点井心往北 4.5 米；往上冲出井口时竖直 30 米/秒，出井口时水平才走了 1 米，不擦井壁。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { type FigurePose } from '../../../../world/角色/骨架.tsx';
import { eliteLeap, type 跳 } from '../../../../world/地点/古城4x/布局/强者.ts';
import { flightPose, landPose, mixPose, nearYaw, standAt } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { shaftCellCenter } from '../../../../world/地点/边城/6-3-下坠/编排.ts';
import pitSurfaceTable from 'asset:数据/镜头/6-3-下坠/竖井4x.坑面';
import { guardPoseAt, lastSec as lastSec6, 卫兵位置, type GuardPose } from '../../../../world/地点/边城/6-3-8/编排.ts';
import { borderTownPos } from '../../../../world/地点/主世界116.ts';

const FPS = 24;
const D2R = Math.PI / 180;
const ss = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
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
const LAND_LEN = 6; // 落地深蹲（强者.ts 的 landingSquatSec 0.25 秒）
const RISE_LEN = 8; // 蹲完站直
type Leaper = { leap: 跳; armRScale: number; look: (f: number) => { yaw: number; headYaw: number; headPitch: number } };
const leaper = (dx0: number, dy0: number, dx1: number, dy1: number, f0: number) => {
  const c = shaftCellCenter();
  return eliteLeap(add(c, [dx0, dy0, -15]), onSurface(dx1, dy1), 7, f0);
};
const liuLeap = leaper(-0.6, -0.7, -1.3, 4.7, 10);
const huangLeap = leaper(0.6, -0.5, 1.4, 4.4, 15);
export const landFrame = { 刘: liuLeap.f1, 黄: huangLeap.f1 };
// 冒出井口（脚底高过井口一圈的坑面）的那一帧，卫兵从这一刻起反应
const emergeFrame = (L: 跳) => L.f0 + (L.tUp - Math.sqrt(Math.max(0, L.top - (L.p0[2] + 7)) / 16)) * FPS;
export const firstEmergeFrame = emergeFrame(liuLeap);

// 落地站直以后：黄叛先扭头看刘心忠、身子跟着侧过来；刘心忠扫一眼东边围着的卫兵，身子也带过去一点
const huangLook = (f: number) => {
  const k = ss((f - huangLeap.f1 - LAND_LEN - 2) / 7);
  const toLiu = wrap(yawTo(huangLeap.p1, liuLeap.p1) - huangLeap.yaw);
  const body = ss((f - huangLeap.f1 - LAND_LEN - 5) / 9) * toLiu * 0.45;
  return { yaw: huangLeap.yaw + body, headYaw: k * toLiu - body, headPitch: -4 * k };
};
const liuLook = (f: number) => {
  const k = ss((f - liuLeap.f1 - LAND_LEN - 6) / 8);
  const body = ss((f - liuLeap.f1 - LAND_LEN - 9) / 10) * -14;
  return { yaw: liuLeap.yaw + body, headYaw: -30 * k - body, headPitch: -6 * k };
};
const LEAPERS: Record<'刘' | '黄', Leaper> = {
  刘: { leap: liuLeap, armRScale: 0.5, look: liuLook },
  黄: { leap: huangLeap, armRScale: 1, look: huangLook },
};
export const leaperPose = (who: '刘' | '黄', f: number): FigurePose | null => {
  const { leap, armRScale, look } = LEAPERS[who];
  if (f < leap.f0) return null; // 还在井下
  if (f < leap.f1) return flightPose(leap, f, { place: false, armRScale });
  const s = f - leap.f1;
  const lk = look(f);
  if (s < LAND_LEN) return landPose(leap.p1, leap.yaw, s, LAND_LEN);
  const stand = standAt(leap.p1, nearYaw(leap.yaw, lk.yaw), lk.headYaw, lk.headPitch);
  return mixPose(landPose(leap.p1, leap.yaw, LAND_LEN, LAND_LEN), { ...stand, loc: leap.p1 }, ss((s - LAND_LEN) / RISE_LEN));
};
const chestOf = (who: '刘' | '黄', f: number): V3 | null => {
  const p = leaperPose(who, f);
  return p ? add(p.loc, [0, 0, 1.2]) : null;
};

// ---------- 卫兵 ----------
// 6-3-10 末帧的站位、姿势
const guardBaseSec = lastSec6;
const jitter01 = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
export const guardCount = 卫兵位置.length;
// 盯着的人：落点离自己近的那一个；冒出井口后 3～8 帧反应过来
const guardReaction = (i: number) => {
  const feet = add(borderTownPos, guardPoseAt(guardBaseSec, i).pos);
  const who: '刘' | '黄' = Math.hypot(liuLeap.p1[0] - feet[0], liuLeap.p1[1] - feet[1]) < Math.hypot(huangLeap.p1[0] - feet[0], huangLeap.p1[1] - feet[1]) ? '刘' : '黄';
  return { who, feet, react: (emergeFrame(LEAPERS[who].leap) + 3 + 5 * jitter01(i, 21)) / FPS };
};
// 往后让半步的脚步声（离落点最近的两个卫兵，那一步落地的时刻）
export const guardSteps = () =>
  Array.from({ length: guardCount }, (_, i) => ({ i, ...guardReaction(i) }))
    .sort((a, b) => Math.hypot(a.feet[0] - LEAPERS[a.who].leap.p1[0], a.feet[1] - LEAPERS[a.who].leap.p1[1]) - Math.hypot(b.feet[0] - LEAPERS[b.who].leap.p1[0], b.feet[1] - LEAPERS[b.who].leap.p1[1]))
    .slice(0, 2)
    .map((g) => ({ i: g.i, 帧: Math.round((g.react + 0.35) * FPS), 位置: g.feet }));
export const guardPose = (f: number, i: number): GuardPose => {
  const base = guardPoseAt(guardBaseSec, i);
  const { who, react, feet } = guardReaction(i);
  const t = f / FPS;
  const k = (t0: number, dur: number) => ss((t - t0) / dur);
  const stand = k(react, 0.2);
  // 往后让半步：背离那个人的落点
  const away = [feet[0] - LEAPERS[who].leap.p1[0], feet[1] - LEAPERS[who].leap.p1[1]];
  const awayLen = Math.hypot(away[0], away[1]) || 1;
  const backK = k(react + 0.05, 0.4);
  const backDist = 0.7 * backK;
  const pos: V3 = [base.pos[0] + (away[0] / awayLen) * backDist, base.pos[1] + (away[1] / awayLen) * backDist, base.pos[2]];
  // 头先、身子晚 0.12 秒跟着转过去（转八成五）
  const target = chestOf(who, f) ?? add(shaftCellCenter(), [0, 0, -3]);
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
export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };
const rawTarget = (f: number): V3 => {
  const c = shaftCellCenter();
  const pts = (['刘', '黄'] as const).map((w) => chestOf(w, f)).filter((p): p is V3 => !!p && p[2] > c[2] - 7);
  if (!pts.length) return add(c, [0, 0.8, -3]);
  const m = pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3).map((v) => v / pts.length) as V3;
  return [lerp(c[0], m[0], 0.7), m[1], m[2] - 0.6];
};
export const pitCam = (f: number): Cam => {
  const c = shaftCellCenter();
  // 前后 9 帧的平均（往前多看几帧，人冲得快，镜头不能落在后面），免得人一冒头镜头就一跳
  let acc: V3 = [0, 0, 0];
  for (let k = -3; k <= 5; k++) acc = add(acc, rawTarget(f + k));
  return { pos: add(c, [0.4, 10.5, 4.8]), tgt: acc.map((v) => v / 9) as V3, lens: 26 };
};
