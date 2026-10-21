// 边城北墙东门楼旁的落水池的水面（池沿方块在 布局/城墙.ts，范围见 布局/共用.ts 的 `fallPool`）。只画水面那一层：池沿比水面高，侧面看不到。
// 照原版水：水源方块顶面高 8/9 格（FluidState.getOwnHeight = 8 / 9）；贴图 water_still（npm run 取材 -- 边城水面，16×512 竖排 32 帧，.mcmeta frametime 2 = 每 2 刻换一帧、不插值），
// 乘平原的水色 #3F76E4（同 工具/游戏取材/边城贴图.py 的水），贴图自带透明度 180/255 按半透明画；波纹、菲涅尔、天光反射和别的水同一段（lib/水面.ts）。
// 贴图动画跟全局时间走，这里按画面帧号算（Remotion 逐帧独立）。
import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { selfLight } from '../../../engine/light/光照配比.ts';
import { png } from '../../../engine/model/贴图.ts';
import { patchWaterShader } from '../../../engine/voxel/水面.ts';
import { fallPool } from './布局/共用.ts';
import stillUri from 'asset:贴图/场景/边城/水面';

export const poolSurfaceZ = fallPool.waterTop - 1 + 8 / 9;

const FRAME_TICKS = 2;
let frames: THREE.DataTexture[] | null = null;
const waterFrames = () => {
  if (frames) return frames;
  const strip = png(stillUri);
  const size = strip.w;
  frames = Array.from({ length: strip.h / size }, (_, k) => {
    const tex = new THREE.DataTexture(strip.px.slice(k * size * size * 4, (k + 1) * size * size * 4), size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  });
  return frames;
};

let mat: THREE.MeshStandardMaterial | null = null;
const waterMaterial = () => {
  if (mat) return mat;
  const material = new THREE.MeshStandardMaterial({ map: waterFrames()[0], color: '#3F76E4', roughness: 0.1, metalness: 0, transparent: true, depthWrite: false, emissive: '#ffffff' });
  material.onBeforeCompile = (sh) => {
    // 打底的自发光同 lib/方块网格.tsx：颜色 × 自发光系数
    sh.uniforms.selfLight = selfLight;
    sh.fragmentShader = 'uniform float selfLight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * selfLight;');
    patchWaterShader(sh);
  };
  material.customProgramCacheKey = () => '边城水池';
  material.userData.水面 = true;
  mat = material;
  return material;
};

// 一整片水面：每格一张贴图（uv = 格坐标，贴图平铺）
const surfaceGeometry = () => {
  const { x0, x1, y0, y1 } = fallPool;
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, poolSurfaceZ);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  return geo;
};

export const PoolWater: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const geo = useMemo(surfaceGeometry, []);
  const material = waterMaterial();
  const all = waterFrames();
  material.map = all[Math.floor((frame / fps) * 20 / FRAME_TICKS) % all.length];
  return <mesh geometry={geo} material={material} receiveShadow />;
};
