// 尘云：Goety 的 DustCloudParticle（粒子定义 dust_cloud.json 用 cult_spell_0～7）。乙组几个破土的法术用。
// 半边长 = 选项里的 scale（格），半透明，出生 alpha 0.9、每刻 −0.015；寿命 8 ÷ (随机 × 0.8 + 0.2) 刻；贴图按年龄走；
// 速度就是给的（服务端 count 0、speed 0 时是 0），每刻只有 ±1/5000 的水平抖动和 3e-6 的下沉，这里当不动。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { Vec3 } from '../接口.ts';
import type { RgbColor } from './材质.ts';
import { TexturedParticles, type ParticleBirth, type ParticleClass } from './粒子.tsx';
import cultSpell0Png from 'asset:贴图/法术/goety/particle/cult_spell_0';
import cultSpell1Png from 'asset:贴图/法术/goety/particle/cult_spell_1';
import cultSpell2Png from 'asset:贴图/法术/goety/particle/cult_spell_2';
import cultSpell3Png from 'asset:贴图/法术/goety/particle/cult_spell_3';
import cultSpell4Png from 'asset:贴图/法术/goety/particle/cult_spell_4';
import cultSpell5Png from 'asset:贴图/法术/goety/particle/cult_spell_5';
import cultSpell6Png from 'asset:贴图/法术/goety/particle/cult_spell_6';
import cultSpell7Png from 'asset:贴图/法术/goety/particle/cult_spell_7';

const particleType: ParticleClass = { 帧: [cultSpell0Png, cultSpell1Png, cultSpell2Png, cultSpell3Png, cultSpell4Png, cultSpell5Png, cultSpell6Png, cultSpell7Png].map(png), 选帧: '按年龄', 混合: '半透明', opacity: (age) => Math.max(0, 0.9 - 0.015 * age) };

/** 一批尘云的出生表：位们 每处一颗 */
export const dustCloudSpawns = (positions: readonly Vec3[], tick: number, size: number, color: RgbColor, seed: number): ParticleBirth[] =>
  positions.map((pos, i) => ({ 刻: tick, 位: pos, 寿命: Math.floor(8 / (rng(seed * 71 + i)() * 0.8 + 0.2)), radius: size, 色: color, 种子: i }));

export const DustCloud: React.FC<{ spawns: readonly ParticleBirth[]; 秒: number }> = ({ spawns, 秒: sec }) => <TexturedParticles 类={particleType} spawns={spawns} 秒={sec} />;
