// 气流：机械动力（Create 6.0.8）鼓风机吹出的 `AirFlowParticle`。6-4-3 风矢、6-4-3a 思索用直吹风道。
// 数值照 create-1.20.1-6.0.8.jar 字节码（`AirFlowParticle`、`AirCurrent.tick`、`IAirCurrentSource.getMaxDistance`、`CKinetics`）：
// 出生：每刻以 fanParticleDensity（0.5）概率在风扇中心+风向×0.5 放一个，各轴再偏 ±0.25；颜色 0xEEEEEE、透明度 0.25 不变、半边长 0.075～0.15、寿命 40 刻。
// 运动：d = 离出风口距离，速度 = 风向×0.0625×(最大距离−d+1) 格/刻；d<−0.25、出风道或到寿命就移除；最大距离 = lerp(min(|rpm|/256,1), 3, 20)。
// 贴图（`selectSprite`）：i = clamp(d/最大距离×8 + rand(4), 0, 7)，取 `SpriteSet.get(i, 8)`，列表是 generic_7…0，所以 generic_0 取不到。
// 纯函数：第 k 个出生槽的时刻和随机量都由 hash(种子, k, …) 给出，不存逐帧状态，乱序出帧结果一致。时间一律用剧情秒（慢放只缩时钟）。
// 粒子要跟着风扇走就在风扇本地坐标系里算、外面套 group；风扇不动直接用场景坐标。
// 接口：`directBlowDuct`(直吹参数)、`scatterDuct`（弓前风扇虚影用的两层预设）→ `AirFlowParticle`[]；<`AirFlowQuads` items=… /> 绘制（对数深度，屏幕AO 第 3 遍半透明）；`ductLength`(rpm)。
// 例：const ps = 直吹风道({ 种子: 3, 时刻: T, 风口: [0, 0.5, 0], 方向: [0, 1, 0], 转速: 256, 密度: 15 });
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { hash2 } from '../../engine/core/噪声.ts';
import { pngDir } from '../../engine/model/贴图.ts';
import { type Particle, particleTexture, ParticleQuads } from './粒子面片.tsx';
import { assetDir } from '../../engine/core/资产目录.ts';
import generic0Png from 'asset:贴图/特效/粒子/generic_0';
import generic1Png from 'asset:贴图/特效/粒子/generic_1';
import generic2Png from 'asset:贴图/特效/粒子/generic_2';
import generic3Png from 'asset:贴图/特效/粒子/generic_3';
import generic4Png from 'asset:贴图/特效/粒子/generic_4';
import generic5Png from 'asset:贴图/特效/粒子/generic_5';
import generic6Png from 'asset:贴图/特效/粒子/generic_6';
import generic7Png from 'asset:贴图/特效/粒子/generic_7';
import { clamp, smoothstep01 } from '../../engine/core/数学.ts';

const GENERIC = pngDir(assetDir({ './generic_0.png': generic0Png, './generic_1.png': generic1Png, './generic_2.png': generic2Png, './generic_3.png': generic3Png, './generic_4.png': generic4Png, './generic_5.png': generic5Png, './generic_6.png': generic6Png, './generic_7.png': generic7Png }));

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

// ---------- 小工具 ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const perp = (axis: V3, ref: V3 = [0, 0, 1]): V3 => {
  let normal = sub(ref, mul(axis, dot(ref, axis)));
  if (len(normal) < 1e-4) normal = sub([1, 0, 0], mul(axis, axis[0]));
  return norm(normal);
};
// 随机数：种子、槽号、第几个量 → 0～1
const slotRand = (seed: number, k: number, ch: number) => hash2(seed * 7919 + ch, k, ch);
// 粒子半边长：0.1×(0.5~1)×2×0.75
const halfOf = (r: number, sizeScale: number) => 0.1 * (r * 0.5 + 0.5) * 2 * 0.75 * sizeScale;
// 贴图：`selectSprite` 那条公式，frac = d/最大距离，r4 = rand(4)
const spriteOf = (frac: number, r4: number) => 7 - Math.floor((clamp(Math.floor(frac * 8 + r4), 0, 7) * 7) / 8);

// ---------- (a) 直吹风道 ----------
export type DirectBlowParams = {
  种子: number;
  storyTime: number; // 剧情秒
  outlet: V3; // 出风口那一面的中心（d = 0）
  windDir: V3; // 风向（不必是单位向量）
  rotSpeedRpm: number | ((t: number) => number); // rpm；函数时按剧情秒取（升速、停转）
  maxDist?: number | ((t: number) => number); // 不给就按 风道长度(转速)
  density?: number; // 每刻出生几个，游戏 0.5；参考视频要看得清，可以加密
  spread?: number; // 出生时横向偏 ±散布（游戏 0.25）。顺风向的偏移照游戏 ±0.25，另给 出生距离 时按它
  // 出生时离出风口多远（顺风向，格）[近, 远]。不给 = 游戏的 [−0.25, 0.25]：一半生在风扇方块里，会从半透明风扇虚影里透出来。
  // 6-4-3 风矢给 [0, 0.15]（游戏 0.5 格宽按 0.3 格风扇缩，挪到出风口前，见 镜头/6-4-3/编排.ts）
  spawnDist?: [number, number];
  expansion?: number; // 横向偏移随 d 放大：× (1 + 扩张 × d/最大距离)，游戏是 0（直筒）
  大小?: number; // 粒子大小倍数
  opacity?: number; // 乘在 0.25 上（淡入淡出）
  起?: number; // 剧情秒：只在 [起, 止] 里出生；之前出生的照样飞完
  止?: number;
  normal?: V3; // 横向基的参考方向（只影响随机偏移落在哪，不影响样子）
  // 快放：整条风道照原版逐刻推，但一刻只占 1/(20×快放) 剧情秒，任一瞬间的样子和原版一样、只是动得快。不给 = 1。
  // 6-4-3 风矢用（剧情设定：应力转动之力把风吹到原版的几百倍快），见 镜头/6-4-3/几何.ts 的 `windFastForward`
  fastForward?: number;
  // 末端渐稀：给了就按离出风口的距离随机去掉一部分粒子，从 渐稀×最大距离 起到末端越来越稀、透明度也减半，不到某个长度一齐消失。
  // 原版粒子越近末端越慢、挤成一团，到 最大距离+0.25 一齐移除；这里先按速度抵掉这团堆积再渐稀。去留的随机数每个粒子固定，不闪
  fadeThin?: number;
};

export const directBlowDuct = (opts: DirectBlowParams): AirFlowParticle[] => {
  const { 种子: seed, storyTime: sec, outlet: outlet, density: density = airFlowConsts.defaultDensity, spread: scatter = airFlowConsts.jitter, expansion: expansion = 0, 大小: sizeScale = 1, opacity: opacity = 1, fastForward: fastForward = 1 } = opts;
  if (density <= 0 || opacity <= 0) return [];
  const rpmAt = typeof opts.rotSpeedRpm === 'function' ? opts.rotSpeedRpm : () => opts.rotSpeedRpm as number;
  const maxDistAt = opts.maxDist === undefined ? (t: number) => ductLength(rpmAt(t)) : typeof opts.maxDist === 'function' ? opts.maxDist : () => opts.maxDist as number;
  const dir = norm(opts.windDir);
  const sideA = perp(dir, opts.normal);
  const sideB = cross(dir, sideA);
  const ticksPerSec = 20 * fastForward;
  const tau = sec * ticksPerSec;
  const lifespan = airFlowConsts.lifeTicks;
  const fadeFrom = opts.fadeThin;
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
    const [nearDist, farDist] = opts.spawnDist ?? [-airFlowConsts.jitter, airFlowConsts.jitter];
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
      const fade = 1 - smoothstep01((dd - fadeFrom * Mn) / (Mn + 0.25 - fadeFrom * Mn));
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
export const scatterDuct = (opts: Omit<DirectBlowParams, 'density' | 'spread' | 'expansion' | '大小' | 'fadeThin'> & { sideLength: number }): AirFlowParticle[] => {
  const { sideLength: side, ...rest } = opts;
  return [
    ...directBlowDuct({ ...rest, density: 15, spread: 0.45 * side, expansion: 0.6, 大小: 0.65, fadeThin: 0.3 }),
    ...directBlowDuct({ ...rest, 种子: rest.种子 + 1, density: 40, spread: 0.9 * side, expansion: 1.6, 大小: 0.75, fadeThin: 0.3 }),
  ];
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
