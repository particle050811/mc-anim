// 告示牌上的字（门口小木屋 的 告示牌字 传它）：原版 SignRenderer 的排法，四行、行高 10 个字像素、一个字像素 1/96 格（告示牌尺寸），
// 每行水平居中；默认黑字（DyeColor.BLACK，不发光的字原版按 0.4 压暗，黑还是黑）。字形用本作品的像素字（像素字文案.txt 里要有这些字）。
// 画法：字画进一张小画布（一个字像素 2 个画布像素，unihex 的半像素点也画得下），贴在一片朝南的薄片上，最近邻、不透明的点才画（alphaTest）。
// 第 9 句写下「明年六月见」以后，第 13、14、15 句告示牌上一直有这行字。N = 6 时一个字像素只有 1 个成片像素，只看得出一行字，读不出来。
// 发光（可选，默认不发光）：原版用发光墨囊涂过的字（SignRenderer：黑字的描边换成 #F0EBCC，八个方向各偏一个字像素先画一遍描边色，再画字，满亮度）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { 像素字 } from '../界面/像素字.ts';
import { 告示牌尺寸 } from './告示牌.tsx';

/** 一个字像素几个画布像素 */
const 画布倍 = 2;

/** 原版发光字的描边色：黑字用 #F0EBCC，别的颜色是字色 × 0.4 */
const 发光描边色 = (色: string) => {
  if (色.toLowerCase() === '#000000') return '#f0ebcc';
  const n = parseInt(色.slice(1), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.floor(v * 0.4).toString(16).padStart(2, '0')).join('')}`;
};
const 八方 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

export const 告示牌像素字: React.FC<{ 行们: readonly string[]; 色?: string; 发光?: boolean }> = ({ 行们, 色 = '#000000', 发光 = false }) => {
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
      const w = 像素字.字宽(t);
      // 原版：第 i 行顶在 i·10 − 20（以字面中心为 0），每行按字宽居中
      const x = W / 2 - w / 2, y = H / 2 + i * 10 - 20;
      if (发光) for (const [dx, dy] of 八方) 像素字.画(ctx, t, { x: 0, y: 0 }, x + dx, y + dy, 发光描边色(色), 画布倍);
      像素字.画(ctx, t, { x: 0, y: 0 }, x, y, 色, 画布倍);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
    return { 材质: m, 宽: W * 告示牌尺寸.字像素, 高: H * 告示牌尺寸.字像素 };
  }, [键, 色, 发光]);
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
