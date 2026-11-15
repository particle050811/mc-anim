// 唤魔者尖牙：Goety 的 Fangs（照抄原版 EvokerFangs）、FangsRenderer、原版 EvokerFangsModel（1.20.1）。撕咬、尖牙盛宴共用。
// - 时序：出生后等 warmup 刻，下一刻开咬（客户端收到事件 4）；开咬后动画进度 22 刻里前 20 刻从 0 走到 1，最后 2 刻停在 1 然后消失；
//   开咬第 8 刻结算伤害，同一刻冒 12 颗暴击星（CRIT）。
// - 渲染器：mulPose(Y 90° − yRot)，scale(−f1, −f1, f1)（f1 = 2，进度过 0.9 后线性缩到 0），translate(0, −0.626, 0)，scale(0.5)。
// - 模型原版没走「亚波伦法术模型」配方（那个配方只导模组类），三个方盒照 EvokerFangsModel.createBodyLayer 抄在这里；
//   setupAnim：上下颚 zRot = π ∓ (1 − min(1, 2 × 进度)³) × 0.35π，整体抬高 (进度 + sin(进度 × 2.7)) × 0.6 × 12 像素。
// - CritParticle：重力 0.5、摩擦 0.7；初速 = 父类随机速度 × 0.1 + 给的 × 0.4；灰度 0.6～0.9，绿每刻 × 0.96、蓝 × 0.9；
//   半边长 0.1 × (0.5～1) × 0.75，出生后 1/32 寿命内长满；寿命 max(1, 6 ÷ (随机 × 0.8 + 0.6))。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { MinecraftSpace, degToRad, ModelPart, type EntityModelData } from './实体.tsx';
import { vanillaParticleInitSpeed, TexturedParticles, type ParticleBirth, type ParticleClass } from './粒子.tsx';
import evokerFangsPng from 'asset:贴图/法术/minecraft/entity/illager/evoker_fangs';
import criticalHitPng from 'asset:贴图/特效/粒子/critical_hit';
import { mulberry32 } from '@engine/core/数学.ts';

const cube = (uv: [number, number], size: [number, number, number]) => ({ uv, from: [0, 0, 0], size, grow: [0, 0, 0], mirror: false });
const fangModel = {
  texSize: [64, 32],
  root: {
    name: 'root',
    pose: { offset: [0, 0, 0], rot: [0, 0, 0] },
    cubes: [],
    children: [
      { name: 'base', pose: { offset: [-5, 24, -5], rot: [0, 0, 0] }, cubes: [cube([0, 0], [10, 12, 10])], children: [] },
      { name: 'upper_jaw', pose: { offset: [1.5, 24, -4], rot: [0, 0, 2.042035] }, cubes: [cube([40, 0], [4, 14, 8])], children: [] },
      { name: 'lower_jaw', pose: { offset: [-1.5, 24, 4], rot: [0, Math.PI, 4.2411504] }, cubes: [cube([40, 0], [4, 14, 8])], children: [] },
    ],
  },
} as unknown as EntityModelData;
const image = png(evokerFangsPng);

export const fangBiteTick = (warmup: number) => warmup + 1;
export const fangLifeTicks = 22;
export const fangDamageTicks = 8;

/** 一颗尖牙。刻 = 这颗牙出生后的刻；朝角 = 构造函数收的 pYRot（弧度，游戏水平角） */
export const Fang: React.FC<{ 位: Vec3; facingAngle: number; warmup: number; 刻: number }> = ({ 位: pos, facingAngle, warmup, 刻: tick }) => {
  const a = tick - fangBiteTick(warmup);
  if (a <= 0 || a >= fangLifeTicks) return null;
  const progress = Math.min(1, a / 20);
  const f1 = 2 * (progress > 0.9 ? (1 - progress) / 0.1 : 1);
  if (f1 <= 0) return null;
  const jawOpen = 1 - Math.min(1, progress * 2) ** 3;
  const y = 24 - (progress + Math.sin(progress * 2.7)) * 0.6 * 12;
  const partPoses = {
    base: { offset: [-5, y, -5] },
    upper_jaw: { offset: [1.5, y, -4], rot: [0, 0, Math.PI - jawOpen * 0.35 * Math.PI] },
    lower_jaw: { offset: [-1.5, y, 4], rot: [0, Math.PI, Math.PI + jawOpen * 0.35 * Math.PI] },
  };
  return (
    <MinecraftSpace 位={pos}>
      <group rotation={[0, degToRad(90 - (facingAngle * 180) / Math.PI), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.626, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <ModelPart 模型={fangModel} 图={image} partPoses={partPoses} />
            </group>
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

const critClass: ParticleClass = { 帧: [png(criticalHitPng)], 选帧: '随机', 重力: 0.5, 摩擦: 0.7, 混合: '镂空', 大小: (age, lifetime) => Math.min(1, Math.max(0, (age / lifetime) * 32)) };

/** 一颗牙咬合时冒的 12 颗暴击星的出生表。刻 = 这颗牙出生后的刻（定颜色用） */
export const fangCritSpawns = (pos: Vec3, warmup: number, tick: number, seed: number): ParticleBirth[] => {
  const spawnTick = fangBiteTick(warmup) + fangDamageTicks;
  if (tick < spawnTick) return [];
  const age = Math.floor(tick - spawnTick);
  return Array.from({ length: 12 }, (_, i) => {
    const r = mulberry32(seed * 977 + i);
    const position: Vec3 = [pos[0] + (r() * 2 - 1) * 0.25, pos[1] + (r() * 2 - 1) * 0.25, pos[2] + 1.05 + r()];
    const baseOffset = [(r() * 2 - 1) * 0.3, 0.3 + r() * 0.3, (r() * 2 - 1) * 0.3] as const;
    const randVel = vanillaParticleInitSpeed(r, 0, 0, 0);
    const v = [randVel[0] * 0.1 + baseOffset[0] * 0.4, randVel[1] * 0.1 + baseOffset[1] * 0.4, randVel[2] * 0.1 + baseOffset[2] * 0.4];
    const grayShade = r() * 0.3 + 0.6;
    return {
      刻: spawnTick,
      位: position,
      速: [v[0]!, -v[2]!, v[1]!] as const,
      寿命: Math.max(1, Math.floor(6 / (r() * 0.8 + 0.6))),
      radius: 0.1 * (r() * 0.5 + 0.5) * 0.75,
      种子: i,
      色: [grayShade, grayShade * 0.96 ** age, grayShade * 0.9 ** age] as const,
    };
  });
};

export const CritStar: React.FC<{ spawns: readonly ParticleBirth[]; 秒: number }> = ({ spawns, 秒: sec }) => <TexturedParticles 类={critClass} spawns={spawns} 秒={sec} />;
