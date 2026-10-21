// 物品拾取：战利品箱被打碎后，里面的物品往四周、往前迸出去，再像原版拾取那样被吸向玩家，追上后缩小消失（用户 10-02 要）。
// 原版 `ItemPickupParticle` 是物品 3 刻里从原处飞到玩家身上；这里玩家骑扫帚以 300 多米/秒往前飞，所以吸的那段是「追上去」：
// 位置 = 自由飞行位置与玩家身上那一点之间插值（权重按 u² 涨，越吸越快），吸到八成多追上，贴在他身上缩小到没有。
// 自由飞行：初速度往前、往外，带空气阻力（指数衰减）和重力。物品被长矛连箱子撞出去，往前初速和长矛差不多：慢放近景里阻力还没起作用，物品围着矛尖散开一圈再被吸回；
// 原速远景里阻力让它们落到扫帚后面再追上去。时间一律是物理秒（一镜到底慢放只是时钟慢，速度不改）。
// 坐标：世界（场景）坐标，Z 朝上。目标点（玩家身上）由调用的地方按这一帧的扫帚位置给。
import React from 'react';
import * as THREE from 'three';
import { rng, V3 } from '../../engine/model/parts.tsx';
import { DropItem, DropName } from '../物品/掉落物.tsx';

export type 拾取件 = { 名: DropName; p0: V3; v0: V3; spinAxis: V3; spinSpeed: number; 起吸: number; 吸完: number };
export type BurstParams = {
  forwardSpeed: [number, number]; // 沿冲击方向的速度范围（米/秒）
  spreadSpeed: [number, number]; // 往四周（垂直于冲击方向）的速度范围
  upSpeed: [number, number]; // 往上的速度范围（原版容器被打掉时掉出来的东西也是往上一蹦）
  起吸: [number, number]; // 打碎后多少秒开始被吸（每件在范围里随机）
  吸完: [number, number]; // 打碎后多少秒被吸到玩家身上
};
const drag = 8; // 1/秒（物品比箱子碎块轻，阻力大一些）
const gravity = 16; // 原版物品 0.04 格/刻²

// 一箱物品迸出去的初始状态：中心 = 箱子中心（世界），前 = 冲击方向（世界，单位向量）
export const burstItems = (names: DropName[], center: V3, forward: V3, params: BurstParams, seed: number): 拾取件[] => {
  const rand = rng(seed * 613 + 11);
  // 和 前 垂直的两根轴
  const up: V3 = Math.abs(forward[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const perpA = new THREE.Vector3(...forward).cross(new THREE.Vector3(...up)).normalize();
  const perpB = new THREE.Vector3(...forward).cross(perpA).normalize();
  return names.map((name, i) => {
    // 往四周的方向在一圈里错开（加一点随机），再往上蹦：先飞到两个人头顶上方，再落进李樱怀里（不和贴着矛尖乱飞的箱子碎块混在一起）
    const ang = ((i + 0.3 * rand()) / names.length) * Math.PI * 2;
    const outward = perpA.clone().multiplyScalar(Math.cos(ang)).add(perpB.clone().multiplyScalar(Math.sin(ang)));
    const vf = params.forwardSpeed[0] + (params.forwardSpeed[1] - params.forwardSpeed[0]) * rand();
    const vo = params.spreadSpeed[0] + (params.spreadSpeed[1] - params.spreadSpeed[0]) * rand();
    const vu = params.upSpeed[0] + (params.upSpeed[1] - params.upSpeed[0]) * rand();
    const v0: V3 = [forward[0] * vf + outward.x * vo, forward[1] * vf + outward.y * vo, forward[2] * vf + outward.z * vo + vu];
    const p0: V3 = [center[0] + (rand() - 0.5) * 0.3, center[1] + (rand() - 0.5) * 0.3, center[2] + (rand() - 0.5) * 0.3];
    const suckStart = params.起吸[0] + (params.起吸[1] - params.起吸[0]) * rand();
    const suckEnd = params.吸完[0] + (params.吸完[1] - params.吸完[0]) * rand();
    return { 名: name, p0, v0, spinAxis: [rand() - 0.5, rand() - 0.5, rand() - 0.5], spinSpeed: 25 + 45 * rand(), 起吸: suckStart, 吸完: suckEnd };
  });
};

// 打碎后 τ 秒时这一件在哪、多大（0～1，0 = 已经被吸进去了），目标 = 玩家身上那一点（这一帧）
export const pickupStateAt = (k: 拾取件, τ: number, target: V3): { p: V3; s: number } | null => {
  if (τ < 0) return null;
  const suckProgress = Math.min(1, Math.max(0, (τ - k.起吸) / (k.吸完 - k.起吸)));
  if (suckProgress >= 1) return null;
  const dragTravel = (1 - Math.exp(-drag * τ)) / drag;
  const free = [0, 1, 2].map((i) => k.p0[i] + k.v0[i] * dragTravel) as V3;
  free[2] -= 0.5 * gravity * τ * τ * (1 - suckProgress);
  const pullWeight = Math.min(1, (suckProgress / 0.82) ** 2);
  const pos = [0, 1, 2].map((i) => free[i] + (target[i] - free[i]) * pullWeight) as V3;
  const x = Math.min(1, Math.max(0, (suckProgress - 0.72) / 0.28));
  return { p: pos, s: 1 - x * x * (3 - 2 * x) };
};

// 朝向：贴图正面朝着镜头（原版掉地物品慢慢绕竖轴转，零点几秒里看着不转），上方尽量朝上，再按各自转速在画面里轻摆（被撞出来的翻滚）。不朝镜头的话薄片侧对镜头只剩一条线，远景里看不出是什么
const faceCamera = (pos: V3, cameraPos: number[], sway: number) => {
  const z = new THREE.Vector3(cameraPos[0] - pos[0], cameraPos[1] - pos[1], cameraPos[2] - pos[2]).normalize();
  const up = Math.abs(z.z) > 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway));
};

// τ：打碎后的物理秒数；目标：玩家身上那一点（世界）；镜头：镜头位置；放大：按位置给一个额外的缩放（远景看得出有东西被吸过来）；亮：自发光打底
export const ItemPickup: React.FC<{ items: 拾取件[]; τ: number; target: V3; camPos: number[]; scale?: (pos: V3) => number; glow?: number }> = ({ items: items, τ, target: target, camPos: cameraPos, scale: scaleAt, glow: glow }) => (
  <>
    {items.map((k, i) => {
      const st = pickupStateAt(k, τ, target);
      if (!st || st.s <= 0.01) return null;
      const sway = 0.45 * Math.sin(k.spinSpeed * τ + k.spinAxis[0] * 7);
      const scale = st.s * (scaleAt ? scaleAt(st.p) : 1);
      return (
        <group key={i} position={st.p} quaternion={faceCamera(st.p, cameraPos, sway)} scale={scale}>
          <DropItem name={k.名} glow={glow} />
        </group>
      );
    })}
  </>
);
