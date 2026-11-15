// 灵魂束（样板：弹道类）。出处 goety 2.5.60.6：SoulBoltSpell、SoulBolt、SpellHurtingProjectile、SoulBoltRenderer、SoulBoltModel、AdditiveSpellParticle。
// - 弹：SoulBoltModel（一个 4×4×4 的头加 4×4×6 的尾），渲染器 scale(−1.25, −1.25, 1.25)，bolt 部件 yRot = 实体 yaw、xRot = 实体 pitch；
//   entityTranslucentEmissive、满亮度、alpha 0.5；贴图 soul_bolt_1～3 每刻换一张。
// - 朝向（WaterHurtingProjectile.travel → ProjectileUtil.rotateTowardsMovement(this, 0.2)）：出生时 yaw、pitch 都是 0，第 2 刻起每刻往飞行方向靠 20%，
//   所以头半秒弹身是歪着慢慢摆正的（第 10 刻摆正 87%）。
// - 尾迹（renderTrail）：从弹心到 8 刻前的弹心拉一张竖着的四边形，上下各 0.25 格，色 0xDAFDFF、alpha 0.6，贴图 trail.png 的 u 每刻滚 1/8、一次取半张。
//   弹心 = 实体位置 + 高度的一半（实体 0.3125 格见方）；头 8 刻里「8 刻前」取出生位置。
// - 命中（onHit）：32 个 bullet_effect 粒子（AdditiveSpellParticle，加色），出生在弹位置 + 各轴 0～1 格的随机处；sendParticles 数量给的 0，速度是 (0.45, 0.45, 0.45) × 0.5。
// - 飞行粒子（SoulBolt.tick 客户端每刻一颗）：summon_trail（SummonTrailParticle，普通贴图粒子，半透明、满亮度），出生在 弹位置 − 速度，
//   水平两轴各偏 随机(0～1) ÷ 4 × {−1, 0, 1}，竖直 +0.15；不动，寿命 8 刻，summon_0～3 按年龄换，大小 = 基础 × 0.75 × 1.5，出生后很快长满。
// 没做：配下界魔杖加下界套装时换 WitherBolt（片里默认只算法杖，不换）；弹在水里的气泡。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, sub, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { Band } from '../零件/束.tsx';
import { hexColor } from '../零件/材质.ts';
import { vanillaParticleInitSpeed, TexturedParticles, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import meta, { soulBeamHitTick, soulBeamPath } from './灵魂束.元.ts';
import soulBoltModelData from 'asset:模型/法术/goety/SoulBoltModel';
import soulBolt1Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_1';
import soulBolt2Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_2';
import soulBolt3Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_3';
import trailPng from 'asset:贴图/法术/goety/entity/projectiles/trail';
import bulletEffect1Png from 'asset:贴图/法术/goety/particle/bullet_effect1';
import bulletEffect2Png from 'asset:贴图/法术/goety/particle/bullet_effect2';
import bulletEffect3Png from 'asset:贴图/法术/goety/particle/bullet_effect3';
import bulletEffect4Png from 'asset:贴图/法术/goety/particle/bullet_effect4';
import bulletEffect5Png from 'asset:贴图/法术/goety/particle/bullet_effect5';
import bulletEffect6Png from 'asset:贴图/法术/goety/particle/bullet_effect6';
import bulletEffect7Png from 'asset:贴图/法术/goety/particle/bullet_effect7';
import summonTrail0Png from 'asset:贴图/法术/goety/particle/summon_0';
import summonTrail1Png from 'asset:贴图/法术/goety/particle/summon_1';
import summonTrail2Png from 'asset:贴图/法术/goety/particle/summon_2';
import summonTrail3Png from 'asset:贴图/法术/goety/particle/summon_3';
import { mulberry32 } from '@engine/core/数学.ts';

const soulBoltModel = getModel(soulBoltModelData, 'SoulBoltModel');
const projectileFrames = [soulBolt1Png, soulBolt2Png, soulBolt3Png].map(png);
const trailColor = hexColor(0xdafdff);
const entityHeight = 0.3125;

// AdditiveSpellParticle（AlphaProvider：alpha 恒 1）：摩擦 0.96、重力 −0.1（往上飘），贴图按年龄换；bullet_effect.json 的顺序是 7 → 1
const hitParticleClass: ParticleClass = { 帧: [bulletEffect7Png, bulletEffect6Png, bulletEffect5Png, bulletEffect4Png, bulletEffect3Png, bulletEffect2Png, bulletEffect1Png].map(png), 选帧: '按年龄', 摩擦: 0.96, 重力: -0.1, 混合: '加色' };

const hitParticles = (pos: Vec3, tick: number, seed: number): ParticleBirth[] => {
  const r = mulberry32(seed);
  return Array.from({ length: 32 }, (_, i) => {
    const spawnPos: Vec3 = [pos[0] + r(), pos[1] + r(), pos[2] + r()];
    // 构造函数：super(…, 0.5 − 随机, yd, 0.5 − 随机) 过父类的随机化，再 yd × 0.2（给的 xd、zd 不是 0，水平不缩）。原版粒子初速 进出都是游戏坐标（y 竖直）
    const [vx, vy, vz] = vanillaParticleInitSpeed(r, 0.5 - r(), 0.225, 0.5 - r());
    return { 刻: tick, 位: spawnPos, 速: [vx, -vz, vy * 0.2], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), radius: 0.1 * (r() * 0.5 + 0.5) * 2 * 0.75, 种子: seed + i };
  });
};

// SummonTrailParticle：getQuadSize = 大小 × clamp(年龄 ÷ 寿命 × 32, 0, 1)
const flightParticleClass: ParticleClass = { 帧: [summonTrail0Png, summonTrail1Png, summonTrail2Png, summonTrail3Png].map(png), 选帧: '按年龄', 摩擦: 0.96, 混合: '半透明', 大小: (age, lifetime) => Math.min(1, Math.max(0, (age / lifetime) * 32)) };

/** 第 1 刻到命中前，每刻在弹后面留一颗 */
const flightParticles = (trajectory: (n: number) => Vec3, hitTick: number, seed: number): ParticleBirth[] =>
  Array.from({ length: Math.max(0, Math.ceil(hitTick) - 1) }, (_, i) => {
    const n = i + 1;
    const r = mulberry32(seed * 977 + n);
    const randomOffset = () => (r() / 4) * (Math.floor(r() * 3) - 1);
    // 位置 − 速度：tick 里 travel 已经把速度更新成下一刻要走的那段
    const prevPoint = sub(trajectoryPos(trajectory, n), sub(trajectoryPos(trajectory, n + 1), trajectoryPos(trajectory, n)));
    return { 刻: n, 位: [prevPoint[0] + randomOffset(), prevPoint[1] + randomOffset(), prevPoint[2] + 0.15], 寿命: 8, radius: 0.1 * (r() * 0.5 + 0.5) * 2 * 0.75 * 1.5, 种子: seed + n };
  });

const wrapAngle = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** rotateTowardsMovement(0.2)：从 0 出发，第 2 刻起每刻靠近目标角 20%；刻与刻之间线性插值（渲染器 rotLerp） */
const straighten = (targetAngle: number, tick: number) => {
  const angleDiff = wrapAngle(-targetAngle);
  const angleAt = (n: number) => targetAngle + angleDiff * 0.8 ** Math.max(0, n - 1);
  const n = Math.floor(tick);
  return angleAt(n) + (angleAt(n + 1) - angleAt(n)) * (tick - n);
};

const SoulBeam: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const trajectory = soulBeamPath(from, target, options?.highSpeed);
  const hitTick = soulBeamHitTick(from, target, options?.highSpeed);
  const hitPos = trajectoryPos(trajectory, hitTick);
  const centerAt = (t: number): Vec3 => addVec(trajectoryPos(trajectory, t), [0, 0, entityHeight / 2]);
  // 飞行方向不变（加速方向固定），取稳态的方向当目标角
  const dir = trajectoryDir(trajectory, Math.max(tick, 2));
  // ProjectileUtil.rotateTowardsMovement：yaw = atan2(vz, vx) + 90°，pitch = atan2(水平, vy) − 90°（游戏坐标：vy 竖直，vz = −场景 y）
  const yaw = straighten((Math.atan2(-dir[1], dir[0]) * 180) / Math.PI + 90, tick);
  const pitch = straighten((Math.atan2(Math.hypot(dir[0], dir[1]), dir[2]) * 180) / Math.PI - 90, tick);
  const u = (Math.floor(tick) % 8) / 8;
  return (
    <>
      {tick < hitTick && (
        <>
          <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
            <group scale={[-1.25, -1.25, 1.25]}>
              <ModelPart 模型={soulBoltModel} 图={projectileFrames[Math.floor(tick) % 3]!} 画法="发光" opacity={0.5} partPoses={{ bolt: { rot: [degToRad(pitch), degToRad(yaw), 0] } }} />
            </group>
          </MinecraftSpace>
          <Band points={[centerAt(tick), centerAt(tick - 8)]} halfWidthDir={[0, 0, 0.25]} 图={png(trailPng)} uValues={[u, u + 0.5]} repeat 色={trailColor} opacity={0.6} 混合="半透明" />
        </>
      )}
      <TexturedParticles 类={flightParticleClass} spawns={flightParticles(trajectory, hitTick, seed)} 秒={sec} />
      <TexturedParticles 类={hitParticleClass} spawns={hitParticles(hitPos, hitTick, seed)} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, SoulBeam);
