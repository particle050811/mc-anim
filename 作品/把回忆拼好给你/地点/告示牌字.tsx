// 告示牌上的字（门口小木屋 的 告示牌字 传它）：原版 SignRenderer 的排法，四行、行高 10 个字像素、一个字像素 1/96 格（告示牌尺寸），
// 每行水平居中（原版 −width / 2 按整数除）；默认黑字（DyeColor.BLACK，不发光的字原版按 0.4 压暗，黑还是黑）。字形用 告示牌字表（告示牌字文案.txt 里要有这些字）。
// 画法：字画进一张小画布（一个字像素 2 个画布像素，unihex 的半像素点也画得下），贴在一片朝南的薄片上，最近邻、不透明的点才画（alphaTest）。
// 一个 unihex 点 = 1/192 格 = N/12 个成片像素：N 取 12 的倍数，点的边才都落在整像素上。
// 发光（可选，默认不发光）：原版用发光墨囊涂过的字满亮度画字色；描边（SignRenderer.isOutlineVisible）黑字总画、别的颜色离镜头 16 格以内才画，
// 先八个方向各偏一个字像素画一遍描边色（黑字用 #F0EBCC，别的颜色是字色 × 0.4），再画字。汉字笔画细，描边会把笔画缝填满（用户 10-24 嫌「字怎么这么脏」）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { 告示牌尺寸 } from './告示牌.tsx';
import { 告示牌字表 } from './告示牌字表.ts';

/** 一个字像素几个画布像素 */
const 画布倍 = 2;

/** 原版发光字的描边色：黑字用 #F0EBCC，别的颜色是字色 × 0.4 */
const 发光描边色 = (色: string) => {
  if (色.toLowerCase() === '#000000') return '#f0ebcc';
  const n = parseInt(色.slice(1), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.floor(v * 0.4).toString(16).padStart(2, '0')).join('')}`;
};
const 八方 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

export type 告示牌像素字属性 = {
  行们: readonly string[];
  /** 字色（原版 DyeColor 的 textColor） */
  色?: string;
  /** 涂过发光墨囊 */
  发光?: boolean;
  /** 发光字画不画描边：不写照原版（黑字画；别的颜色当作镜头在 16 格外，不画） */
  描边?: boolean;
};

export const 告示牌像素字: React.FC<告示牌像素字属性> = ({ 行们, 色 = '#000000', 发光 = false, 描边 }) => {
  const 画描边 = 发光 && (描边 ?? 色.toLowerCase() === '#000000');
  const 键 = 行们.join('\n');
  const { 材质, 宽, 高 } = useMemo(() => {
    const 行 = 键.split('\n');
    if (行.length > 4) throw new Error(`告示牌最多四行：${行.length} 行`);
    // 画布按四行、最宽 90 个字像素建（告示牌尺寸.字面），字面中心就是画布中心
    const W = 90, H = 40;
    const c = document.createElement('canvas');
    c.width = W * 画布倍;
    c.height = H * 画布倍;
    const ctx = c.getContext('2d')!;
    行.forEach((t, i) => {
      if (!t) return;
      // 原版：第 i 行顶在 i·10 − 20、左边在 −width / 2（Java 整数除，往 0 取整；以字面中心为 0）
      const x = W / 2 + Math.trunc(-告示牌字表.字宽(t) / 2), y = H / 2 + i * 10 - 20;
      if (画描边) for (const [dx, dy] of 八方) 告示牌字表.画(ctx, t, { x: 0, y: 0 }, x + dx, y + dy, 发光描边色(色), 画布倍);
      告示牌字表.画(ctx, t, { x: 0, y: 0 }, x, y, 色, 画布倍);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
    return { 材质: m, 宽: W * 告示牌尺寸.字像素, 高: H * 告示牌尺寸.字像素 };
  }, [键, 色, 画描边]);
  useEffect(
    () => () => {
      材质.map?.dispose();
      材质.dispose();
    },
    [材质],
  );
  // 薄片默认朝 +Z（上），绕 X 转 90° 朝南（−Y）、画布的上边朝上
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} material={材质} renderOrder={3}>
      <planeGeometry args={[宽, 高]} />
    </mesh>
  );
};
