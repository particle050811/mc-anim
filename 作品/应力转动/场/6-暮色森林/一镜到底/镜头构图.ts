// 一镜到底镜头的构图参数 P 和几何：P ↔ 镜头位置、解视线、审过的旧机位换算成 P、孔道里夹镜头。
import { sample, type Key } from '@engine/anim/anim.ts';
import { WIDE_LENS } from '@engine/flight/飞行路径.ts';
import * as route from './路线.ts';
import { boreSources } from './孔道.ts';

// ---------- 小工具 ----------
export type Vec = number[];
export const add = (a: Vec, b: Vec) => a.map((x, i) => x + b[i]);
export const sub = (a: Vec, b: Vec) => a.map((x, i) => x - b[i]);
export const mul = (a: Vec, k: number) => a.map((x) => x * k);
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec) => mul(a, 1 / (len(a) || 1));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ss = (x: number) => {
  const clamped = clamp01(x);
  return clamped * clamped * (3 - 2 * clamped);
};
// 五次缓动（头尾速度、加速度都是 0）：机位之间的渐变用它，接缝处二阶连续
export const s5 = (x: number) => {
  const clamped = clamp01(x);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};
export const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const slerp = (from: Vec, to: Vec, k: number) => {
  const θ = Math.acos(Math.min(1, Math.max(-1, dot(from, to))));
  if (θ < 1e-6) return to;
  return add(mul(from, Math.sin((1 - k) * θ) / Math.sin(θ)), mul(to, Math.sin(k * θ) / Math.sin(θ)));
};
const angleDiff = (fromDeg: number, toDeg: number) => {
  let diff = toDeg - fromDeg;
  diff -= 360 * Math.round(diff / 360);
  return diff;
};

// ---------- 构图参数 P ----------
// `距`：ln 距离（米）；`方`：方位（度，0 = 骑手正后方，往扫帚左手边为正，180 = 正前方）；`仰`：仰角（度，相对扫帚的俯仰往上）；
// `x`、`y`：骑手中心在画面上的位置；`焦`：ln 焦距（mm，36mm 横向画幅）；`偏`：视线往 boss 偏多少（0～1，按方向球面插值）
export type Framing = { 距: number; 方: number; 仰: number; x: number; y: number; 焦: number; 偏: number };
const framingKeys = ['距', '方', '仰', 'x', 'y', '焦', '偏'] as const;
export const mixFraming = (a: Framing, b: Framing, k: number): Framing => ({
  距: lerp(a.距, b.距, k),
  方: a.方 + angleDiff(a.方, b.方) * k,
  仰: lerp(a.仰, b.仰, k),
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  焦: lerp(a.焦, b.焦, k),
  偏: lerp(a.偏, b.偏, k),
});

// 骑手中心：扫帚杆中心往上 0.2 米（同 6-2-5、验收.ts）
export const riderAt = (F: number) => add(route.扫帚(F).位置, [0, 0, 0.2]);
// 扫帚这一刻的朝向架：前（三维切线）、水平前、右（水平）、法（竖直面里垂直于前、朝上）。
// 按规划航线（不带真实飞行偏移）的切线：偏移是慢漂移（用户 10-05），镜头跟着骑手平移、方向不跟着晃；
// 跟着带偏移的切线转的话视线角加速度多出 0.1～0.2°/帧²
export const broomFrame = (frame: number) => {
  const dist = Math.min(Math.max(route.扫帚(frame).s, 1), route.路线长 - 1);
  const t = norm(sub(route.规划位置(dist + 1), route.规划位置(dist - 1)));
  const horizLen = Math.hypot(t[0], t[1]) || 1;
  const flatFwd = [t[0] / horizLen, t[1] / horizLen, 0];
  const right = [flatFwd[1], -flatFwd[0], 0];
  return { forward: t, flatFwd: flatFwd, right: right, normal: cross(right, t) };
};
// P 的位置部分 → 镜头位置（相对骑手）。方位绕竖直轴转（锁航向），仰角从扫帚前方往上量（一镜到底俯仰最快 2°/帧，镜头跟着转得匀）
export const camPosOf = (framing: Framing, frame: number) => {
  const { forward: fwd, right: right, normal: normal } = broomFrame(frame);
  const dist = Math.exp(framing.距);
  const azimuth = rad(framing.方);
  const elev = rad(framing.仰);
  // 往后（−前）转方位：方 90 = 左手边（−右）
  const horizDir = add(mul(fwd, -Math.cos(azimuth)), mul(right, -Math.sin(azimuth)));
  return add(riderAt(frame), mul(add(mul(horizDir, Math.cos(elev)), mul(normal, Math.sin(elev))), dist));
};
// 镜头位置 → P 的位置部分（停住、追、洞道这些自己走的机位换算回 P 用）
export const posToFraming = (camPos: Vec, frame: number): Pick<Framing, '距' | '方' | '仰'> => {
  const { forward: fwd, right: right, normal: normal } = broomFrame(frame);
  const offset = sub(camPos, riderAt(frame));
  const dist = len(offset);
  const elev = Math.asin(Math.max(-1, Math.min(1, dot(offset, normal) / dist)));
  return { 距: Math.log(dist), 方: deg(Math.atan2(-dot(offset, right), -dot(offset, fwd))), 仰: deg(elev) };
};

// ---------- 视线：骑手落在画面 (x, y) 上 ----------
// 镜头不横滚：视线 = (偏航 ψ, 俯仰 θ)，右 = 水平，上 = 右 × 前。牛顿法解 ψ、θ 使骑手的投影正好在 (x, y)
const dirOf = (ψ: number, θ: number) => [Math.cos(θ) * Math.sin(ψ), Math.cos(θ) * Math.cos(ψ), Math.sin(θ)];
export const project = (camPos: Vec, fw: Vec, lens: number, point: Vec) => {
  const rt = [Math.hypot(fw[0], fw[1]) ? fw[1] / Math.hypot(fw[0], fw[1]) : 1, Math.hypot(fw[0], fw[1]) ? -fw[0] / Math.hypot(fw[0], fw[1]) : 0, 0];
  const up = cross(rt, fw);
  const rel = sub(point, camPos);
  const z = dot(rel, fw);
  const k = lens / 36;
  return [(dot(rel, rt) / z) * k, (dot(rel, up) / z) * k];
};
export const solveView = (camPos: Vec, rider: Vec, x: number, y: number, lens: number) => {
  const toRider = sub(rider, camPos);
  let ψ = Math.atan2(toRider[0], toRider[1]);
  let θ = Math.atan2(toRider[2], Math.hypot(toRider[0], toRider[1]));
  for (let it = 0; it < 8; it++) {
    const screen = project(camPos, dirOf(ψ, θ), lens, rider);
    const err = [screen[0] - x, screen[1] - y];
    if (Math.hypot(err[0], err[1]) < 1e-7) break;
    const step = 1e-5;
    const sa = project(camPos, dirOf(ψ + step, θ), lens, rider);
    const sb = project(camPos, dirOf(ψ, θ + step), lens, rider);
    const jacobian = [
      [(sa[0] - screen[0]) / step, (sb[0] - screen[0]) / step],
      [(sa[1] - screen[1]) / step, (sb[1] - screen[1]) / step],
    ];
    const det = jacobian[0][0] * jacobian[1][1] - jacobian[0][1] * jacobian[1][0];
    if (Math.abs(det) < 1e-12) break;
    ψ -= (jacobian[1][1] * err[0] - jacobian[0][1] * err[1]) / det;
    θ -= (-jacobian[1][0] * err[0] + jacobian[0][0] * err[1]) / det;
  }
  return dirOf(ψ, θ);
};

// ---------- 原来审过的机位换算成 P ----------
// 审过的各处机位的原参数：镜头在路线上落后 `后` 米、抬高 `高` 米、往右 `侧` 米；视线落在扫帚前方 `前瞻` 米、往下 `低` 米；
// `绕` = 1 时 后、侧 由 `角`（度，往左为正）、`radius` 定。再按 `pullIn`（用户 10-07 嫌人物占比太小）把镜头沿「镜头 → 骑手」推近，视线方向不变。
// 按直的、平的路线换算出 P，各处构图和原来一样
export type LegacyParams = { back: number; height: number; side: number; lookAhead: number; low: number; focalLength: number; lookBoss: number; orbit: number; angle: number; radius: number };
export const legacyCruise: LegacyParams = { back: 18, height: 7, side: 0, lookAhead: 70, low: 28, focalLength: 18, lookBoss: 0, orbit: 0, angle: 0, radius: 0 };
// 拉近：离骑手 20 米以内推到 6.6 米（同 6-2-5 的 0.34 倍），比它近的照旧（近景绕圈 2～4 米），20～45 米三次接回原距离
export const pullInDist = 6.6;
const mapDist = (dist: number) => {
  if (dist <= 20) return Math.min(dist, pullInDist);
  if (dist >= 45) return dist;
  const span = 25;
  const t = (dist - 20) / span;
  return (2 * t ** 3 - 3 * t ** 2 + 1) * pullInDist + (-2 * t ** 3 + 3 * t ** 2) * 45 + (t ** 3 - t ** 2) * span;
};
const fromLegacy = (legacy: LegacyParams, pullIn = true): Framing => {
  let back = legacy.back;
  let side = legacy.side;
  if (legacy.orbit > 0) {
    back = lerp(back, legacy.radius * Math.cos(rad(legacy.angle)), legacy.orbit);
    side = lerp(side, -legacy.radius * Math.sin(rad(legacy.angle)), legacy.orbit);
  }
  // 直线、平飞：骑手在原点往 +y 飞，扫帚杆中心 z 0、骑手中心 z 0.2
  const rider = [0, 0, 0.2];
  let cam = [side, -back, legacy.height];
  let target = [0, legacy.lookAhead, -legacy.low];
  if (pullIn) {
    const offset = sub(cam, rider);
    const dist = len(offset);
    const C2 = add(rider, mul(offset, mapDist(dist) / dist));
    target = add(target, sub(C2, cam));
    cam = C2;
  }
  const offset = sub(cam, rider);
  const dist = len(offset);
  const fw = norm(sub(target, cam));
  const [x, y] = project(cam, fw, legacy.focalLength, rider);
  return { 距: Math.log(dist), 方: deg(Math.atan2(-offset[0], -offset[1])), 仰: deg(Math.asin(offset[2] / dist)), x, y, 焦: Math.log(legacy.focalLength), 偏: legacy.lookBoss };
};
// 一串关键帧（没写的参数沿用前一个，最前面是巡航）换算成 P 的关键帧。`pullInAt`：每个关键帧拉不拉（巨人屋外侧视不拉）
export type LegacyKey = [number, Partial<LegacyParams>];
export type Keys = [number, Framing];
export const convertKeys = (ks: LegacyKey[], pullInAt: (i: number) => boolean = () => true): Keys[] => {
  let legacy = { ...legacyCruise };
  const out: Keys[] = [];
  ks.forEach(([frame, partial], i) => {
    legacy = { ...legacy, ...partial };
    const framing = fromLegacy(legacy, pullInAt(i));
    // 方位：绕圈的按 角 一路往左数到 360°（不能按最短的方向插回去）；其余接着上一个关键帧按最短的方向数
    if (legacy.orbit >= 1) framing.方 = legacy.angle;
    else if (out.length) framing.方 = out[out.length - 1][1].方 + angleDiff(out[out.length - 1][1].方, framing.方);
    out.push([frame, framing]);
  });
  return out;
};
// 巡航（boss 之间高速飞）用广角（见 lib/飞行路径.ts 的 WIDE_LENS）：18mm → 10mm，距离按同样倍数推近，骑手在画面上的位置、大小不变。
// 起飞、boss 近景、降落各有自己的关键帧（没写的参数照 legacyCruise 的 18mm），进出时按 ln 焦距、ln 距离渐变过去
const narrowCruise = fromLegacy(legacyCruise);
export const cruiseFraming: Framing = { ...narrowCruise, 焦: Math.log(WIDE_LENS), 距: narrowCruise.距 + Math.log(WIDE_LENS / legacyCruise.focalLength) };
// 关键帧插值（lib/anim.ts 的 smooth：单调三次 Hermite，不冲过关键帧）
export const sampleKeys = (ks: Keys[], frame: number, anchor = 0): Framing => {
  const result = { ...cruiseFraming };
  for (const key of framingKeys) result[key] = sample(ks.map(([keyFrame, framing]) => [anchor + keyFrame, framing[key]] as Key), frame);
  return result;
};

// ---------- 孔道：钻墙洞、洞道时镜头夹在洞里 ----------
// 各段 编排.ts 的孔道：相对贯穿点的路程区间和洞里允许的 `侧`（右为正）、`高`（相对扫帚杆）。镜头所在处（投到路线上）落进去时，往右 / 往上的偏移夹在洞口里
// （两头 2 米渐变；绕圈转到扫帚侧前方时只在真落在洞里的那一段夹，不渐变）
type Bore = { s0: number; s1: number; 侧: number; 高: [number, number] };
const bores: Bore[] = (Object.keys(route.穿刺表) as route.Boss名[]).flatMap((bossName) => {
  const sp = route.标记路程(`${bossName}.贯穿`);
  return ((boreSources[bossName] ?? []) as { a: [number, number]; 侧: number; 高: [number, number] }[]).map((k) => ({ s0: sp + k.a[0], s1: sp + k.a[1], 侧: k.侧, 高: k.高 }));
});
export const clampToBore = (camPos: Vec, frame: number, azimuth: number) => {
  const sr = route.扫帚(frame).s;
  const { flatFwd: flatFwd } = broomFrame(frame);
  const sc = Math.min(route.路线长, Math.max(0, sr + dot(sub(camPos, riderAt(frame)), flatFwd)));
  const orbiting = clamp01(Math.abs(angleDiff(0, azimuth)) / 20);
  let out = camPos;
  for (const k of bores) {
    if (sc < k.s0 - 2 || sc > k.s1 + 2) continue;
    const ramp = Math.min(ss((sc - (k.s0 - 2)) / 2), ss((k.s1 + 2 - sc) / 2));
    const weight = lerp(ramp, sc >= k.s0 && sc <= k.s1 ? 1 : 0, orbiting);
    if (weight <= 0) continue;
    const routePt = route.位置(sc);
    const t = route.切线(sc);
    const horizLen = Math.hypot(t[0], t[1]) || 1;
    const right = [t[1] / horizLen, -t[0] / horizLen, 0];
    const side = dot(sub(out, routePt), right);
    const height = out[2] - routePt[2];
    const sideClamped = Math.max(-k.侧, Math.min(k.侧, side));
    const heightClamped = Math.max(k.高[0], Math.min(k.高[1], height));
    out = add(out, add(mul(right, (sideClamped - side) * weight), [0, 0, (heightClamped - height) * weight]));
  }
  return out;
};
