// 气流：机械动力（Create 6.0.8）鼓风机吹出的 `AirFlowParticle`。6-4-3 风矢、6-4-3a 思索用直吹风道；回旋只在 鼓风机特效预览.tsx 的核对视图里画。
// 数值照 create-1.20.1-6.0.8.jar 字节码（`AirFlowParticle`、`AirCurrent.tick`、`IAirCurrentSource.getMaxDistance`、`CKinetics`）：
// 出生：每刻以 fanParticleDensity（0.5）概率在风扇中心+风向×0.5 放一个，各轴再偏 ±0.25；颜色 0xEEEEEE、透明度 0.25 不变、半边长 0.075～0.15、寿命 40 刻。
// 运动：d = 离出风口距离，速度 = 风向×0.0625×(最大距离−d+1) 格/刻；d<−0.25、出风道或到寿命就移除；最大距离 = lerp(min(|rpm|/256,1), 3, 20)。
// 贴图（`selectSprite`）：i = clamp(d/最大距离×8 + rand(4), 0, 7)，取 `SpriteSet.get(i, 8)`，列表是 generic_7…0，所以 generic_0 取不到。
// 纯函数：第 k 个出生槽的时刻和随机量都由 hash(种子, k, …) 给出，不存逐帧状态，乱序出帧结果一致。时间一律用剧情秒（慢放只缩时钟）。
// 粒子要跟着风扇走就在风扇本地坐标系里算、外面套 group；风扇不动直接用场景坐标。
// 接口：`directBlowDuct`(直吹参数)、`散花风道`（弓前风扇虚影用的两层预设）、`swirl`(SwirlParams) → `AirFlowParticle`[]；<`AirFlowQuads` items=… /> 绘制（对数深度，屏幕AO 第 3 遍半透明）；`ductLength`(rpm)。
// 例：const ps = 直吹风道({ 种子: 3, 时刻: T, 风口: [0, 0.5, 0], 方向: [0, 1, 0], 转速: 256, 密度: 15 });
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { hash2 } from '../../engine/core/噪声.ts';
import { pngDir } from '../../engine/model/贴图.ts';
import { Particle, particleTexture, ParticleQuads } from './粒子面片.tsx';

const GENERIC = pngDir(import.meta.webpackContext('./粒子.贴图', { regExp: /^\.\/generic_\d\.png$/ }));

export const airFlowConsts = {
  color: [0xee / 255, 0xee / 255, 0xee / 255] as [number, number, number],
  opacity: 0.25,
  lifeTicks: 40,
  jitter: 0.25,
  decay: 1 - 0.0625, // 每刻 (最大距离 + 1 − d) 乘的数
  defaultDensity: 0.5,
};

// 风道长度（格）：`getMaxDistance`
export const ductLength = (rpm: number) => 3 + (20 - 3) * Math.min(Math.abs(rpm) / 256, 1);

export type AirFlowParticle = {
  p: V3;
  贴图: number; // generic_几（0～7）
  half: number;
  alpha: number;
};

// 沿路径变化的量：常数；按顶点给的数组（顶点之间按弧长线性插值）；或函数 (s, t)，s 是走过的比例 0～1、t 是剧情秒
export type AlongPath = number | number[] | ((pathFrac: number, t: number) => number);

// ---------- 小工具 ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth01 = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
const perp = (axis: V3, ref: V3 = [0, 0, 1]): V3 => {
  let normal = sub(ref, mul(axis, dot(ref, axis)));
  if (len(normal) < 1e-4) normal = sub([1, 0, 0], mul(axis, axis[0]));
  return norm(normal);
};
const rotate = (vec: V3, k: V3, angle: number): V3 => {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return add(add(mul(vec, cosA), mul(cross(k, vec), sinA)), mul(k, dot(k, vec) * (1 - cosA)));
};
// 随机数：种子、槽号、第几个量 → 0～1
const slotRand = (seed: number, k: number, ch: number) => hash2(seed * 7919 + ch, k, ch);
// 粒子半边长：0.1×(0.5~1)×2×0.75
const halfOf = (r: number, sizeScale: number) => 0.1 * (r * 0.5 + 0.5) * 2 * 0.75 * sizeScale;
// 贴图：`selectSprite` 那条公式，frac = d/最大距离，r4 = rand(4)
const spriteOf = (frac: number, r4: number) => 7 - Math.floor((clamp(Math.floor(frac * 8 + r4), 0, 7) * 7) / 8);

// ---------- (a) 直吹风道 ----------
export type 直吹参数 = {
  种子: number;
  时刻: number; // 剧情秒
  风口: V3; // 出风口那一面的中心（d = 0）
  方向: V3; // 风向（不必是单位向量）
  转速: number | ((t: number) => number); // rpm；函数时按剧情秒取（升速、停转）
  最大距离?: number | ((t: number) => number); // 不给就按 风道长度(转速)
  密度?: number; // 每刻出生几个，游戏 0.5；参考视频要看得清，可以加密
  散布?: number; // 出生时横向偏 ±散布（游戏 0.25）。顺风向的偏移照游戏 ±0.25，另给 出生距离 时按它
  // 出生时离出风口多远（顺风向，格）[近, 远]。不给 = 游戏的 [−0.25, 0.25]：一半生在风扇方块里，会从半透明风扇虚影里透出来。
  // 6-4-3 风矢给 [0, 0.15]（游戏 0.5 格宽按 0.3 格风扇缩，挪到出风口前，见 镜头/6-4-3/编排.ts）
  出生距离?: [number, number];
  扩张?: number; // 横向偏移随 d 放大：× (1 + 扩张 × d/最大距离)，游戏是 0（直筒）
  大小?: number; // 粒子大小倍数
  透明度?: number; // 乘在 0.25 上（淡入淡出）
  起?: number; // 剧情秒：只在 [起, 止] 里出生；之前出生的照样飞完
  止?: number;
  法向?: V3; // 横向基的参考方向（只影响随机偏移落在哪，不影响样子）
  // 快放：整条风道照原版逐刻推，但一刻只占 1/(20×快放) 剧情秒，任一瞬间的样子和原版一样、只是动得快。不给 = 1。
  // 6-4-3 风矢用（剧情设定：应力转动之力把风吹到原版的几百倍快），见 镜头/6-4-3/几何.ts 的 `windFastForward`
  快放?: number;
  // 末端渐稀：给了就按离出风口的距离随机去掉一部分粒子，从 渐稀×最大距离 起到末端越来越稀、透明度也减半，不到某个长度一齐消失。
  // 原版粒子越近末端越慢、挤成一团，到 最大距离+0.25 一齐移除；这里先按速度抵掉这团堆积再渐稀。去留的随机数每个粒子固定，不闪
  渐稀?: number;
};

export const directBlowDuct = (opts: 直吹参数): AirFlowParticle[] => {
  const { 种子: seed, 时刻: sec, 风口: outlet, 密度: density = airFlowConsts.defaultDensity, 散布: scatter = airFlowConsts.jitter, 扩张: expansion = 0, 大小: sizeScale = 1, 透明度: opacity = 1, 快放: fastForward = 1 } = opts;
  if (density <= 0 || opacity <= 0) return [];
  const rpmAt = typeof opts.转速 === 'function' ? opts.转速 : () => opts.转速 as number;
  const maxDistAt = opts.最大距离 === undefined ? (t: number) => ductLength(rpmAt(t)) : typeof opts.最大距离 === 'function' ? opts.最大距离 : () => opts.最大距离 as number;
  const dir = norm(opts.方向);
  const sideA = perp(dir, opts.法向);
  const sideB = cross(dir, sideA);
  const ticksPerSec = 20 * fastForward;
  const tau = sec * ticksPerSec;
  const lifespan = airFlowConsts.lifeTicks;
  const fadeFrom = opts.渐稀;
  const out: AirFlowParticle[] = [];
  const k0 = Math.floor((tau - lifespan - 1) * density);
  const k1 = Math.ceil(tau * density);
  for (let k = k0; k <= k1; k++) {
    const birthTick = (k + slotRand(seed, k, 0)) / density;
    const age = tau - birthTick;
    if (age < 0 || age >= lifespan) continue;
    const tb = birthTick / ticksPerSec;
    if ((opts.起 !== undefined && tb < opts.起) || (opts.止 !== undefined && tb > opts.止)) continue;
    if (rpmAt(tb) === 0) continue;
    const [nearDist, farDist] = opts.出生距离 ?? [-airFlowConsts.jitter, airFlowConsts.jitter];
    let dist = nearDist + slotRand(seed, k, 1) * (farDist - nearDist);
    const wholeTicks = Math.floor(age);
    let dead = false;
    let dNext = dist;
    let Mn = 1;
    for (let j = 0; j <= wholeTicks; j++) {
      const Mj = maxDistAt((birthTick + j) / ticksPerSec);
      if (Mj < 0.25 || dist > Mj + 0.25 || dist < -0.25) {
        dead = true;
        break;
      }
      const step = 0.0625 * (Mj - dist + 1);
      if (j === wholeTicks) {
        dNext = dist + step;
        Mn = Mj;
        break;
      }
      dist += step;
    }
    if (dead) continue;
    const dd = dist + (dNext - dist) * (age - wholeTicks);
    let alpha = airFlowConsts.opacity * opacity;
    if (fadeFrom !== undefined) {
      const fade = 1 - smooth01((dd - fadeFrom * Mn) / (Mn + 0.25 - fadeFrom * Mn));
      if (slotRand(seed, k, 5) >= clamp((Mn + 1 - dd) / (Mn + 1), 0, 1) * fade) continue;
      alpha *= 0.5 + 0.5 * fade;
    }
    const spread = 1 + (expansion * dd) / Mn;
    const ju = (slotRand(seed, k, 2) * 2 - 1) * scatter * spread;
    const jv = (slotRand(seed, k, 3) * 2 - 1) * scatter * spread;
    out.push({
      p: add(add(add(outlet, mul(dir, dd)), mul(sideA, ju)), mul(sideB, jv)),
      贴图: spriteOf(dist / Mn, Math.floor(slotRand(seed, k, 100 + wholeTicks) * 4)),
      half: halfOf(slotRand(seed, k, 4), sizeScale),
      alpha,
    });
  }
  return out;
};

// 散花风道：6-4-3a、7-1-5、7-4-1 弓前风扇虚影吹出的风道，细的芯 + 往外散开的一大团花，横截面按风扇边长缩。
// 用户 10-18 定：都照 6-4-3a「哄」那一帧（原来只在那 0.05 秒加的一团）的散花样子，末端越往外越稀
export const 散花风道 = (opts: Omit<直吹参数, '密度' | '散布' | '扩张' | '大小' | '渐稀'> & { 边长: number }): AirFlowParticle[] => {
  const { 边长: side, ...rest } = opts;
  return [
    ...directBlowDuct({ ...rest, 密度: 15, 散布: 0.45 * side, 扩张: 0.6, 大小: 0.65, 渐稀: 0.3 }),
    ...directBlowDuct({ ...rest, 种子: rest.种子 + 1, 密度: 40, 散布: 0.9 * side, 扩张: 1.6, 大小: 0.75, 渐稀: 0.3 }),
  ];
};

// ---------- (b) 回旋 ----------
export type SwirlParams = {
  seed: number;
  sec: number; // 剧情秒
  path: V3[]; // 折线：从起点到汇聚点（比如 腰 → 胸 → 肩 → 肘 → 手 → 弓），至少两点；每帧可以重给（人在动）
  radius: AlongPath; // 螺旋半径（米）
  turnsPerSec: AlongPath; // 每秒绕几圈（正 = 顺着前进方向看逆时针）
  speed: AlongPath; // 沿路径前进的速度（米/剧情秒）
  density?: number; // 每刻出生几个
  scatter?: number; // 半径上加的随机 ±（米）
  convergeLen?: number; // 最后多少米半径收到 0（汇到终点）；默认 0.3
  smooth?: boolean; // 折线拐角用向心 Catmull–Rom 修圆（默认开），螺旋过拐角不跳
  sizeScale?: number;
  opacity?: number;
  start?: number;
  end?: number;
  normal?: V3; // 起点处螺旋的 0° 方向参考（默认场景 +Z），之后沿路平行移动，不会突然翻转
};

type PreparedPath = { P: V3[]; T: V3[]; N: V3[]; S: number[]; totalLen: number; vertexFracs: number[] };
// 路径预处理：（可选）修圆、按弧长打点，算每点的切向和平行移动的法向；`vertexFracs` 是原折线各顶点在弧长上的比例
const preparePath = (pts: V3[], smooth: boolean, ref?: V3): PreparedPath => {
  const segLen = pts.slice(1).map((p, i) => len(sub(p, pts[i])));
  const total0 = segLen.reduce((a, b) => a + b, 0) || 1;
  const vertexFracs = [0];
  segLen.forEach((l) => vertexFracs.push(vertexFracs[vertexFracs.length - 1] + l / total0));
  let points: V3[];
  if (smooth && pts.length > 2) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const sampleCount = Math.max(8, Math.ceil(total0 / 0.04));
    points = curve.getSpacedPoints(sampleCount).map((q) => [q.x, q.y, q.z] as V3);
  } else points = pts.map((p) => [...p] as V3);
  const arcLens = [0];
  for (let i = 1; i < points.length; i++) arcLens.push(arcLens[i - 1] + len(sub(points[i], points[i - 1])));
  const tangents: V3[] = points.map((_, i) => norm(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)])));
  const normals: V3[] = [perp(tangents[0], ref)];
  for (let i = 1; i < points.length; i++) {
    const ax = cross(tangents[i - 1], tangents[i]);
    const axisLen = len(ax);
    const rotNormal = axisLen < 1e-8 ? normals[i - 1] : rotate(normals[i - 1], mul(ax, 1 / axisLen), Math.atan2(axisLen, dot(tangents[i - 1], tangents[i])));
    normals.push(norm(sub(rotNormal, mul(tangents[i], dot(rotNormal, tangents[i])))));
  }
  return { P: points, T: tangents, N: normals, S: arcLens, totalLen: arcLens[arcLens.length - 1] || 1e-6, vertexFracs };
};
const sampleAlong = (value: AlongPath, pathFrac: number, t: number, fracs: number[]): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'function') return value(pathFrac, t);
  if (value.length === 1 || pathFrac <= 0) return value[0];
  for (let i = 1; i < value.length; i++) {
    if (pathFrac <= fracs[i]) {
      const segStart = fracs[i - 1];
      const segFrac = fracs[i] > segStart ? (pathFrac - segStart) / (fracs[i] - segStart) : 1;
      return value[i - 1] + (value[i] - value[i - 1]) * segFrac;
    }
  }
  return value[value.length - 1];
};
const pointOnPath = (path: PreparedPath, arcLen: number) => {
  const { S: arcLens, P: points, T: tangents, N: normals } = path;
  let lo = 0;
  let hi = arcLens.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arcLens[mid] <= arcLen) lo = mid;
    else hi = mid;
  }
  const frac = arcLens[hi] > arcLens[lo] ? clamp((arcLen - arcLens[lo]) / (arcLens[hi] - arcLens[lo]), 0, 1) : 0;
  const lerp = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
  const t = norm(lerp(tangents[lo], tangents[hi]));
  const normal = norm(sub(lerp(normals[lo], normals[hi]), mul(t, dot(lerp(normals[lo], normals[hi]), t))));
  return { p: lerp(points[lo], points[hi]), t, n: normal, b: cross(t, normal) };
};

export const swirl = (opts: SwirlParams): AirFlowParticle[] => {
  const { seed: seed, sec: sec, density: density = 4, scatter: scatter = 0.08, convergeLen = 0.3, smooth: smooth = true, sizeScale: sizeScale = 1, opacity: opacity = 1 } = opts;
  if (opts.path.length < 2 || density <= 0 || opacity <= 0) return [];
  const path = preparePath(opts.path, smooth, opts.normal);
  const Ltot = path.totalLen;
  const fracs = path.vertexFracs;
  const tau = sec * 20;
  // 最长寿命：按路上最慢的速度走完全程（采样估计），封顶 600 刻
  let vmin = Infinity;
  for (let i = 0; i <= 16; i++) vmin = Math.min(vmin, sampleAlong(opts.speed, i / 16, sec, fracs));
  const life = Math.min(600, Math.ceil((Ltot / Math.max(vmin, 1e-3)) * 20) + 2);
  const out: AirFlowParticle[] = [];
  const k0 = Math.floor((tau - life) * density);
  const k1 = Math.ceil(tau * density);
  for (let k = k0; k <= k1; k++) {
    const birthTick = (k + slotRand(seed, k, 0)) / density;
    const age = tau - birthTick;
    if (age < 0 || age >= life) continue;
    const tb = birthTick / 20;
    if ((opts.start !== undefined && tb < opts.start) || (opts.end !== undefined && tb > opts.end)) continue;
    let arcLen = slotRand(seed, k, 1) * 0.05 * Ltot;
    let th = slotRand(seed, k, 2) * Math.PI * 2;
    const wholeTicks = Math.floor(age);
    let ds = 0;
    let dth = 0;
    let done = false;
    for (let j = 0; j <= wholeTicks; j++) {
      const t = (birthTick + j) / 20;
      const sf = arcLen / Ltot;
      ds = sampleAlong(opts.speed, sf, t, fracs) / 20;
      dth = (sampleAlong(opts.turnsPerSec, sf, t, fracs) * Math.PI * 2) / 20;
      if (j === wholeTicks) break;
      arcLen += ds;
      th += dth;
      if (arcLen >= Ltot) {
        done = true;
        break;
      }
    }
    if (done) continue;
    const tickFrac = age - wholeTicks;
    arcLen += ds * tickFrac;
    th += dth * tickFrac;
    if (arcLen >= Ltot) continue;
    const sf = arcLen / Ltot;
    const onPath = pointOnPath(path, arcLen);
    const rad0 = Math.max(0, sampleAlong(opts.radius, sf, sec, fracs) + (slotRand(seed, k, 3) * 2 - 1) * scatter);
    const taper = convergeLen > 0 ? clamp((Ltot - arcLen) / convergeLen, 0, 1) : 1;
    const rr = rad0 * taper * taper * (3 - 2 * taper);
    const off = add(mul(onPath.n, Math.cos(th) * rr), mul(onPath.b, Math.sin(th) * rr));
    out.push({
      p: add(onPath.p, off),
      贴图: spriteOf(sf, Math.floor(slotRand(seed, k, 100 + wholeTicks) * 4)),
      half: halfOf(slotRand(seed, k, 4), sizeScale),
      alpha: airFlowConsts.opacity * opacity,
    });
  }
  return out;
};

// ---------- 画 ----------
// generic_0～7 竖着拼成一张 8×64 的图，第 i 张占 V 的 [i/8, (i+1)/8]。第一次画时才拼（node 里跑诊断时用不到贴图）
let genAtlasCache: THREE.DataTexture | null = null;
const genAtlas = () => {
  if (!genAtlasCache) {
    const width = GENERIC.generic_0.w;
    const px = new Uint8Array(width * width * 8 * 4);
    for (let i = 0; i < 8; i++) px.set(GENERIC[`generic_${i}`].px, i * width * width * 4);
    genAtlasCache = particleTexture(px, width, width * 8);
  }
  return genAtlasCache;
};

// 半透明、不写深度：几百上千个斑点叠在一起，写深度的话后画的被先画的挡掉。alpha 阈值放低，淡入时不被丢掉
export const AirFlowQuads: React.FC<{ items: AirFlowParticle[]; color?: [number, number, number] }> = ({ items, color: color = airFlowConsts.color }) => {
  const list: Particle[] = items.map((q) => ({ p: q.p, half: q.half, uv: [0, q.贴图 / 8, 1, (q.贴图 + 1) / 8], color, alpha: q.alpha }));
  return <ParticleQuads tex={genAtlas()} items={list} translucent depthWrite={false} alphaTest={0.004} />;
};
