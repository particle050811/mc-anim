// 生物死亡特效：用游戏原版的粒子贴图和粒子参数（1.20.1），不是自己画的烟团。粒子是始终朝向镜头的面片（sprite），不受光照。时间单位：秒；游戏 1 刻 = 1/20 秒。
// - `ExplosionBurst`：暮色森林娜迦身体节自毁时放的粒子。游戏里每节放 20 个，每个随机是「爆炸」或「爆炸发射器」；发射器存活 8 刻，每刻在 ±4 格内再放 6 个爆炸。
//   爆炸粒子是 16 帧贴图动画，存活 6~9 刻，半边长约 2 格，灰度随机。照原数量 12 节连炸会糊成白，所以发射器放出的爆炸只保留约 6%，单个粒子的大小、贴图、寿命不变。
// - `PoofBurst`：原版生物死亡消失时的白色烟团（poof）：20 个，8 帧贴图从大到小，慢慢上飘。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type V3 } from '../../engine/model/parts.tsx';
import { pngDir } from '../../engine/model/贴图.ts';
import { assetDir } from '../../engine/core/资产目录.ts';
import criticalHitPng from 'asset:贴图/特效/粒子/critical_hit';
import dripHangPng from 'asset:贴图/特效/粒子/drip_hang';
import explosion0Png from 'asset:贴图/特效/粒子/explosion_0';
import explosion1Png from 'asset:贴图/特效/粒子/explosion_1';
import explosion10Png from 'asset:贴图/特效/粒子/explosion_10';
import explosion11Png from 'asset:贴图/特效/粒子/explosion_11';
import explosion12Png from 'asset:贴图/特效/粒子/explosion_12';
import explosion13Png from 'asset:贴图/特效/粒子/explosion_13';
import explosion14Png from 'asset:贴图/特效/粒子/explosion_14';
import explosion15Png from 'asset:贴图/特效/粒子/explosion_15';
import explosion2Png from 'asset:贴图/特效/粒子/explosion_2';
import explosion3Png from 'asset:贴图/特效/粒子/explosion_3';
import explosion4Png from 'asset:贴图/特效/粒子/explosion_4';
import explosion5Png from 'asset:贴图/特效/粒子/explosion_5';
import explosion6Png from 'asset:贴图/特效/粒子/explosion_6';
import explosion7Png from 'asset:贴图/特效/粒子/explosion_7';
import explosion8Png from 'asset:贴图/特效/粒子/explosion_8';
import explosion9Png from 'asset:贴图/特效/粒子/explosion_9';
import generic0Png from 'asset:贴图/特效/粒子/generic_0';
import generic1Png from 'asset:贴图/特效/粒子/generic_1';
import generic2Png from 'asset:贴图/特效/粒子/generic_2';
import generic3Png from 'asset:贴图/特效/粒子/generic_3';
import generic4Png from 'asset:贴图/特效/粒子/generic_4';
import generic5Png from 'asset:贴图/特效/粒子/generic_5';
import generic6Png from 'asset:贴图/特效/粒子/generic_6';
import generic7Png from 'asset:贴图/特效/粒子/generic_7';
import glitter0Png from 'asset:贴图/特效/粒子/glitter_0';
import glitter1Png from 'asset:贴图/特效/粒子/glitter_1';
import glitter2Png from 'asset:贴图/特效/粒子/glitter_2';
import glitter3Png from 'asset:贴图/特效/粒子/glitter_3';
import glitter4Png from 'asset:贴图/特效/粒子/glitter_4';
import glitter5Png from 'asset:贴图/特效/粒子/glitter_5';
import glitter6Png from 'asset:贴图/特效/粒子/glitter_6';
import glitter7Png from 'asset:贴图/特效/粒子/glitter_7';
import splash0Png from 'asset:贴图/特效/粒子/splash_0';
import splash1Png from 'asset:贴图/特效/粒子/splash_1';
import splash2Png from 'asset:贴图/特效/粒子/splash_2';
import splash3Png from 'asset:贴图/特效/粒子/splash_3';
import { mulberry32 } from '../../engine/core/数学.ts';

const particleTextures = pngDir(assetDir({ './critical_hit.png': criticalHitPng, './drip_hang.png': dripHangPng, './explosion_0.png': explosion0Png, './explosion_1.png': explosion1Png, './explosion_10.png': explosion10Png, './explosion_11.png': explosion11Png, './explosion_12.png': explosion12Png, './explosion_13.png': explosion13Png, './explosion_14.png': explosion14Png, './explosion_15.png': explosion15Png, './explosion_2.png': explosion2Png, './explosion_3.png': explosion3Png, './explosion_4.png': explosion4Png, './explosion_5.png': explosion5Png, './explosion_6.png': explosion6Png, './explosion_7.png': explosion7Png, './explosion_8.png': explosion8Png, './explosion_9.png': explosion9Png, './generic_0.png': generic0Png, './generic_1.png': generic1Png, './generic_2.png': generic2Png, './generic_3.png': generic3Png, './generic_4.png': generic4Png, './generic_5.png': generic5Png, './generic_6.png': generic6Png, './generic_7.png': generic7Png, './glitter_0.png': glitter0Png, './glitter_1.png': glitter1Png, './glitter_2.png': glitter2Png, './glitter_3.png': glitter3Png, './glitter_4.png': glitter4Png, './glitter_5.png': glitter5Png, './glitter_6.png': glitter6Png, './glitter_7.png': glitter7Png, './splash_0.png': splash0Png, './splash_1.png': splash1Png, './splash_2.png': splash2Png, './splash_3.png': splash3Png }));
const matCache = new Map<string, THREE.SpriteMaterial>();
const spriteMat = (name: string, gray: number) => {
  const grayStep = Math.round(gray * 10) / 10;
  const key = `${name}|${grayStep}`;
  let material = matCache.get(key);
  if (!material) {
    const t = particleTextures[name];
    const px = new Uint8Array(t.px.length);
    // Sprite 的贴图 v=0 在下，像素按行倒过来存
    for (let y = 0; y < t.h; y++) px.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), (t.h - 1 - y) * t.w * 4);
    const tex = new THREE.DataTexture(px, t.w, t.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    material = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(grayStep, grayStep, grayStep), transparent: true, alphaTest: 0.05, depthWrite: false, fog: false });
    matCache.set(key, material);
  }
  return material;
};

type Particle = { born: number; life: number; p: V3; v: V3; half: number; gray: number };

const Sprites: React.FC<{ parts: Particle[]; tick: number; frames: string[]; rise?: number }> = ({ parts, tick, frames, rise = 0 }) => (
  <>
    {parts.map((particle, i) => {
      const age = tick - particle.born;
      if (age < 0 || age >= particle.life) return null;
      const name = frames[Math.min(frames.length - 1, Math.floor((age / particle.life) * frames.length))];
      // 上飘：每刻速度 +rise，位移是它的累加
      const z = particle.p[2] + particle.v[2] * age + (rise * age * (age + 1)) / 2;
      return <sprite key={i} position={[particle.p[0] + particle.v[0] * age, particle.p[1] + particle.v[1] * age, z]} scale={[particle.half * 2, particle.half * 2, 1]} material={spriteMat(name, particle.gray)} />;
    })}
  </>
);

const EXPLOSION = Array.from({ length: 16 }, (_, i) => `explosion_${i}`);
const POOF = Array.from({ length: 8 }, (_, i) => `generic_${7 - i}`);

// center：身体节中心；width：碰撞箱宽；sec：自毁后经过的秒数（<0 不显示）；
// maxX：粒子中心最多散到场景 x 多少（不传就不限）。镜头里主角站得离炸点只有几格时，用它让粒子都落在主角身后，被主角挡住而不是盖住主角
export const ExplosionBurst: React.FC<{ center: V3; width: number; sec: number; seed: number; maxX?: number }> = ({ center, width, sec, seed, maxX = Infinity }) => {
  const parts = useMemo(() => {
    const rand = mulberry32(seed * 7919 + 13);
    const out: Particle[] = [];
    const boom = (p: V3, born: number, half: number) =>
      out.push({ born, life: 6 + Math.floor(rand() * 4), p: [Math.min(p[0], maxX), p[1], p[2]], v: [0, 0, 0], half, gray: 0.4 + rand() * 0.6 });
    for (let k = 0; k < 20; k++) {
      const spawnPos: V3 = [center[0] + (rand() * 2 - 1) * width, center[1] + (rand() * 2 - 1) * width, center[2] + (rand() - 0.5) * width];
      if (rand() < 0.5) boom(spawnPos, 0, 2);
      else
        for (let t = 0; t < 8; t++) {
          // 发射器每刻放 6 个，只保留约 6%
          if (rand() < 0.94) continue;
          for (let j = 0; j < 6; j++) boom([spawnPos[0] + (rand() - rand()) * 4, spawnPos[1] + (rand() - rand()) * 4, Math.max(0.5, spawnPos[2] + (rand() - rand()) * 4)], t, 2 * (1 - (t / 8) * 0.5));
        }
    }
    return out;
  }, [center[0], center[1], center[2], width, seed, maxX]);
  if (sec < 0) return null;
  return <Sprites parts={parts} tick={sec * 20} frames={EXPLOSION} />;
};

// 原版生物死亡的白色烟团：在碰撞箱内随机 20 个
export const PoofBurst: React.FC<{ center: V3; width: number; height: number; sec: number; seed: number }> = ({ center, width, height, sec, seed }) => {
  const parts = useMemo(() => {
    const rand = mulberry32(seed * 104729 + 7);
    const approxNormal = () => (rand() + rand() + rand() - 1.5) * 1.15; // 近似正态
    return Array.from({ length: 20 }, (): Particle => ({
      born: 0,
      life: Math.floor(8 / (rand() * 0.8 + 0.2)) + 4,
      p: [center[0] + (rand() * 2 - 1) * width, center[1] + (rand() * 2 - 1) * width, center[2] + (rand() - 0.5) * height],
      v: [approxNormal() * 0.02, approxNormal() * 0.02, approxNormal() * 0.02],
      half: 0.1 * (rand() * rand() * 6 + 1) * 2.2, // 原版半边长 0.1~0.7；参考模型镜头远，放大到看得见
      gray: 1 - rand() * 0.3,
    }));
  }, [center[0], center[1], center[2], width, height, seed]);
  if (sec < 0) return null;
  return <Sprites parts={parts} tick={sec * 20} frames={POOF} rise={0.004} />;
};

// 死亡倒地：身子绕脚底往 `向`（被击退的方向，水平）倒下，同时整个往 `向` 被击退。原版 `LivingEntityRenderer.setupRotations` 在 deathTime 0～20 刻里转 min(1, √(刻/20 × 1.6)) × 90°（13.5 刻倒平），20 刻放白烟、消失。
// 但把那条 √ 曲线压进几毫秒物理时间，头顶线速度会远超飞行速度（用户 10-07 嫌「着地的线速度比飞行都快」），所以按用户定的：
// 匀速转，戳中点（离脚底 `戳高` 米）绕脚底的线速度 = 飞行速度，倒平用 `倒地时长`；化成白烟照原版比例在倒平以后（20 / 13.5 倍）。
// 击退照原版死的那一下（`LivingEntity.knockback` 0.4）：水平、往上都是 0.4 格/刻 = 8 米/秒，之后按重力落；物理上倒地只有几十毫秒，所以只挪开零点几米。
// children 的原点要在脚底；白烟照原版放在击退以后的位置
export const deathToFlatRatio = 20 / 13.5;
export const deathKnockback = { horiz: 8, up: 8, gravity: 32 };
export const toppleDuration = (stabHeight: number, flightSpeed: number) => ((Math.PI / 2) * stabHeight) / flightSpeed;
// τ：死了多少秒（物理时间）
export const knockbackOffsetAt = (knockbackDir: V3, τ: number): V3 => {
  if (τ <= 0) return [0, 0, 0];
  const dirLen = Math.hypot(knockbackDir[0], knockbackDir[1]) || 1;
  const horizDist = deathKnockback.horiz * τ;
  return [(knockbackDir[0] / dirLen) * horizDist, (knockbackDir[1] / dirLen) * horizDist, Math.max(0, deathKnockback.up * τ - 0.5 * deathKnockback.gravity * τ * τ)];
};
// u：0～1，1 = 倒平
export const toppleAngle = (u: number) => Math.min(1, Math.max(0, u)) * (Math.PI / 2);
export const DeathTopple: React.FC<{ fallDir: V3; u: number; knockbackOffset?: V3; children: React.ReactNode }> = ({ fallDir: knockbackDir, u: toppleProgress, knockbackOffset = [0, 0, 0], children }) => {
  const toppleQuat = useMemo(() => {
    const fallDir = new THREE.Vector3(knockbackDir[0], knockbackDir[1], 0).normalize();
    const toppleAxis = new THREE.Vector3(0, 0, 1).cross(fallDir).normalize();
    return new THREE.Quaternion().setFromAxisAngle(toppleAxis, toppleAngle(toppleProgress));
  }, [knockbackDir[0], knockbackDir[1], toppleProgress]);
  return (
    <group position={knockbackOffset}>
      <group quaternion={toppleQuat}>{children}</group>
    </group>
  );
};
