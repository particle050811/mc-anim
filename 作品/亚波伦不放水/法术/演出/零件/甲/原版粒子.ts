// 甲组用到、库里（@库/特效/原版粒子.tsx）还没有的几种原版粒子（1.20.1），照各粒子类的构造函数和 tick() 填成 粒子类 + 出生函数。
// 出处：SnowflakeParticle、PlayerCloudParticle（cloud）、DragonBreathParticle、DripParticle（falling_water），贴图顺序照 particles/<名>.json。
// 位置、速度都是场景坐标（Z 朝上）。r = rng(种子)。
// 和游戏的差别：雪花每刻水平 ×0.95、竖直 ×0.9 的阻尼这里并成一个摩擦 0.93；龙息落地后的贴地滑行、水滴落地溅开没做。
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../../接口.ts';
import { vanillaParticleInitSpeed, type ParticleBirth, type ParticleClass } from '../粒子.tsx';
import g0 from 'asset:贴图/特效/粒子/generic_0';
import g1 from 'asset:贴图/特效/粒子/generic_1';
import g2 from 'asset:贴图/特效/粒子/generic_2';
import g3 from 'asset:贴图/特效/粒子/generic_3';
import g4 from 'asset:贴图/特效/粒子/generic_4';
import g5 from 'asset:贴图/特效/粒子/generic_5';
import g6 from 'asset:贴图/特效/粒子/generic_6';
import g7 from 'asset:贴图/特效/粒子/generic_7';
import dripFallPng from 'asset:贴图/法术/minecraft/particle/drip_fall';

type Rng = () => number;
const generalFrames = [g0, g1, g2, g3, g4, g5, g6, g7].map(png);
const reversedFrames = [...generalFrames].reverse();
/** Particle 基类的 quadSize：0.1 × (随机 × 0.5 + 0.5) × 2 */
const baseRadius = (r: Rng) => 0.1 * (r() * 0.5 + 0.5) * 2;
const growScale = (age: number, lifetime: number) => Math.min(1, Math.max(0, (age / lifetime) * 32));

/** snowflake：重力 0.225，色 (0.923, 0.964, 0.999)，镂空 */
export const snowflakeClass: ParticleClass = { frame: reversedFrames, 选帧: '按年龄', 重力: 0.225, 摩擦: 0.93, blend: '镂空', 色: [0.923, 0.964, 0.999] };
export const snowflake = (r: Rng, tick: number, pos: Vec3, speedVec: Vec3 = [0, 0, 0]): ParticleBirth => ({
  刻: tick,
  位: pos,
  速: [speedVec[0] + (r() * 2 - 1) * 0.05, speedVec[1] + (r() * 2 - 1) * 0.05, speedVec[2] + (r() * 2 - 1) * 0.05],
  radius: 0.1 * (r() * r() + 1),
  寿命: Math.floor(16 / (r() * 0.8 + 0.2)) + 2,
  seed: Math.floor(r() * 1e9),
});

/** cloud（PlayerCloudParticle）：摩擦 0.96，父类随机初速 × 0.1 再加给的速度，灰度 1 − 随机 × 0.3，大小 × 1.875，头 1/32 寿命里长大，半透明 */
export const cloudClass: ParticleClass = { frame: reversedFrames, 选帧: '按年龄', 摩擦: 0.96, blend: '半透明', size: growScale };
export const cloudParticle = (r: Rng, tick: number, pos: Vec3, speedVec: Vec3 = [0, 0, 0]): ParticleBirth => {
  const [vx, vy, vz] = vanillaParticleInitSpeed(r, 0, 0, 0);
  const grayShade = 1 - r() * 0.3;
  return {
    刻: tick,
    位: pos,
    速: [vx * 0.1 + speedVec[0], -vz * 0.1 + speedVec[1], vy * 0.1 + speedVec[2]],
    radius: baseRadius(r) * 1.875,
    寿命: Math.max(1, Math.floor(Math.floor(8 / (r() * 0.8 + 0.3)) * 2.5)),
    色: [grayShade, grayShade, grayShade],
    seed: Math.floor(r() * 1e9),
  };
};

/** dragon_breath：摩擦 0.96，速度 = 给的，紫色（红 0.72～0.87、绿 0、蓝 0.82～0.98），大小 × 0.75，镂空；贴图 generic_5 → 7 */
export const dragonBreathClass: ParticleClass = { frame: [generalFrames[5]!, generalFrames[6]!, generalFrames[7]!], 选帧: '按年龄', 摩擦: 0.96, blend: '镂空', size: growScale };
export const dragonBreath = (r: Rng, tick: number, pos: Vec3, speedVec: Vec3 = [0, 0, 0]): ParticleBirth => ({
  刻: tick,
  位: pos,
  速: speedVec,
  radius: baseRadius(r) * 0.75,
  寿命: Math.floor(20 / (r() * 0.8 + 0.2)),
  色: [0.7176 + r() * 0.1569, 0, 0.8235 + r() * 0.1529],
  seed: Math.floor(r() * 1e9),
});

/** falling_water（DripParticle）：重力 0.06，色 (0.2, 0.3, 1)，不吃给的速度；地面 = 落到这个高度停住 */
export const dripClass = (ground: number): ParticleClass => ({ frame: [png(dripFallPng)], 选帧: '随机', 重力: 0.06, 摩擦: 0.98, ground, blend: '镂空', 色: [0.2, 0.3, 1] });
export const drip = (r: Rng, tick: number, pos: Vec3): ParticleBirth => ({ 刻: tick, 位: pos, radius: baseRadius(r), 寿命: Math.min(40, Math.floor(64 / (r() * 0.8 + 0.2))), seed: Math.floor(r() * 1e9) });
