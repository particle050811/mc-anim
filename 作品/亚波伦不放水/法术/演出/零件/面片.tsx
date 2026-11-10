// 朝镜头的贴图面片（游戏里的粒子 SingleQuadParticle、物品片 ThrownItemRenderer 这类永远正对镜头的方片），同一张贴图的实例化一次画完。
// 和 @库/特效/粒子面片.tsx 的 ParticleQuads 同一个画法，多了三样法术要用的：加色混合、绕视线转（粒子的 roll）、宽高不等。
// 一张贴图一批：序列帧的粒子按帧分批，用 序列帧() 取当前帧。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 混合参数, 贴图, type 混合, type 色 } from './材质.ts';

export type 面片项 = {
  位: 点;
  /** 半边长（游戏的 quadSize）；半高不给 = 方的 */
  半宽: number;
  半高?: number;
  色?: 色;
  透明度?: number;
  /** 绕视线转的弧度（粒子的 roll） */
  转角?: number;
  /** [U0, V0, U1, V1]：画面左、上、右、下对应的贴图坐标；不给 = 整张 */
  uv?: readonly [number, number, number, number];
};

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec2 corner;
attribute vec3 iCenter;
attribute vec3 iSize;
attribute vec4 iUv;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = vec2(mix(iUv.x, iUv.z, corner.x * 0.5 + 0.5), mix(iUv.w, iUv.y, corner.y * 0.5 + 0.5));
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iCenter, 1.0);
  vec2 o = corner * iSize.xy;
  float c = cos(iSize.z);
  float s = sin(iSize.z);
  mvPosition.xy += vec2(o.x * c - o.y * s, o.x * s + o.y * c);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;
const FRAG = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform float alphaTest;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vUv) * vColor;
  if (c.a < alphaTest) discard;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export const 面片们: React.FC<{ 图: Png; 项: readonly 面片项[]; 混合?: 混合; 写深度?: boolean }> = ({ 图, 项, 混合 = '镂空', 写深度 }) => {
  const 数 = 项.length;
  const 容量 = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, 数))));
  const { mesh, geo } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(容量 * 3), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(容量 * 3), 3));
    g.setAttribute('iUv', new THREE.InstancedBufferAttribute(new Float32Array(容量 * 4), 4));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(容量 * 4), 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, alphaTest: { value: 混合 === '镂空' ? 0.1 : 0.004 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      side: THREE.DoubleSide,
      ...混合参数(混合, 写深度),
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return { mesh: m, geo: g };
  }, [容量, 混合, 写深度]);
  useEffect(() => () => {
    geo.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [geo, mesh]);
  (mesh.material as THREE.ShaderMaterial).uniforms.map!.value = 贴图(图);
  const 心 = geo.getAttribute('iCenter') as THREE.InstancedBufferAttribute;
  const 大 = geo.getAttribute('iSize') as THREE.InstancedBufferAttribute;
  const uv = geo.getAttribute('iUv') as THREE.InstancedBufferAttribute;
  const 彩 = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
  项.forEach((it, i) => {
    心.setXYZ(i, it.位[0], it.位[1], it.位[2]);
    大.setXYZ(i, it.半宽, it.半高 ?? it.半宽, it.转角 ?? 0);
    const q = it.uv ?? [0, 0, 1, 1];
    uv.setXYZW(i, q[0], q[1], q[2], q[3]);
    const c = it.色 ?? [1, 1, 1];
    // 颜色是乘在 sRGB 贴图上的系数，着色器在线性空间里乘，先换成线性
    彩.setXYZW(i, s2l(c[0]), s2l(c[1]), s2l(c[2]), it.透明度 ?? 1);
  });
  for (const a of [心, 大, uv, 彩]) a.needsUpdate = true;
  geo.instanceCount = 数;
  return 数 > 0 ? <primitive object={mesh} /> : null;
};

/** 单张面片 */
export const 面片: React.FC<面片项 & { 图: Png; 混合?: 混合; 写深度?: boolean }> = ({ 图, 混合, 写深度, ...项 }) => <面片们 图={图} 项={[项]} 混合={混合} 写深度={写深度} />;

/** 序列帧：第 序号 帧（向下取整）；循环 = 超出从头再来，否则停在最后一帧 */
export const 序列帧 = <T,>(帧们: readonly T[], 序号: number, 循环 = false): T => {
  const n = 帧们.length;
  const i = Math.floor(序号);
  return 帧们[循环 ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))]!;
};
