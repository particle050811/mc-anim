// 原版方块云的画法（哪几格、散了多少在 ./原版方块.ts）：一格 12×12×4 的盒子，四面明暗 底 0.7、东西 0.9、南北 0.8（顶 1.0，从下面看不见，不画），
// 透明度 0.8，先只写深度、再按深度相等画颜色（原版分两遍，云自己前后不叠色）；两格云挨着的那一面不画（埋在云里），挨着的那格正在散，这一面露出来就画。
// 不受平涂的光（MeshBasicMaterial），颜色全在顶点色里（three 当顶点色是线性的，sRGB 数值先换成线性，画出来才是原版那个数）。雾由用的地方补（原版云也吃地形雾）。
// 撞 = 光柱撞的那一片云底往光柱色亮（作品/把回忆拼好给你 第 7 句，演绎）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { png } from '../../model/贴图.ts';
import cloudsUri from 'asset:贴图/场景/天空/clouds';
import { cloudThickness, cloudCell, cloudCells, cloudCenter, type CloudCell, type CloudExtent } from './原版方块.ts';

export type RGB = readonly [number, number, number];

const cellCache = new Map<string, CloudCell[]>();
/** clouds.png 里铺得到的那些格（不透明像素） */
export const allCloudCells = (offset: readonly [number, number], extent: CloudExtent) => {
  const cacheKey = JSON.stringify([offset, extent]);
  let r = cellCache.get(cacheKey);
  if (!r) {
    const p = png(cloudsUri);
    r = cloudCells((u, v) => p.px[(v * p.w + u) * 4 + 3]! > 0, offset, extent);
    cellCache.set(cacheKey, r);
  }
  return r;
};

const faceShade = { bottom: 0.7, eastWest: 0.9, northSouth: 0.8 } as const;
const srgbToLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const cloudOpacity = 0.8;

export type CloudMaterials = { depthMaterial: THREE.MeshBasicMaterial; 颜色: THREE.MeshBasicMaterial };
/** 云的两遍材质；补雾 = 给材质补雾的办法（用的地方的雾） */
export const makeCloudMaterials = (applyFog: <M extends THREE.Material>(m: M) => M): CloudMaterials => {
  const baseOpts = { vertexColors: true, side: THREE.FrontSide, toneMapped: false, fog: false } as const;
  return {
    depthMaterial: applyFog(new THREE.MeshBasicMaterial({ ...baseOpts, colorWrite: false })),
    颜色: applyFog(new THREE.MeshBasicMaterial({ ...baseOpts, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth })),
  };
};

export type VanillaBlockCloudParams = {
  /** clouds.png 在世界里平移多少格、铺多大一片（格） */
  offset: readonly [number, number];
  extent: CloudExtent;
  /** 每一格还剩多少（0～1，0 = 散完不画） */
  remain: (c: CloudCell) => number;
  /** 往东挪了多少（格） */
  drift: number;
  /** 云顶色（sRGB 数值） */
  色: RGB;
  /** 云底的高度（场景 z，格） */
  bottomHeight: number;
  materials: CloudMaterials;
  /** 光柱撞云：心（场景 x、y）、亮（0～1，往 色 混多少）、半径（离心多远以外不亮，格） */
  strike?: { 心: readonly [number, number]; brightness: number; 色: RGB; radius: number };
};

/** 云层（Z 朝上的场景内容） */
export const VanillaBlockCloud: React.FC<VanillaBlockCloudParams> = ({ offset, extent, remain, drift, 色: color, bottomHeight, materials, strike }) => {
  const cells = allCloudCells(offset, extent);
  const geo = useMemo(() => {
    const cloudMap = new Map<string, number>();
    for (const c of cells) {
      const s = remain(c);
      if (s > 0) cloudMap.set(`${c.a},${c.b}`, s);
    }
    const pos: number[] = [];
    const col: number[] = [];
    const z0 = bottomHeight, z1 = bottomHeight + cloudThickness;
    const face = (p0: number[], p1: number[], p2: number[], p3: number[], rgb: RGB, brightness: number, α: number) => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const [r, g, b] = [srgbToLinear(rgb[0] * brightness), srgbToLinear(rgb[1] * brightness), srgbToLinear(rgb[2] * brightness)];
      for (let k = 0; k < 6; k++) col.push(r, g, b, α);
    };
    for (const c of cells) {
      const s = cloudMap.get(`${c.a},${c.b}`);
      if (s === undefined) continue;
      const [cx, cy] = cloudCenter(c, drift);
      let rgb = color;
      if (strike) {
        const w = strike.brightness * Math.max(0, 1 - Math.hypot(cx - strike.心[0], cy - strike.心[1]) / strike.radius);
        rgb = [color[0] + (strike.色[0] - color[0]) * w, color[1] + (strike.色[1] - color[1]) * w, color[2] + (strike.色[2] - color[2]) * w];
      }
      const α = cloudOpacity * s;
      const [x0, x1, y0, y1] = [cx - cloudCell / 2, cx + cloudCell / 2, cy - cloudCell / 2, cy + cloudCell / 2];
      // 挨着的那格完好（剩 1）这一面就埋在云里
      const exposed = (da: number, db: number) => (cloudMap.get(`${c.a + da},${c.b + db}`) ?? 0) < 1 || s < 1;
      // 朝外的面（从外面看逆时针）：底朝下，四个侧面各朝东、西、北、南
      face([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], rgb, faceShade.bottom, α);
      if (exposed(1, 0)) face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], rgb, faceShade.eastWest, α);
      if (exposed(-1, 0)) face([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], rgb, faceShade.eastWest, α);
      if (exposed(0, 1)) face([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], rgb, faceShade.northSouth, α);
      if (exposed(0, -1)) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], rgb, faceShade.northSouth, α);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    return g;
  }, [cells, remain, drift, color, bottomHeight, strike]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <mesh geometry={geo} material={materials.depthMaterial} frustumCulled={false} renderOrder={10} />
      <mesh geometry={geo} material={materials.颜色} frustumCulled={false} renderOrder={11} />
    </>
  );
};
