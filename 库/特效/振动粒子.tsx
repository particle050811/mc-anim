// 振动粒子：声音从声源飞到幽匿感测体（以及感测体触发后再传给尖啸体）的那个原版粒子，照 1.20.1：
// - 谁发：VibrationSystem$Ticker 选中一次振动后，在振动发生的位置放一个 VibrationParticleOption(监听者的位置源, 飞行刻数)；
//   飞行刻数 = User.calculateTravelTimeInTicks(距离) 的默认实现 Mth.floor(距离)，距离是振动位置到监听者位置的直线距离，
//   即每刻 1 格（20 格/秒），不足 1 格的零头舍掉。监听者位置 = BlockPositionSource → Vec3.atCenterOf(方块)：方块正中心。
//   感测体在振动「到达」时（飞行刻数倒数到 0）才激活。
// - VibrationSignalParticle：quadSize 0.3（方片四角是 ±1 × 0.3，即 0.6 格见方）；lifetime = 飞行刻数；全亮（光照 240）；
//   半透明（PARTICLE_SHEET_TRANSLUCENT），alpha 1；贴图 particle/vibration.png（7 帧竖条动画，每刻换一帧，跟着全局时间走）。
//   每刻往目标挪「剩下距离 / 剩下刻数」，所以是匀速直线；渲染时按 partialTicks 在上一刻和这一刻的位置之间插值（比物理晚一刻）。
//   朝向：方片的本地 Y 轴（贴图的上方）指向飞行方向；方片所在的面在 spin = 0 时包含飞行方向和一条水平线，
//   再绕飞行方向转 spin = 2·sin((age + partialTicks − 2π)·0.05) 弧度；画两张背靠背的面片（各自剔除背面），两面看到的贴图方向一样。
// 场景坐标 Z 朝上；from / to 都是点（to 一般是感测体 / 尖啸体方块的正中心 = 方块底面中心 + 0.5 格高）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import vibPng from 'asset:贴图/特效/振动粒子';

const TEX = png(vibPng);
const FRAMES = TEX.h / TEX.w; // 7 帧，每帧 18×18
const SIZE = 0.3;

const frameTex: THREE.DataTexture[] = [];
const texOf = (k: number) => {
  if (!frameTex[k]) {
    const frameSize = TEX.w;
    const t = new THREE.DataTexture(TEX.px.slice(k * frameSize * frameSize * 4, (k + 1) * frameSize * frameSize * 4), frameSize, frameSize, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    frameTex[k] = t;
  }
  return frameTex[k];
};

// 飞行刻数（游戏的 lifetime / 感测体收到振动前的等待）= floor(直线距离)
export const vibrationTravelTicks = (from: V3, to: V3) => Math.floor(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]));
// 飞行秒数：感测体在这么多秒之后激活
export const vibrationTravelSec = (from: V3, to: V3) => vibrationTravelTicks(from, to) / 20;

// 第 sec 秒（从发出算起）粒子在哪、是否还在。lifetime = L 刻：
// 渲染位置 = from + (to − from) × max(0, τ−1)/(L−1)（τ = sec×20），τ ≥ L 时没了（游戏里最后一刻除以 0 得到无穷远）
export const vibrationParticlePos = (from: V3, to: V3, sec: number): V3 | null => {
  const lifeTicks = vibrationTravelTicks(from, to);
  const tau = sec * 20;
  if (tau < 0 || tau >= Math.max(1, lifeTicks)) return null;
  const progress = lifeTicks <= 1 ? 0 : Math.min(1, Math.max(0, tau - 1) / (lifeTicks - 1));
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress, from[2] + (to[2] - from[2]) * progress];
};

// 两张背靠背的方片：四个角 (−1,−1)(−1,1)(1,1)(1,−1) → 贴图 (U1,V1)(U1,V0)(U0,V0)(U0,V1)
const UV = [1, 1, 1, 0, 0, 0, 0, 1];
const CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
];

// from：声源（振动发生的位置）；to：监听者的方块中心；sec：从发出起算的秒数（< 0 或飞到了就不画）；
// 帧：全局动画帧的起点偏移（游戏里贴图动画跟全局时间走，和粒子什么时候发出无关）
export const VibrationSignal: React.FC<{ from: V3; to: V3; sec: number; 帧?: number }> = ({ from, to, sec, 帧: frameOffset = 0 }) => {
  const geo = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...UV, ...UV], 2));
    // 每张：0,1,2 / 0,2,3（游戏的顶点顺序：从本地 −Z 那边看是逆时针，即正面；那一面看过去贴图不是镜像的）；
    // 第二张同样的顺序，但本地 X 反过来，正面朝另一边
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    return geometry;
  }, []);
  const center = vibrationParticlePos(from, to, sec);
  if (!center) return null;
  const tau = sec * 20;
  const flightDir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  // spin = 0 时方片的本地 X：水平、垂直于飞行方向（游戏里 (t_z, 0, −t_x)/h，换到场景坐标是 up × T）
  const up = new THREE.Vector3(0, 0, 1);
  const X0 = up.clone().cross(flightDir);
  if (X0.lengthSq() < 1e-8) X0.set(1, 0, 0);
  X0.normalize();
  const N0 = X0.clone().cross(flightDir).normalize();
  const spin = 2 * Math.sin((tau - 2 * Math.PI) * 0.05);
  const localX = X0.clone().multiplyScalar(Math.cos(spin)).addScaledVector(N0, -Math.sin(spin));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  [1, -1].forEach((sx, faceIdx) => {
    CORNERS.forEach(([cx, cy], i) => {
      const vertex = new THREE.Vector3(...center).addScaledVector(localX, cx * sx * SIZE).addScaledVector(flightDir, cy * SIZE);
      pos.setXYZ(faceIdx * 4 + i, vertex.x, vertex.y, vertex.z);
    });
  });
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  const frame = (((Math.floor(tau) + frameOffset) % FRAMES) + FRAMES) % FRAMES;
  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshBasicMaterial map={texOf(frame)} transparent alphaTest={0.1} side={THREE.FrontSide} depthWrite />
    </mesh>
  );
};
