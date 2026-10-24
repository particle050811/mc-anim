// 原版 1.20.1 fancy 云的画法（哪几格、散了多少在 原版云.ts）：一格 12×12×4 的盒子，四面明暗 底 0.7、东西 0.9、南北 0.8（顶 1.0，从下面看不见，不画），
// 透明度 0.8，先只写深度、再按深度相等画颜色（原版分两遍，云自己前后不叠色）；两格云挨着的那一面不画（埋在云里），挨着的那格正在散，这一面露出来就画。
// 不受平涂的光（MeshBasicMaterial），颜色全在顶点色里（three 当顶点色是线性的，sRGB 数值先换成线性，画出来才是原版那个数）。雾由用的地方补（原版云也吃地形雾）。
// 出处：照 末地雷雨 那一路 9f33adf（到 e21e5c6 没再改）的 场/2-雷雨/云层.tsx 抄来，去掉了光柱撞云那一块（第 8 句用不着）；两边合进 main 以后该留一份。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import cloudsUri from 'asset:贴图/场景/天空/clouds';
import { 云厚, 云格, 云格们, 云心, type 云格子 } from './原版云.ts';

export type RGB = readonly [number, number, number];

let 格们缓存: 云格子[] | undefined;
/** clouds.png 里铺得到的那些格（不透明像素），按 原版云.ts 的 小木屋上空云 铺 */
export const 全部云格 = () => {
  if (!格们缓存) {
    const p = png(cloudsUri);
    格们缓存 = 云格们((u, v) => p.px[(v * p.w + u) * 4 + 3]! > 0);
  }
  return 格们缓存;
};

const 明暗 = { 底: 0.7, 东西: 0.9, 南北: 0.8 } as const;
const 线性 = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const 云透明 = 0.8;

export type 云材质们 = { 深度: THREE.MeshBasicMaterial; 颜色: THREE.MeshBasicMaterial };
/** 云的两遍材质；补雾 = 给材质补雾的办法（用的地方的雾） */
export const 做云材质们 = (补雾: <M extends THREE.Material>(m: M) => M): 云材质们 => {
  const 共 = { vertexColors: true, side: THREE.FrontSide, toneMapped: false, fog: false } as const;
  return {
    深度: 补雾(new THREE.MeshBasicMaterial({ ...共, colorWrite: false })),
    颜色: 补雾(new THREE.MeshBasicMaterial({ ...共, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth })),
  };
};

export type 原版云层参数 = {
  /** 每一格还剩多少（0～1，0 = 散完不画） */
  剩: (c: 云格子) => number;
  /** 往东挪了多少（格） */
  飘: number;
  /** 云顶色（sRGB 数值） */
  色: RGB;
  /** 云底离地面多高（格） */
  底高: number;
  材质们: 云材质们;
};

/** 云层（Z 朝上的场景内容） */
export const 原版云层: React.FC<原版云层参数> = ({ 剩, 飘, 色, 底高, 材质们 }) => {
  const 格们 = 全部云格();
  const geo = useMemo(() => {
    const 表 = new Map<string, number>();
    for (const c of 格们) {
      const s = 剩(c);
      if (s > 0) 表.set(`${c.a},${c.b}`, s);
    }
    const pos: number[] = [];
    const col: number[] = [];
    const z0 = 底高, z1 = 底高 + 云厚;
    const 面 = (p0: number[], p1: number[], p2: number[], p3: number[], 明: number, α: number) => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const [r, g, b] = [线性(色[0] * 明), 线性(色[1] * 明), 线性(色[2] * 明)];
      for (let k = 0; k < 6; k++) col.push(r, g, b, α);
    };
    for (const c of 格们) {
      const s = 表.get(`${c.a},${c.b}`);
      if (s === undefined) continue;
      const [cx, cy] = 云心(c, 飘);
      const α = 云透明 * s;
      const [x0, x1, y0, y1] = [cx - 云格 / 2, cx + 云格 / 2, cy - 云格 / 2, cy + 云格 / 2];
      // 挨着的那格完好（剩 1）这一面就埋在云里
      const 露 = (da: number, db: number) => (表.get(`${c.a + da},${c.b + db}`) ?? 0) < 1 || s < 1;
      // 朝外的面（从外面看逆时针）：底朝下，四个侧面各朝东、西、北、南
      面([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], 明暗.底, α);
      if (露(1, 0)) 面([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 明暗.东西, α);
      if (露(-1, 0)) 面([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], 明暗.东西, α);
      if (露(0, 1)) 面([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], 明暗.南北, α);
      if (露(0, -1)) 面([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 明暗.南北, α);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    return g;
  }, [格们, 剩, 飘, 色, 底高]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <mesh geometry={geo} material={材质们.深度} frustumCulled={false} renderOrder={10} />
      <mesh geometry={geo} material={材质们.颜色} frustumCulled={false} renderOrder={11} />
    </>
  );
};
