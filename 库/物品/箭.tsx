// 箭（原版 AbstractArrow 实体），照 1.20.1 ArrowRenderer.render 逐顶点搬：
//   poseStack: Ry(yRot − 90) · Rz(xRot) · [Rz(抖动)] · Rx(45°) · scale(0.05625) · translate(−4, 0, 0)
//   尾部方片（两张背靠背）：x = −7，y、z ∈ [−2, 2]，贴图 u 0~0.15625、v 0.15625~0.3125（arrow.png 的 0~5、5~10 像素）；
//   箭身：循环 4 次，每次先再绕 X 转 90°，画 (−8,−2,0)(8,−2,0)(8,2,0)(−8,2,0)，贴图 u 0~0.5、v 0~0.15625（0~16、0~5 像素）——
//   四张面片两两共面背靠背，组成两片互相垂直、和竖直面成 45° 的十字。渲染类型 entityCutout（镂空、剔除背面）。
//   投射物的 yRot = atan2(vx, vz)、xRot = atan2(vy, 水平速度)（Projectile.updateRotation），转完之后模型的 +X 就是飞行方向。
// 尺寸（格）：总长 16×0.05625 = 0.9，十字宽 4×0.05625 = 0.225；箭头（贴图右端）朝前。
// 相对实体位置 p：箭尖在 p + 0.225×dir，箭尾在 p − 0.675×dir，尾部方片在 p − 0.619×dir；箭身轴线穿过 p。
// 插进方块时（onHitBlock）实体停在命中点后退 0.05 格的地方，所以箭尖扎进去约 0.175 格。
// 抖动：射中方块那一刻 shakeTime = 7，之后每刻减 1；渲染时 s = shakeTime − partialTicks > 0 就多绕 Z 转 −sin(3s)·s 度（在飞行方向所在的竖直面里点头）。
// 贴图 textures/entity/projectiles/arrow.png（npm run 取材 -- 箭）。材质和方块网格一致（场景光照 + 0.4 倍自发光打底）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import arrowPng from 'asset:贴图/物品/箭';

const TEX = png(arrowPng);
let texCache: THREE.DataTexture | null = null;
const texture = () => {
  if (!texCache) {
    texCache = new THREE.DataTexture(TEX.px, TEX.w, TEX.h, THREE.RGBAFormat);
    texCache.colorSpace = THREE.SRGBColorSpace;
    texCache.magFilter = THREE.NearestFilter;
    texCache.minFilter = THREE.NearestFilter;
    texCache.needsUpdate = true;
  }
  return texCache;
};

export const ARROW = {
  scale: 0.05625,
  tipAhead: 0.225, // 箭尖在实体位置前方多少格
  tailBehind: 0.675, // 箭尾在实体位置后方多少格
  shakeTicks: 7,
  hitBack: 0.05, // 插进方块时实体位置比命中点后退多少
};

// 箭的本地几何（游戏的箭坐标系：+X 朝前，Y 上，Z = X×Y；单位格），不含抖动。每个面片：四个角 [x, y, z, u, v]
const localQuads = () => {
  const pxScale = ARROW.scale;
  const base = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(45)).multiply(new THREE.Matrix4().makeScale(pxScale, pxScale, pxScale)).multiply(new THREE.Matrix4().makeTranslation(-4, 0, 0));
  const quads: { m: THREE.Matrix4; v: number[][] }[] = [];
  // 尾部方片（两张，正反两面各一张）
  quads.push({
    m: base,
    v: [
      [-7, -2, -2, 0, 0.15625],
      [-7, -2, 2, 0.15625, 0.15625],
      [-7, 2, 2, 0.15625, 0.3125],
      [-7, 2, -2, 0, 0.3125],
    ],
  });
  quads.push({
    m: base,
    v: [
      [-7, 2, -2, 0, 0.15625],
      [-7, 2, 2, 0.15625, 0.15625],
      [-7, -2, 2, 0.15625, 0.3125],
      [-7, -2, -2, 0, 0.3125],
    ],
  });
  // 箭身：循环里先转再画，转动是累加的
  const shaftMat = base.clone();
  for (let j = 0; j < 4; j++) {
    shaftMat.multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(90)));
    quads.push({
      m: shaftMat.clone(),
      v: [
        [-8, -2, 0, 0, 0],
        [8, -2, 0, 0.5, 0],
        [8, 2, 0, 0.5, 0.15625],
        [-8, 2, 0, 0, 0.15625],
      ],
    });
  }
  return quads;
};

let geoCache: THREE.BufferGeometry | null = null;
const geometry = () => {
  if (geoCache) return geoCache;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const vec = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  for (const quad of localQuads()) {
    const base = pos.length / 3;
    const pts = quad.v.map(([x, y, z]) => vec.set(x, y, z).applyMatrix4(quad.m).clone());
    // 法线按四边形的绕向算（游戏顶点顺序是逆时针 = 正面）
    edgeA.subVectors(pts[1], pts[0]);
    edgeB.subVectors(pts[3], pts[0]);
    const normal = edgeA.clone().cross(edgeB).normalize();
    pts.forEach((pt, i) => {
      pos.push(pt.x, pt.y, pt.z);
      uv.push(quad.v[i][3], quad.v[i][4]);
      nor.push(normal.x, normal.y, normal.z);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geoCache = geo;
  return geo;
};

let matCache: THREE.MeshStandardMaterial | null = null;
const material = () => {
  if (!matCache) {
    const map = texture();
    matCache = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.95, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4 });
  }
  return matCache;
};

// 画在半透明特效上面用的一份（6-4-3a 思索）：材质一样，只是放进透明队列（three 先画完不透明的再画透明的，不放进去则箭被后画、不写深度的几百个半透明风点盖住）。还是镂空、写深度、做深度测试，墙后面的照样被墙挡住
let onTopCache: THREE.MeshStandardMaterial | null = null;
const onTopMaterial = () => {
  if (!onTopCache) {
    onTopCache = material().clone();
    onTopCache.transparent = true;
    onTopCache.depthWrite = true;
  }
  return onTopCache;
};

// 抖动角（度）：插地后 sec 秒，s = 7 − 刻数，s ≤ 0 时不抖
export const arrowShakeDeg = (sec: number) => {
  const ticksLeft = ARROW.shakeTicks - sec * 20;
  return ticksLeft > 0 ? -Math.sin(ticksLeft * 3) * ticksLeft : 0;
};

// 箭的本地坐标系（游戏）→ 场景：本地 +X = 飞行方向；本地 +Y = 竖直面里垂直于飞行方向、朝上的那个方向；本地 Z = X × Y。
// 游戏坐标到场景坐标 (x, −z, y) 是转动（不改手性），所以在场景里直接这样搭基就行
const basis = (dir: V3) => {
  const forward = new THREE.Vector3(...dir).normalize();
  const up = new THREE.Vector3(0, 0, 1);
  let upPerp = up.clone().addScaledVector(forward, -up.dot(forward));
  if (upPerp.lengthSq() < 1e-8) upPerp = new THREE.Vector3(1, 0, 0).addScaledVector(forward, -forward.x); // 竖直飞的时候随便取一个
  upPerp.normalize();
  const side = forward.clone().cross(upPerp);
  return new THREE.Matrix4().makeBasis(forward, upPerp, side);
};

// `p`：箭实体的位置（箭尖在 p 前方 0.225 格，箭尾在 p 后方 0.675 格）；`dir`：飞行方向（插地后保持最后的飞行方向）；
// `shake`：插进方块之后经过的秒数（游戏的 shakeTime 从 7 刻减到 0，前 0.35 秒点头抖动）；不给或 < 0 不抖；
// `自转`：绕箭身长轴转的角（度，顺着飞行方向看顺时针为正）。游戏里箭不绕长轴转，不给就是 0；6-4-3 要箭飞的时候转（见 镜头/6-4-3/几何.ts 的 `spinAngle`）
// `onTopOrder`：给了就画在半透明的东西（气流、鼓风机虚影）上面，值是 renderOrder，要比它们的大（见 `onTopMaterial`）；不给和原来一样
export const Arrow: React.FC<{ p: V3; dir: V3; shake?: number; spin?: number; onTopOrder?: number }> = ({ p: pos, dir, shake, spin: roll = 0, onTopOrder }) => {
  const basisMat = useMemo(() => basis(dir), [dir[0], dir[1], dir[2]]);
  const ang = shake !== undefined && shake >= 0 ? arrowShakeDeg(shake) : 0;
  return (
    <group position={pos}>
      <group matrix={basisMat} matrixAutoUpdate={false}>
        <group rotation={[0, 0, THREE.MathUtils.degToRad(ang)]}>
          <group rotation={[THREE.MathUtils.degToRad(roll), 0, 0]}>
            <mesh geometry={geometry()} material={onTopOrder === undefined ? material() : onTopMaterial()} renderOrder={onTopOrder ?? 0} castShadow receiveShadow />
          </group>
        </group>
      </group>
    </group>
  );
};
