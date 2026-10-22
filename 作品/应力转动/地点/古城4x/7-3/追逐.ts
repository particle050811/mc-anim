// 第 7 章第 3 场的追逐：马和监守者各走哪条路、多快（纯数据，时间线.ts 排时刻、戏.ts 取位置）。
// 用户 10-19：马一路往前、不回头，抄近路；监守者绕远路（同 7-4-1）。路线按地形挑（../古城4x布局/第7章.ts 的 scene73，工具/古城4x布局/核对.py 逐格查过）：
//   马在北墙头一跃 32 米跨过墙头的豁口落到东段、再一跃上墙上的塔顶，挨了音波一跃下到墙外大道往东冲；
//   监守者在墙下，得钻城门洞、顺台阶上墙头再沿墙头追，追到塔脚就上不去了（塔顶比墙头高 7 格）。
// 用户 10-18 定：马 50、监守者 60 米/秒，加速、刹车都按 `RAMP_SEC`（0.3 秒）到全速。
import { 例外 } from '@engine/core/例外.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { RAMP_SEC } from '@库/角色/跑步.ts';
import { baseSpeed, eliteLeap, scene73, type 跳 } from '../布局.ts';

export const horseChaseSpeed = baseSpeed.马;
export const wardenChaseSpeed = baseSpeed.监守者;
export const horseAccel = horseChaseSpeed / RAMP_SEC;
export const wardenAccel = wardenChaseSpeed / RAMP_SEC;
export const mortarShotSpeed = 2.0; // 迫击炮出手速度，格/刻（40 米/秒；原版 0.88 太慢，用户 10-18 定动画里搞快）

// ======================= 监守者：游戏 (x, z, 脚底 y) 折线，按路程走 =======================
type RoutePoint = [number, number, number];
// 拐角按路程前后各 1.5 米取平均磨圆，高差前后各 0.8 米（台阶一级一级的，磨成坡）
const cornerRadius = 1.5;
const stepRadius = 0.8;
export const makeRoute = (points: RoutePoint[], speed: number, accel: number) => {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = cum[cum.length - 1];
  const raw = (s: number): RoutePoint => {
    const c = Math.min(length, Math.max(0, s));
    let i = 1;
    while (i < points.length - 1 && cum[i] < c) i++;
    const k = (c - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const a = points[i - 1];
    const b = points[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  // 两头不磨（起点、终点要正好落在点上）
  const average = (s: number, maxRadius: number, axis: number) => {
    const radius = Math.max(0, Math.min(maxRadius, s, length - s));
    const n = 12;
    let sum = 0;
    for (let j = 0; j <= n; j++) sum += raw(s - radius + (2 * radius * j) / n)[axis];
    return sum / (n + 1);
  };
  const at = (s: number): RoutePoint => [average(s, cornerRadius, 0), average(s, cornerRadius, 1), average(s, stepRadius, 2)];
  // 从静止起跑、停在终点，按加速度提前减速；s(t) 按 0.05 米一步积出来
  const ds = 0.05;
  const n = Math.ceil(length / ds);
  const vmax: number[] = Array.from({ length: n + 1 }, () => speed);
  vmax[0] = 0;
  vmax[n] = 0;
  for (let i = 1; i <= n; i++) vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i - 1] ** 2 + 2 * accel * ds));
  for (let i = n - 1; i >= 0; i--) vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] ** 2 + 2 * accel * ds));
  const times = [0];
  for (let i = 1; i <= n; i++) times.push(times[i - 1] + (2 * ds) / Math.max(1e-3, vmax[i - 1] + vmax[i]));
  const total = times[n];
  // 起跑后 dt 秒走了多远、多快
  const run = (dt: number) => {
    if (dt <= 0) return { s: 0, v: 0 };
    if (dt >= total) return { s: length, v: 0 };
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= dt) lo = mid;
      else hi = mid;
    }
    const k = (dt - times[lo]) / (times[hi] - times[lo]);
    return { s: Math.min(length, (lo + k) * ds), v: vmax[lo] + (vmax[hi] - vmax[lo]) * k };
  };
  // 第一次走到路程 s 的时刻（起跑后多少秒）
  const timeAtS = (s: number) => times[Math.min(n, Math.max(0, Math.round(s / ds)))];
  return { length, at, total, run, timeAtS, cum };
};
export const wardenRoute = makeRoute(scene73.wardenRoute, wardenChaseSpeed, wardenAccel);
// 分两截跑：先冲上墙头，在台阶顶往东 6.6 米那一点（第 7 个点）站定蓄音爆，马落上塔顶再冲到塔脚（时刻见 时间线.ts）。
// 站定点离塔脚 19 米：再近冲不起来（加速、刹车各要 9 米），再远马在塔顶干等
const wardenHoldIndex = 6;
export const wardenRouteToHold = makeRoute(scene73.wardenRoute.slice(0, wardenHoldIndex + 1), wardenChaseSpeed, wardenAccel);
export const wardenRouteToTower = makeRoute(scene73.wardenRoute.slice(wardenHoldIndex), wardenChaseSpeed, wardenAccel);
// 台阶顶（上到墙头那一点）在路上的程
export const wardenStairTopS = wardenRoute.cum[4];

// ======================= 马：三跃（强者跳的弹道，../古城4x布局/强者.ts） =======================
// 离地按 方块.py 查过不撞的取：第一跃擦过墙头豁口两边的垛、第二跃上塔、第三跃越过墙外沿的垛
export const leapApex = { 一: 2.5, 二: 1.5, 三: 1.5 };
export const leapFrom = (p0: V3, p1: V3, apex: number, t0: number, fps: number): 跳 => eliteLeap(p0, p1, apex, t0 * fps, fps);
// 第一跃落在墙头东段，几乎不停（落地 2 帧就是第二跃的蓄力）；第二跃落在塔顶西沿，按落地时的水平速度刹住。
// 刹车不按全片的 `RAMP_SEC`（跑步.ts）：塔顶只有 5 格宽，0.3 秒要滑 2.2 米，再挨音爆往东横滑会停到塔顶东沿外 1 米（悬空），所以这里是例外
export const towerBrakeSec = 例外('起停', 0.15, { 场: '7-墙头追逐', 原因: '马落塔顶刹车：塔顶只有 5 格宽，0.3 秒会滑出塔沿；用户 10-21 定照留' });
// 音爆的击退（原版 SonicBoom：水平 2.5 格/刻 × 方向的水平分量；之后每刻按地面摩擦 0.546 衰减）
export const knockFriction = 0.6 * 0.91;
export const knockSlide = (horizFraction: number) => (2.5 * horizFraction) / (1 - knockFriction);
export const knockAfter = (horizFraction: number, sec: number) => ((2.5 * horizFraction) * (1 - knockFriction ** Math.max(0, sec * 20))) / (1 - knockFriction);
// 墙外大道：落地后顺 z 199 往东冲（布局 scene73.大道）
export const avenueEast = (dist: number): V3 => [scene73.大道[0] + dist, scene73.大道[1], scene73.大道[2]];
