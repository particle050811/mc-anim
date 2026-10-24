// 放进 3D 场景里的一张照片（05-画风 原则 8：平面的东西当一张片放进 3D）：正面朝南（朝侧剖面的镜头）、竖着，白边照 照片画.ts 的 相纸。
// 用法：放进三渲二画布的场景内容里（Z 朝上，单位格），<照片 画={…} 底={[x, y, z]} />；要描边就包在 <描边> 里。
// 内容可换：画 给一张 像素画（现在是 照片画.ts 的四张顶替画），以后那几句做出来换成真帧。
// 一个照片像素 = 1/16 格（和方块贴图像素一样大），位置吸到 1/16 格上，正交机位里照片的像素和方块的像素对齐（缩放不是 1 时不吸）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { sRGB转线性 } from '@engine/model/方块拼搭.tsx';
import { MC面明暗 } from '@engine/三渲二/平涂.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { 照片像素, 照片尺寸, type 像素画 } from './照片画.ts';

const 贴图缓存 = new Map<像素画, THREE.DataTexture>();
const 贴图 = (画: 像素画) => {
  let t = 贴图缓存.get(画);
  if (!t) {
    const { 宽, 高 } = 照片尺寸(画);
    t = new THREE.DataTexture(照片像素(画), 宽, 高, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    贴图缓存.set(画, t);
  }
  return t;
};

const 吸 = (v: number) => Math.round(v * 16) / 16;

export type 照片属性 = {
  画: 像素画;
  /** 照片下边的中点（场景坐标，格） */
  底: V3;
  /** 整张缩放（1 = 一个照片像素 1/16 格），往箱子里放时缩小 */
  缩放?: number;
};

export const 照片: React.FC<照片属性> = ({ 画, 底, 缩放 = 1 }) => {
  const { 宽, 高 } = 照片尺寸(画);
  const w = (宽 / 16) * 缩放;
  const h = (高 / 16) * 缩放;
  const mat = useMemo(() => {
    // 朝南的面平涂会乘 0.8（MC 面明暗），相纸就成了灰的；照片是拿在手里的物件，材质色补回去，平涂后还是贴图原色乘色调
    const m = new THREE.MeshStandardMaterial({ map: 贴图(画), roughness: 1, metalness: 0 });
    m.color.setScalar(sRGB转线性(1 / MC面明暗.南北));
    return m;
  }, [画]);
  useEffect(() => () => mat.dispose(), [mat]);
  // 贴图第 0 行在上：flipY 关着时 v = 0 取第 0 行，所以把平面的 v 倒过来
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let q = 0; q < uv.count; q++) uv.setY(q, 1 - uv.getY(q));
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  const 整 = 缩放 === 1;
  const x = 整 ? 吸(底[0]) : 底[0];
  const z = 整 ? 吸(底[2]) : 底[2];
  // PlaneGeometry 在 XY 平面、法线 +Z；绕 X 转 90° 后法线朝 −Y（南）、贴图的上朝 +Z
  return <mesh geometry={geom} material={mat} position={[x, 底[1], z + h / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[w, h, 1]} />;
};
