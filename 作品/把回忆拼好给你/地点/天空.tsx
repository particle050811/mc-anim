// 侧剖面的天：一块贴在机位最远处的平面，颜色从地平线往上渐变，一个贴图像素一行（和方块的像素一样大）；太阳、月亮用原版贴图按 天体.ts 的位置画。
// 原版画太阳、月亮是叠加混合（RenderSystem.blendFuncSeparate(SRC_ALPHA, ONE, ...)），贴图黑底叠上去就没了；位置吸到贴图像素格上。
// 放在 Z 朝上的 group 里用（同 侧剖面.tsx）。
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { png } from '@engine/model/贴图.ts';
import sunPng from 'asset:贴图/环境/太阳';
import moonPng from 'asset:贴图/环境/月相';
import { 出片倍数, type 侧取景 } from './侧剖面.tsx';
import { 天亮, 天体位置, type 天弧 } from './天体.ts';

const 远 = 400;
const 吸 = (v: number) => Math.round(v * 16) / 16;

/** 天色：地平 = 地面线那里的颜色，顶 = 往上 渐变高 格以上的颜色（sRGB）；夜里两个都换成 夜 的颜色（按 天亮 混） */
export type 天色 = { 地平: string; 顶: string; 渐变高: number; 夜地平: string; 夜顶: string };

const 混 = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

/** 刻：游戏时间（天体.ts）；弧：太阳月亮走的圆弧，不给就不画太阳月亮；明暗幅度：天随昼夜变暗的程度（1 照原版，0 一直白天的颜色），第 13 句快转时压低 */
export const 侧剖面天空: React.FC<侧取景 & { 色: 天色; 刻?: number; 弧?: 天弧; 明暗幅度?: number }> = ({ 中心, 每格, 色, 刻 = 6000, 弧, 明暗幅度 = 1 }) => {
  const size = useThree((s) => s.size);
  const 半宽 = (size.width * 出片倍数) / 每格 / 2;
  const 半高 = (size.height * 出片倍数) / 每格 / 2;
  const 亮 = 1 - 明暗幅度 * (1 - 天亮(刻));
  const 底 = Math.floor((中心[1] - 半高) * 16) / 16;
  const 行数 = Math.ceil((中心[1] + 半高 - 底) * 16);
  const key = `${色.地平}|${色.顶}|${色.夜地平}|${色.夜顶}|${色.渐变高}|${底}|${行数}|${亮.toFixed(3)}`;
  const tex = useMemo(() => {
    // 颜色按 sRGB 数值插（像素画的渐变），一行一个贴图像素
    const c = (s: string) => new THREE.Color().setStyle(s, THREE.LinearSRGBColorSpace);
    const 地平 = 混(c(色.夜地平), c(色.地平), 亮);
    const 顶 = 混(c(色.夜顶), c(色.顶), 亮);
    const data = new Uint8Array(行数 * 4);
    for (let r = 0; r < 行数; r++) {
      const z = 底 + (r + 0.5) / 16;
      const t = Math.min(1, Math.max(0, z / 色.渐变高));
      const k = 混(地平, 顶, Math.sqrt(t));
      // 平面的 v = 0 在下边，DataTexture 第 0 行也在 v = 0，所以第 r 行（从下往上数）就放第 r 行
      data.set([Math.round(k.r * 255), Math.round(k.g * 255), Math.round(k.b * 255), 255], r * 4);
    }
    const t = new THREE.DataTexture(data, 1, 行数, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [key]);
  const 高 = 行数 / 16;
  const 位 = 弧 ? 天体位置(刻, 弧) : null;
  return (
    <group>
      <mesh position={[中心[0], 远, 底 + 高 / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-2}>
        <planeGeometry args={[半宽 * 2 + 2, 高]} />
        <meshBasicMaterial map={tex} depthWrite={false} toneMapped={false} />
      </mesh>
      {位 && <天体片 种="太阳" x={位.太阳.x} z={位.太阳.z} />}
      {位 && <天体片 种="月亮" x={位.月亮.x} z={位.月亮.z} 相={位.月亮.相} />}
    </group>
  );
};

const 太阳贴图 = () => entityTexture(png(sunPng));
const 月亮贴图 = () => entityTexture(png(moonPng));

/** 太阳、月亮一张贴图 32×32 像素（月相图里一格），画成 2×2 格 */
const 天体片: React.FC<{ 种: '太阳' | '月亮'; x: number; z: number; 相?: number }> = ({ 种, x, z, 相 = 0 }) => {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2);
    if (种 === '月亮') {
      // 月相图 4 列 2 行；DataTexture 第 0 行在 v = 0（图的上边），所以 v 朝下数
      const u0 = (相 % 4) / 4, v0 = Math.floor(相 / 4) / 2;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) / 4, v0 + (1 - uv.getY(q)) / 2);
    } else {
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setY(q, 1 - uv.getY(q));
    }
    return g;
  }, [种, 相]);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: 种 === '太阳' ? 太阳贴图() : 月亮贴图(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [种],
  );
  return <mesh geometry={geom} material={mat} position={[吸(x), 远 - 1, 吸(z)]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-1} />;
};
