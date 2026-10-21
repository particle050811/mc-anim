// 铁魔法「苦力怕迫击炮」（Lob Creeper，`LobCreeperSpell` → `CreeperHeadProjectile`）：照 irons_spellbooks-1.20.1-3.16.3.jar 反汇编（npm run 取材 -- 苦力怕头）。
// - 施放（`LobCreeperSpell.onCast`，瞬发）：投射物出生在 眼睛 + 视线方向×1，再往下挪 0.25 格（碰撞箱 0.5×0.5），速度 = 视线方向 × (法术等级 + 10)×0.08 格/刻（1 级 17.6 米/秒）。施法完成音 entity.creeper.hurt。
// - 飞行（`AbstractMagicProjectile.tick` → travel）：每刻 位置 += 速度，然后速度 y −= 0.05（没有空气阻力）——抛物线。客户端每刻在碰撞箱中心放 1 个 smoke（速度 0）。
// - 外形（`SkullProjectileRenderer`，贴图 irons_spellbooks:textures/entity/creeper_head.png 32×32）：一个 8×8×8 像素的头，
//   PoseStack：Ry(−(atan2(vz,vx)×180/π + 90))·Rx(−(atan2(水平速度, vy)×180/π − 90))·scale(−1,−1,1)，速度在上一刻和这一刻之间插值；翻过来以后头占实体位置上方 0～0.5 格（绕头底中心转）。entityCutout，受场景光。
// - 命中（`onHit`，碰到方块或实体）：半径 5 格内的生物受伤（伤害 × (1 − (距离/5)²)），不破坏方块；在实体位置放 3 个 explosion（散布 0.1、速度 0.3）+ 1 个 blastwave（铁魔法冲击波环，半径参数 5×1.2 = 6，白色），放 entity.generic.explode（音量 3、音高 0.9～1.1）。没有原版爆炸那一大团烟，也没有方块碎屑。
// - blastwave（`BlastwaveParticle`）：水平的一张方片（正反两面），贴在位置上方 0.08 格；寿命 8 刻；半边长 = lerp(1 − (1−f)², 0.75×6, 6)，f = (age+pt)/8；透明度 1 − f；颜色 = 白 × (随机×0.14 + 0.85)；全亮；贴图 blastwave_1～8 按年龄换。
// 坐标：场景坐标（Z 朝上），单位格；时间：刻（1 秒 20 刻）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, V3 } from '../../engine/model/parts.tsx';
import { EntityModelData, ownPartGeometry } from '../../engine/model/实体模型.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import { png, pngDir } from '../../engine/model/贴图.ts';
import { serverSendParticles, ParticleSpawn } from './原版粒子.tsx';
import raw from 'asset:模型/特效/苦力怕头';
import texHead from 'asset:贴图/特效/苦力怕头';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/杂项粒子/blastwave_1';
import 资_1 from 'asset:贴图/特效/杂项粒子/blastwave_2';
import 资_2 from 'asset:贴图/特效/杂项粒子/blastwave_3';
import 资_3 from 'asset:贴图/特效/杂项粒子/blastwave_4';
import 资_4 from 'asset:贴图/特效/杂项粒子/blastwave_5';
import 资_5 from 'asset:贴图/特效/杂项粒子/blastwave_6';
import 资_6 from 'asset:贴图/特效/杂项粒子/blastwave_7';
import 资_7 from 'asset:贴图/特效/杂项粒子/blastwave_8';

const DATA = (raw as unknown as { models: { 苦力怕头: EntityModelData } }).models.苦力怕头;
const BW = pngDir(资产目录({ './blastwave_1.png': 资_0, './blastwave_2.png': 资_1, './blastwave_3.png': 资_2, './blastwave_4.png': 资_3, './blastwave_5.png': 资_4, './blastwave_6.png': 资_5, './blastwave_7.png': 资_6, './blastwave_8.png': 资_7 }));

export const LOB = { halfWidth: 0.25, gravity: 0.05, blastRadius: 5, shockwaveSize: 5 * 1.2, shockwaveLifeTicks: 8 };
export const mortarSpeed = (level: number) => (level + 10) * 0.08;

// 弹道：眼睛位置、视线方向（场景坐标）、法术等级（speed 给了就不按等级，格/刻）→ 第 k 刻（k ≥ 0，出生那一刻 k = 0）实体位置和速度（场景坐标，速度 格/刻）
export const mortarTrajectory = (eye: V3, lookDir: V3, level = 1, speed = mortarSpeed(level)) => {
  const lookLen = Math.hypot(...lookDir) || 1;
  const dir: V3 = [lookDir[0] / lookLen, lookDir[1] / lookLen, lookDir[2] / lookLen];
  const p0: V3 = [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2] - LOB.halfWidth];
  const v0: V3 = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  const posAt = (k: number): V3 => [p0[0] + v0[0] * k, p0[1] + v0[1] * k, p0[2] + v0[2] * k - (LOB.gravity * k * (k - 1)) / 2];
  const velAt = (k: number): V3 => [v0[0], v0[1], v0[2] - LOB.gravity * k];
  const drawPosAt = (τ: number): V3 => {
    const k = Math.floor(τ);
    const frac = τ - k;
    const prev = posAt(Math.max(0, k - 1));
    const curr = posAt(Math.max(0, k));
    return [prev[0] + (curr[0] - prev[0]) * frac, prev[1] + (curr[1] - prev[1]) * frac, prev[2] + (curr[2] - prev[2]) * frac];
  };
  const drawVelAt = (τ: number): V3 => {
    const k = Math.floor(τ);
    const frac = τ - k;
    const prev = velAt(Math.max(0, k - 1));
    const curr = velAt(Math.max(0, k));
    return [prev[0] + (curr[0] - prev[0]) * frac, prev[1] + (curr[1] - prev[1]) * frac, prev[2] + (curr[2] - prev[2]) * frac];
  };
  // 第一次碰到高度 z 的那一刻（下落段），给编排找落点用
  const tickAtHeight = (z: number) => {
    for (let k = 1; k < 2000; k++) if (posAt(k)[2] <= z && velAt(k)[2] < 0) return k;
    return Infinity;
  };
  return { p0, v0, posAt: posAt, velAt: velAt, drawPos: drawPosAt, drawVelAt: drawVelAt, tickAtHeight: tickAtHeight };
};

// 飞行时的烟（每刻 1 个 smoke，在碰撞箱中心）：t0、t1 是刻
export const mortarTrailSmoke = (trajectory: ReturnType<typeof mortarTrajectory>, t0: number, t1: number, seed: number): ParticleSpawn[] => {
  const out: ParticleSpawn[] = [];
  for (let k = Math.ceil(t0); k < t1; k++) {
    const pos = trajectory.posAt(k - Math.ceil(t0));
    out.push({ 种: 'smoke', 刻: k, p: [pos[0], pos[1], pos[2] + LOB.halfWidth], 种子: seed * 31 + k });
  }
  return out;
};

// 命中时的 3 个爆炸粒子
export const mortarBlastParticles = (at: V3, tick: number, seed: number) => serverSendParticles('explosion', tick, at, 3, [0.1, 0.1, 0.1], 0.3, seed);

const gameToScene = new THREE.Matrix4().makeRotationX(Math.PI / 2); // 游戏 (x, y 上, z) → 场景 (x, −z, y)

// 苦力怕头：at 实体位置（头底中心），vel 速度（场景，格/刻）
export const CreeperHead: React.FC<{ at: V3; vel: V3 }> = ({ at, vel }) => {
  const mat = useMemo(() => {
    const map = entityTexture(png(texHead));
    return new THREE.MeshStandardMaterial({ map, alphaTest: 0.1, roughness: 0.9, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4 });
  }, []);
  const matrix = useMemo(() => {
    const [gx, gy, gz] = [vel[0], vel[2], -vel[1]]; // 场景 → 游戏
    const yr = -((Math.atan2(gz, gx) * 180) / Math.PI + 90);
    const xr = -((Math.atan2(Math.hypot(gx, gz), gy) * 180) / Math.PI - 90);
    return new THREE.Matrix4()
      .makeTranslation(at[0], at[1], at[2])
      .multiply(gameToScene)
      .multiply(new THREE.Matrix4().makeRotationY((yr * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeRotationX((xr * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeScale(-1 / 16, -1 / 16, 1 / 16));
  }, [at[0], at[1], at[2], vel[0], vel[1], vel[2]]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh geometry={ownPartGeometry(DATA.root.children[0], DATA.texSize)} material={mat} castShadow receiveShadow />
    </group>
  );
};

// 冲击波环：at 命中位置；刻 = 命中以后过了多少刻（< 0 或 ≥ 8 不画）
const bwTex = new Map<string, THREE.DataTexture>();
const bwTexture = (name: string) => {
  let t = bwTex.get(name);
  if (!t) {
    const img = BW[name];
    t = new THREE.DataTexture(img.px, img.w, img.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.flipY = false;
    t.needsUpdate = true;
    bwTex.set(name, t);
  }
  return t;
};
export const Blastwave: React.FC<{ at: V3; tick: number; seed?: number; size?: number }> = ({ at, tick: tick, seed = 1, size = LOB.shockwaveSize }) => {
  const gray = useMemo(() => rng(seed * 811 + 3)() * 0.14 + 0.85, [seed]);
  if (tick < 0 || tick >= LOB.shockwaveLifeTicks) return null;
  const age = Math.floor(tick);
  const frac = tick / LOB.shockwaveLifeTicks;
  const waveSize = size;
  const half = 0.75 * waveSize + (waveSize - 0.75 * waveSize) * (1 - (1 - frac) * (1 - frac));
  const name = `blastwave_${1 + Math.min(7, Math.floor((age * 7) / LOB.shockwaveLifeTicks))}`;
  return (
    <mesh position={[at[0], at[1], at[2] + 0.08]} renderOrder={6}>
      <planeGeometry args={[half * 2, half * 2]} />
      <meshBasicMaterial
        map={bwTexture(name)}
        color={new THREE.Color().setRGB(gray, gray, gray, THREE.SRGBColorSpace)}
        transparent
        opacity={Math.max(0, 1 - frac)}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
};
