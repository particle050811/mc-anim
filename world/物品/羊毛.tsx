// 羊毛方块：李樱在古城里跳搭铺路的原版羊毛（默认白色 textures/block/white_wool.png，16 种颜色都导出了，npm run 取材 -- 羊毛）。
// 模型是 block/cube_all：整格立方体，六面同一张贴图，贴图坐标照原版自动 UV（同 工具/游戏取材/资源包.py 的 UAX/VAX）。一次画很多块：合成一个网格，相邻两块互相挡住的面照游戏不画（cullface 剔除）。
// 材质同 lib/方块网格.tsx：MeshStandardMaterial（粗糙度 0.95）× 场景灯光 + 0.4 倍贴图亮度自发光打底；羊毛不染色，顶点色是 1。
// 和游戏不同：不算环境光遮蔽（贴着地面、墙角不会变暗）；只剔除羊毛之间的面，贴着别的方块的面照画（被挡住不影响画面）。
// 坐标：blocks 是每块的方块底面中心（场景坐标 Z 朝上、南 = −Y，1 = 一格），要落在格子上（x、y 是 .5，z 是整数）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { pngDir } from '../../engine/model/贴图.ts';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/物品/羊毛/black_wool';
import 资_1 from 'asset:贴图/物品/羊毛/blue_wool';
import 资_2 from 'asset:贴图/物品/羊毛/brown_wool';
import 资_3 from 'asset:贴图/物品/羊毛/cyan_wool';
import 资_4 from 'asset:贴图/物品/羊毛/gray_wool';
import 资_5 from 'asset:贴图/物品/羊毛/green_wool';
import 资_6 from 'asset:贴图/物品/羊毛/light_blue_wool';
import 资_7 from 'asset:贴图/物品/羊毛/light_gray_wool';
import 资_8 from 'asset:贴图/物品/羊毛/lime_wool';
import 资_9 from 'asset:贴图/物品/羊毛/magenta_wool';
import 资_10 from 'asset:贴图/物品/羊毛/orange_wool';
import 资_11 from 'asset:贴图/物品/羊毛/pink_wool';
import 资_12 from 'asset:贴图/物品/羊毛/purple_wool';
import 资_13 from 'asset:贴图/物品/羊毛/red_wool';
import 资_14 from 'asset:贴图/物品/羊毛/white_wool';
import 资_15 from 'asset:贴图/物品/羊毛/yellow_wool';

const TEXTURES = pngDir(资产目录({ './black_wool.png': 资_0, './blue_wool.png': 资_1, './brown_wool.png': 资_2, './cyan_wool.png': 资_3, './gray_wool.png': 资_4, './green_wool.png': 资_5, './light_blue_wool.png': 资_6, './light_gray_wool.png': 资_7, './lime_wool.png': 资_8, './magenta_wool.png': 资_9, './orange_wool.png': 资_10, './pink_wool.png': 资_11, './purple_wool.png': 资_12, './red_wool.png': 资_13, './white_wool.png': 资_14, './yellow_wool.png': 资_15 }));
export type WoolColor =
  | 'white' | 'orange' | 'magenta' | 'light_blue' | 'yellow' | 'lime' | 'pink' | 'gray'
  | 'light_gray' | 'cyan' | 'purple' | 'blue' | 'brown' | 'green' | 'red' | 'black';

const texCache = new Map<string, THREE.DataTexture>();
const woolTex = (color: string) => {
  let t = texCache.get(color);
  if (!t) {
    const srcPng = TEXTURES[`${color}_wool`];
    if (!srcPng) throw new Error(`没有 ${color}_wool 的贴图，现有：${Object.keys(TEXTURES).join('、')}`);
    t = new THREE.DataTexture(srcPng.px, srcPng.w, srcPng.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    // 和方块网格一样做多级纹理（远处不出摩尔纹）
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    texCache.set(color, t);
  }
  return t;
};

// 六个面（场景坐标）：法线、贴图 u 方向、v 方向（v 指向贴图的下方）。由游戏的 UAX / VAX 换到场景坐标 (x, −z, y) 得到
// 游戏：up u=+x v=+z；down u=+x v=−z；north u=−x v=−y；south u=+x v=−y；west u=+z v=−y；east u=−z v=−y
const FACES: { n: V3; u: V3; v: V3; d: V3 }[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], d: [0, 0, 1] }, // 上
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], d: [0, 0, -1] }, // 下
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, -1], d: [0, 1, 0] }, // 北（场景 +Y）
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], d: [0, -1, 0] }, // 南（场景 −Y）
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, -1], d: [-1, 0, 0] }, // 西
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, -1], d: [1, 0, 0] }, // 东
];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

const build = (blocks: V3[]) => {
  // 方块的最小角（整数格）
  const cells = blocks.map(([x, y, z]) => [Math.round(x - 0.5), Math.round(y - 0.5), Math.round(z)] as V3);
  const set = new Set(cells.map((c) => key(...c)));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const [cx, cy, cz] of cells) {
    for (const face of FACES) {
      if (set.has(key(cx + face.d[0], cy + face.d[1], cz + face.d[2]))) continue;
      // 面中心 = 方块中心 + 法线×0.5；四个角：左上、右上、右下、左下（从外面看）= 中心 + (∓u ± v)/2
      const center = [cx + 0.5 + face.n[0] * 0.5, cy + 0.5 + face.n[1] * 0.5, cz + 0.5 + face.n[2] * 0.5];
      const base = pos.length / 3;
      const corners: [number, number, number, number][] = [
        [-1, -1, 0, 0],
        [1, -1, 1, 0],
        [1, 1, 1, 1],
        [-1, 1, 0, 1],
      ];
      for (const [su, sv, tu, tv] of corners) {
        pos.push(center[0] + (su * face.u[0] + sv * face.v[0]) / 2, center[1] + (su * face.u[1] + sv * face.v[1]) / 2, center[2] + (su * face.u[2] + sv * face.v[2]) / 2);
        nor.push(...face.n);
        uv.push(tu, tv);
      }
      // 左上 → 右上 → 右下从外面看是顺时针，three 的正面是逆时针，所以倒过来连（和 方块模型.tsx 一样）
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
};

// blocks：每块的方块底面中心；color：羊毛颜色（默认白）
export const WoolBlocks: React.FC<{ blocks: V3[]; color?: WoolColor | string }> = ({ blocks, color = 'white' }) => {
  const sig = blocks.map((b) => b.join(',')).join(';');
  const geo = useMemo(() => build(blocks), [sig]);
  const mat = useMemo(() => {
    const map = woolTex(color);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4 });
  }, [color]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
};
