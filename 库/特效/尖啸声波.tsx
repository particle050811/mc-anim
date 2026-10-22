// 尖啸体喷声波环：照 1.20.1 LevelRenderer.levelEvent 3007（SculkShriekerBlockEntity.shriek 发的事件）和 ShriekParticle：
// - 3007：放 10 个 ShriekParticleOption（延迟 i×5 刻，i = 0..9），位置 (方块 x+0.5, y + 0.5, z+0.5)，0.5 = 碰撞形状 box(0,0,0,16,8,16) 的顶，速度 0。
// - ShriekParticle：延迟没走完时不动不画；之后 lifetime 30 刻，竖直速度 0.1 格/刻、无重力、每刻 ×0.98，即 30 刻升约 2.27 格；
//   quadSize(t) = 0.85 × clamp(t/30 × 0.75, 0, 1)（方片四角 ±1 × quadSize）；alpha = 1 − t/30（着色器 alpha < 0.1 丢掉，第 27 刻就看不见）；全亮、半透明。
//   两张面片 rotationYXZ(−π, 1.0472, 0) 和 rotationX(−1.0472)，JOML 实算在同一平面里背靠背，平面相对水平倾斜 30°（南低北高，不随镜头转）；
//   每张四角（游戏坐标，×quadSize）：(±1, −0.5, 0.866) 和 (±1, 0.5, −0.866)。
// 场景坐标 Z 朝上、南 = −Y，时间单位秒（1 秒 20 刻）。和游戏不同：游戏里粒子有碰撞（头顶 2 格内有方块会被挡），这里不管。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { BlockModel, type BlockModelData } from '../../engine/model/方块模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import shriekPng from 'asset:贴图/特效/尖啸声波';
import shriekerData from 'asset:模型/特效/幽匿尖啸体';
import shriekerAtlas from 'asset:贴图/特效/幽匿尖啸体';

// 幽匿尖啸体方块本身（minecraft:sculk_shrieker[can_summon=true]，npm run 取材 -- 幽匿尖啸体；内顶贴图是动画，只取第一帧）。
// 古城网格里本来就有尖啸体，这个给核对和特写用。p：方块底面中心
const SHRIEKER = shriekerData as unknown as BlockModelData;
const SHRIEKER_ATLAS = png(shriekerAtlas);
export const SculkShriekerBlock: React.FC<{ p: V3 }> = ({ p: blockPos }) => (
  <group position={[blockPos[0], blockPos[1], blockPos[2] + 0.5]}>
    <BlockModel data={SHRIEKER} atlas={SHRIEKER_ATLAS} part="尖啸体" />
  </group>
);

const ringPng = png(shriekPng);
let tex: THREE.DataTexture | null = null;
const texture = () => {
  if (!tex) {
    tex = new THREE.DataTexture(ringPng.px, ringPng.w, ringPng.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
  }
  return tex;
};

export const shriekParams = {
  count: 10,
  intervalTicks: 5,
  lifeTicks: 30,
  startHeight: 0.5,
  riseSpeed: 0.1,
  friction: 0.98,
  maxSize: 0.85,
};

// 一个环在发出后 tau 刻时的状态（tau 从它的延迟结束算起）：渲染高度（含一刻插值延迟）、quadSize、alpha
export const ringStateAt = (tau: number) => {
  const { lifeTicks: life, riseSpeed: riseRate, friction: drag, maxSize: peakSize } = shriekParams;
  if (tau < 0 || tau >= life) return null;
  // 第 k 刻结束时升了 v(1−f^k)/(1−f)；画的时候在第 k−1 刻和第 k 刻的位置之间插值
  const rise = (k: number) => (k <= 0 ? 0 : (riseRate * (1 - drag ** k)) / (1 - drag));
  const k = Math.floor(tau);
  const z = rise(k - 1) + (rise(k) - rise(k - 1)) * (tau - k);
  const size = peakSize * Math.min(1, Math.max(0, (tau / life) * 0.75));
  const alpha = 1 - Math.min(1, Math.max(0, tau / life));
  return { z, size, alpha };
};

// 游戏里两张面片的四个角（游戏坐标，未乘 quadSize），以及对应的贴图坐标 (U1,V1)(U1,V0)(U0,V0)(U0,V1)
// 第一张：rotationYXZ(−π, 1.0472, 0)；第二张：rotationX(−1.0472)。数值是 JOML 实算的
const QUADS_GAME = [
  [
    [1, -0.5, 0.866],
    [1, 0.5, -0.866],
    [-1, 0.5, -0.866],
    [-1, -0.5, 0.866],
  ],
  [
    [-1, -0.5, 0.866],
    [-1, 0.5, -0.866],
    [1, 0.5, -0.866],
    [1, -0.5, 0.866],
  ],
];
const UV = [1, 1, 1, 0, 0, 0, 0, 1];
const QUADS = QUADS_GAME.map((q) => q.map(([x, y, z]) => [x, -z, y]));

const Ring: React.FC<{ center: V3; size: number; alpha: number }> = ({ center, size, alpha }) => {
  const geo = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(QUADS.flat(2), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...UV, ...UV], 2));
    // 游戏的顶点顺序 0,1,2,3（四边形），每张各自剔除背面
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    return geometry;
  }, []);
  return (
    <mesh geometry={geo} position={center} scale={[size, size, size]}>
      <meshBasicMaterial map={texture()} transparent opacity={alpha} alphaTest={0.1} side={THREE.FrontSide} depthWrite />
    </mesh>
  );
};

// p：尖啸体方块底面中心；sec：尖啸（3007 事件）起算的秒数，< 0 不画。10 个环依次在 0, 0.25, …, 2.25 秒冒出，最后一个 3.75 秒消失
export const ShriekRings: React.FC<{ p: V3; sec: number }> = ({ p: blockPos, sec }) => {
  if (sec < 0) return null;
  const t = sec * 20;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < shriekParams.count; i++) {
    const ring = ringStateAt(t - i * shriekParams.intervalTicks);
    if (!ring || ring.size <= 0) continue;
    out.push(<Ring key={i} center={[blockPos[0], blockPos[1], blockPos[2] + shriekParams.startHeight + ring.z]} size={ring.size} alpha={ring.alpha} />);
  }
  return <>{out}</>;
};

// 一次尖啸的总时长（秒）：最后一个环 45 刻后出、活 30 刻
export const shriekTotalSec = ((shriekParams.count - 1) * shriekParams.intervalTicks + shriekParams.lifeTicks) / 20;
