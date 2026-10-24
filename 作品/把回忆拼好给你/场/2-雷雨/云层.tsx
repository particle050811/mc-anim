// 第 6、7 句的云层（哪几格、散了多少在 云.ts、编排.ts）：照原版 1.20.1 fancy 云画——一格 12×12×4 的盒子，四面明暗 底 0.7、东西 0.9、南北 0.8（顶 1.0，从下面看不见，不画），
// 云色照原版下雨、打雷时的算法（天气.ts）；透明度 0.8，先只写深度、再按深度相等画颜色（原版分两遍，云自己前后不叠色），雾同地形（原版云也吃地形雾）。
// 两格云挨着的那一面不画（埋在云里）；挨着的那格正在散，这一面露出来就画。光柱撞的那一片云底往光柱色亮（撞亮）。
// 不受平涂的光（MeshBasicMaterial），颜色全在顶点色里（three 当顶点色是线性的，sRGB 数值先换成线性，画出来才是原版那个数）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import cloudsUri from 'asset:贴图/场景/天空/clouds';
import * as 参 from './参数.ts';
import { 云厚, 云格, 云格们, 云心, type 云格子 } from './云.ts';
import { 补雾 } from './天.tsx';
import type { RGB } from './天气.ts';

let 格们缓存: 云格子[] | undefined;
/** clouds.png 里铺得到的那些格（不透明像素） */
const 全部云格 = () => {
  if (!格们缓存) {
    const p = png(cloudsUri);
    格们缓存 = 云格们((u, v) => p.px[(v * p.w + u) * 4 + 3]! > 0);
  }
  return 格们缓存;
};

const 明暗 = { 底: 0.7, 东西: 0.9, 南北: 0.8 } as const;
const 线性 = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const 云透明 = 0.8;

let 材质们: { 深度: THREE.MeshBasicMaterial; 颜色: THREE.MeshBasicMaterial } | undefined;
const 取材质 = () => {
  if (!材质们) {
    const 共 = { vertexColors: true, side: THREE.FrontSide, toneMapped: false, fog: false } as const;
    材质们 = {
      深度: 补雾(new THREE.MeshBasicMaterial({ ...共, colorWrite: false })),
      颜色: 补雾(new THREE.MeshBasicMaterial({ ...共, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth })),
    };
  }
  return 材质们;
};

export type 云层参数 = {
  /** 每一格还剩多少（0～1，0 = 散完不画） */
  剩: (c: 云格子) => number;
  /** 往东挪了多少（格） */
  飘: number;
  /** 云顶色（sRGB 数值） */
  色: RGB;
  /** 光柱撞云：心（场景 x、y）、亮（0～1，往 撞色 混多少，离心 参.撞云.半径 以外不亮） */
  撞: { 心: readonly [number, number]; 亮: number; 色: RGB };
};

/** 云层（Z 朝上的场景内容）：云底在 参.云底高 */
export const 云层: React.FC<云层参数> = ({ 剩, 飘, 色, 撞 }) => {
  const 格们 = 全部云格();
  const geo = useMemo(() => {
    const 表 = new Map<string, number>();
    for (const c of 格们) {
      const s = 剩(c);
      if (s > 0) 表.set(`${c.a},${c.b}`, s);
    }
    const pos: number[] = [];
    const col: number[] = [];
    const z0 = 参.云底高, z1 = 参.云底高 + 云厚;
    const 面 = (p0: number[], p1: number[], p2: number[], p3: number[], rgb: RGB, 明: number, α: number) => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const [r, g, b] = [线性(rgb[0] * 明), 线性(rgb[1] * 明), 线性(rgb[2] * 明)];
      for (let k = 0; k < 6; k++) col.push(r, g, b, α);
    };
    for (const c of 格们) {
      const s = 表.get(`${c.a},${c.b}`);
      if (s === undefined) continue;
      const [cx, cy] = 云心(c, 飘);
      const 撞w = 撞.亮 * Math.max(0, 1 - Math.hypot(cx - 撞.心[0], cy - 撞.心[1]) / 参.撞云.半径);
      const rgb: RGB = [色[0] + (撞.色[0] - 色[0]) * 撞w, 色[1] + (撞.色[1] - 色[1]) * 撞w, 色[2] + (撞.色[2] - 色[2]) * 撞w];
      const α = 云透明 * s;
      const [x0, x1, y0, y1] = [cx - 云格 / 2, cx + 云格 / 2, cy - 云格 / 2, cy + 云格 / 2];
      // 挨着的那格完好（剩 1）这一面就埋在云里
      const 露 = (da: number, db: number) => (表.get(`${c.a + da},${c.b + db}`) ?? 0) < 1 || s < 1;
      // 朝外的面（从外面看逆时针）：底朝下，四个侧面各朝东、西、北、南
      面([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], rgb, 明暗.底, α);
      if (露(1, 0)) 面([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], rgb, 明暗.东西, α);
      if (露(-1, 0)) 面([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], rgb, 明暗.东西, α);
      if (露(0, 1)) 面([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], rgb, 明暗.南北, α);
      if (露(0, -1)) 面([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], rgb, 明暗.南北, α);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    return g;
  }, [格们, 剩, 飘, 色, 撞]);
  useEffect(() => () => geo.dispose(), [geo]);
  const m = 取材质();
  return (
    <>
      <mesh geometry={geo} material={m.深度} frustumCulled={false} renderOrder={10} />
      <mesh geometry={geo} material={m.颜色} frustumCulled={false} renderOrder={11} />
    </>
  );
};
