// 夜幕刀光的命中 `NightfallHit`：yamato_cut 闪光（走泛光）和 6 滴血。
// 二、命中（夜幕 YamatoHitParticle_1 → YamatoCutParticle_1、Epic Fight BloodParticle，jar 反汇编）：
//   - 命中点 = 目标脚底 + ((r−0.5)·宽, (r + 高)·0.5, (r−0.5)·宽)；上方 1 格放 yamato_cut1 闪光：朝镜头的方片，半边长 3 格，白色全亮，绕视线转 40 弧度，
//     寿命 4 刻，按年龄换 yamato_cut1～4_a（age×3/4），走泛光。
//   - 同时喷 6 滴血：水平速度 r×0.2，竖直 (0.9 − m)×0.4，m = r + 0.2；重力 4m，寿命 10 + 10m 刻；颜色 (0.6 或 0.4, 0, 0)；出生点再上移 0.5 格。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../engine/model/parts.tsx';
import { pngDir } from '../../../engine/model/贴图.ts';
import { interpPathPos, ParticleQuads, particleTexture, particlePath } from '../粒子面片.tsx';
import { Billboard, bloomLayer, bloomMaterial, bloomTexture, rng } from './共用.tsx';
import { 资产目录 } from '../../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/粒子/drip_hang';

const dripPng = pngDir(资产目录({ './drip_hang.png': 资_0 })).drip_hang;

const flashLifeTicks = 4;
const flashHalfSize = 3.0;
const flashRollRad = 40; // 弧度

// 命中的随机量（按种子固定）：命中点、6 滴血的轨迹
const hitData = (feet: V3, width: number, height: number, seed: number) => {
  const rand = rng(seed);
  // 游戏坐标 y 朝上；场景 = (x, −z, y)
  const hx = feet[0] + (rand() - 0.5) * width;
  const hy = feet[2] + (rand() + height) * 0.5;
  const hz = -feet[1] + (rand() - 0.5) * width;
  const hitPos: V3 = [hx, -hz, hy];
  let spreadVel = 0.2;
  const drops = Array.from({ length: 6 }, () => {
    const mx = rand() * spreadVel;
    spreadVel *= rand() < 0.5 ? 1 : -1;
    const mz = rand() * spreadVel;
    spreadVel *= rand() < 0.5 ? 1 : -1;
    const weight = rand() + 0.2;
    const lifespan = 10 + Math.floor(weight * 10);
    // Particle 构造：位置 ±0.1、往上 (r + 0.2)·0.5；Provider 再 move(0, 0.5, 0)
    const p0: V3 = [hx + (rand() - 0.5) * 0.2, -(hz + (rand() - 0.5) * 0.2), hy + (rand() + 0.2) * 0.5 + 0.5];
    const path = particlePath(p0, [mx, -mz, (0.9 - weight) * 0.4], lifespan, { gravity: weight * 4, friction: 0.98, ground: feet[2] });
    const red = rand() < 0.6 ? 0.6 : 0.4; // Mth.clamp(r, 0.6, 0.4)：r < 0.6 得 0.6，否则 0.4
    const half = 0.1 * (rand() * 0.5 + 0.5) * 2;
    return { path: path, lifespan: lifespan, red: red, half };
  });
  return { hitPos: hitPos, blood: drops };
};

export const NightfallHit: React.FC<{ feet: V3; width: number; height: number; sec: number; seed?: number }> = ({ feet: feet, width: width, height: height, sec: sec, seed: seed = 1 }) => {
  const data = useMemo(() => hitData(feet, width, height, seed), [feet, width, height, seed]);
  const mat = useMemo(() => bloomMaterial(bloomTexture('yamato_cut1_a'), 1), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const quad = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    // 右边 U1、上边 V0
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute([1, 1, 1, 1], 1));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return geometry;
  }, []);
  useEffect(() => () => quad.dispose(), [quad]);
  if (sec < 0) return null;
  const tick = sec * 20;
  // HitParticle.tick：age++ >= lifetime 才移除，第 0～4 刻画；setSpriteFromAge：第 age×3/4 帧
  const age = Math.floor(tick);
  const showFlash = age <= flashLifeTicks;
  if (showFlash) mat.uniforms.map.value = bloomTexture(`yamato_cut${Math.min(3, Math.floor((age * 3) / flashLifeTicks)) + 1}_a`);
  const bloodQuads = data.blood
    .filter((b) => tick < b.lifespan + 1)
    .map((b) => ({ p: interpPathPos(b.path, tick), half: b.half, uv: [0, 0, 1, 1] as [number, number, number, number], color: [b.red, 0, 0] as [number, number, number] }));
  return (
    <>
      {showFlash && <FlashQuad at={data.hitPos} quad={quad} mat={mat} />}
      {bloodQuads.length > 0 && <ParticleQuads tex={particleTexture(dripPng.px, dripPng.w, dripPng.h, dripPng.px)} items={bloodQuads} />}
    </>
  );
};

const FlashQuad: React.FC<{ at: V3; quad: THREE.BufferGeometry; mat: THREE.ShaderMaterial }> = ({ at, quad, mat }) => (
  <Billboard at={at} quad={quad} mat={mat} half={flashHalfSize} roll={flashRollRad} layer={bloomLayer} renderOrder={21} />
);
