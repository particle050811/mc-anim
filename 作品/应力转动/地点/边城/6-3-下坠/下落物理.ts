// 6-3 下坠里李樱的下落（纯函数，只引类型）：起跳 → 按落点瞄准 → 撞击，输入全由参数给，时间线.ts 求一次。
// 单放出来是为了能单独测：时间线.ts 的闭包里有模型、贴图资产。
// 坐标：场景 z 朝上，米；时刻都是物理时间（秒，见 时间线.ts 文件头）。
import type { V3 } from '@engine/model/parts.tsx';

// ---------- 下落物理 ----------
// 质点：鼓风机开推前是重力 + 二次空气阻力（k = g / 终端速度²），开推后三个分量各自往目标速度拉（推力数值见 基准.ts 的 `blower`；lateral 是目标速度的水平分量）。RK4，步长 1/480 秒，打表
const G_ACC = 9.81;
export type FallTable = { t0: number; dt: number; p: V3[]; v: V3[] };
export type Blower = { topSpeed: number; maxAccel: number; timeConst: number; 开: number };
const integrate = (blower: Blower, p0: V3, v0: V3, t0: number, vt: number, tEnd: number, lateral: readonly [number, number], stopZ = -Infinity): FallTable => {
  const k = G_ACC / (vt * vt);
  const targetVel: V3 = [lateral[0], lateral[1], -blower.topSpeed];
  const maxAcc = blower.maxAccel;
  const acc = (t: number, vel: number[]) => {
    if (t >= blower.开) return vel.map((x, i) => Math.max(-maxAcc, Math.min(maxAcc, (targetVel[i] - x) / blower.timeConst)));
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    return [-k * speed * vel[0], -k * speed * vel[1], -G_ACC - k * speed * vel[2]];
  };
  const dt = 1 / 480;
  const positions: V3[] = [p0];
  const Vs: V3[] = [v0];
  let pos = [...p0];
  let vel = [...v0];
  for (let t = t0; t < tEnd && pos[2] > stopZ; t += dt) {
    const a1 = acc(t, vel);
    const v2 = vel.map((x, i) => x + (a1[i] * dt) / 2);
    const a2 = acc(t + dt / 2, v2);
    const v3 = vel.map((x, i) => x + (a2[i] * dt) / 2);
    const a3 = acc(t + dt / 2, v3);
    const v4 = vel.map((x, i) => x + a3[i] * dt);
    const a4 = acc(t + dt, v4);
    pos = pos.map((x, i) => x + (dt / 6) * (vel[i] + 2 * v2[i] + 2 * v3[i] + v4[i]));
    vel = vel.map((x, i) => x + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]));
    positions.push(pos as V3);
    Vs.push(vel as V3);
  }
  return { t0, dt, p: positions, v: Vs };
};
export const at = (fallTable: FallTable, t: number): { p: V3; v: V3 } => {
  const x = Math.min(Math.max((t - fallTable.t0) / fallTable.dt, 0), fallTable.p.length - 1);
  const i = Math.min(Math.floor(x), fallTable.p.length - 2);
  const frac = x - i;
  const lp = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
  if (t - fallTable.t0 > (fallTable.p.length - 1) * fallTable.dt) {
    // 表外：按末速度直线外推（只在撞击以后用到一点点）
    const overSec = (t - fallTable.t0) - (fallTable.p.length - 1) * fallTable.dt;
    const lastPos = fallTable.p[fallTable.p.length - 1];
    const lastVel = fallTable.v[fallTable.v.length - 1];
    return { p: [lastPos[0] + lastVel[0] * overSec, lastPos[1] + lastVel[1] * overSec, lastPos[2] + lastVel[2] * overSec], v: lastVel };
  }
  return { p: lp(fallTable.p[i], fallTable.p[i + 1]), v: lp(fallTable.v[i], fallTable.v[i + 1]) };
};

// ---------- 李樱的下落：起跳 → 瞄准 → 撞击 ----------
// 输入：起跳那刻的髋、扫帚头的水平方向、跃出的物理时刻、终端速度、推力，和李樱的骨架算出来的（编排/李樱姿势.ts）打击姿势时滚筒最低点比髋低多少（strikeDepth）、
// 给定髋位置时打击姿势的锤头在哪（maceHeadAt）。九胡一直坐在扫帚上，不掉下来，只算李樱。
export type FallInput = { hip: V3; forward: readonly number[]; leapSec: number; terminalSpeed: number; blower: Blower; groundZ: number; strikeDepth: number; landing: readonly number[]; maceHeadAt: (hip: V3) => V3 };
export const solveFall = ({ hip, forward, leapSec, terminalSpeed, blower, groundZ, strikeDepth, landing, maceHeadAt }: FallInput) => {
  // 往前（扫帚头的方向）1.5 米/秒、往下 12 米/秒，头朝下扎下去
  const takeoff = (lateral: readonly [number, number]) => integrate(blower, hip, [forward[0] * 1.5, forward[1] * 1.5, -12], leapSec, terminalSpeed, 60, lateral, 0);
  // 撞击：锤头碰到地面（石半砖顶面）的物理时刻，打击姿势时锤头在髋下方 strikeDepth 米
  const impactOf = (fallTable: FallTable) => {
    const target = groundZ + strikeDepth;
    let i = 0;
    while (i < fallTable.p.length - 1 && fallTable.p[i + 1][2] > target) i++;
    const z0 = fallTable.p[i][2];
    const z1 = fallTable.p[i + 1][2];
    return fallTable.t0 + (i + (z0 - target) / (z0 - z1)) * fallTable.dt;
  };
  // 瞄准：推力目标速度的水平分量按落点反算两轮（水平速度按时间常数贴近目标，起头少走 时间常数 那么长）
  let lateral: [number, number] = [0, 0];
  let table = takeoff(lateral);
  let impact = impactOf(table);
  for (let k = 0; k < 2; k++) {
    const head = maceHeadAt(at(table, impact).p);
    const pushDuration = impact - blower.开 - blower.timeConst;
    lateral = [lateral[0] + (landing[0] - head[0]) / pushDuration, lateral[1] + (landing[1] - head[1]) / pushDuration];
    table = takeoff(lateral);
    impact = impactOf(table);
  }
  return { table, impactTime: impact, lateral };
};
