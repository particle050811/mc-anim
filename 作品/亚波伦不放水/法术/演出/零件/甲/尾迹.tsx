// 朝镜头的尾迹带（Goety 的 TrailEffect + TrailRenderer，出自 Mowzie 那类拖尾）：弹每刻记一个旧位置，画的时候从当前位置往回连，
// 沿点列累计到 长 为止；每个点往「切线 × (点 − 相机)」两边各伸半宽（FACE_CAMERA），所以从哪看都是一条平带。
// 贴图 u 从头（当前位置）1 到尾 0，v 横跨带宽；实心（solid_trail、pointed_trail）alpha 恒 1，否则 alpha = a × 进度（尾巴淡出）。
// 朝镜头的偏移在顶点着色器里用 cameraPosition 现算，组件不用知道机位。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../../接口.ts';
import { 混合参数, 贴图, type 混合, type 色 } from '../材质.ts';
import { 减, 加, 乘, 长 as 向量长, 单位, 弹道位置, type 弹道 } from '../弹道.ts';

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 tangent3;
attribute vec2 uvw;
attribute float side;
uniform float halfWidth;
varying vec2 vUv;
varying float vProg;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 t = normalize(mat3(modelMatrix) * tangent3);
  vec3 o = cross(t, wp.xyz - cameraPosition);
  float l = length(o);
  if (l > 1e-6) wp.xyz += o / l * halfWidth * side;
  vUv = vec2(uvw.x, side * 0.5 + 0.5);
  vProg = uvw.y;
  vec4 mvPosition = viewMatrix * wp;
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
uniform vec4 tint;
uniform float solid;
uniform float alphaTest;
varying vec2 vUv;
varying float vProg;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vUv) * tint;
  c.a *= mix(vProg, 1.0, solid);
  if (c.a < alphaTest) discard;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** 弹的尾迹点列（新的在前）：当前插值位置，再往回每刻一个旧位置。偏 = 加在每个点上的偏移（渲染器记的是 位置 + 半高） */
export const 尾迹点 = (道: 弹道, 刻: number, 选: { 起刻?: number; 最多?: number; 偏?: 点 } = {}): 点[] => {
  const 偏 = 选.偏 ?? [0, 0, 0];
  const 点们: 点[] = [加(弹道位置(道, 刻), 偏)];
  // TrailEffect 在 tickCount > 起刻 之后才开始记，记的是那一刻之前的位置
  for (let n = Math.floor(刻); n >= (选.起刻 ?? 0) && 点们.length < (选.最多 ?? 64); n--) 点们.push(加(道(n), 偏));
  return 点们;
};

export const 尾迹: React.FC<{
  /** 新的在前，场景坐标 */
  点们: readonly 点[];
  /** TrailEffect 的 width（整条宽的一半是它的一半）、length（格） */
  宽: number;
  长: number;
  图: Png;
  色?: 色;
  透明度?: number;
  /** solid：alpha 不随进度淡 */
  实心?: boolean;
  混合?: 混合;
}> = ({ 点们, 宽, 长, 图, 色 = [1, 1, 1], 透明度 = 1, 实心 = false, 混合 = '半透明' }) => {
  const 键 = JSON.stringify(点们);
  const geo = useMemo(() => {
    // 沿点列走到 长 为止，最后一段截断
    const 路: { p: 点; 走: number }[] = [];
    let 走 = 0;
    for (let i = 0; i < 点们.length; i++) {
      const p = 点们[i]!;
      if (i === 0) {
        路.push({ p, 走: 0 });
        continue;
      }
      const 上 = 点们[i - 1]!;
      const 段 = 向量长(减(p, 上));
      if (段 < 1e-6) continue;
      if (走 + 段 >= 长) {
        路.push({ p: 加(上, 乘(单位(减(p, 上)), 长 - 走)), 走: 长 });
        走 = 长;
        break;
      }
      走 += 段;
      路.push({ p, 走 });
    }
    if (路.length < 2 || 走 <= 0) return null;
    const pos: number[] = [];
    const tan: number[] = [];
    const uvw: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    路.forEach(({ p, 走: s }, i) => {
      const t = 单位(减(路[Math.min(路.length - 1, i + 1)]!.p, 路[Math.max(0, i - 1)]!.p));
      const 进度 = (走 - s) / 走;
      for (const 边 of [-1, 1]) {
        pos.push(p[0], p[1], p[2]);
        tan.push(t[0], t[1], t[2]);
        uvw.push(进度, 进度);
        side.push(边);
      }
      if (i > 0) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('tangent3', new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute('uvw', new THREE.Float32BufferAttribute(uvw, 2));
    g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    return g;
  }, [键, 长]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, tint: { value: new THREE.Vector4(1, 1, 1, 1) }, solid: { value: 0 }, halfWidth: { value: 0.1 }, alphaTest: { value: 混合 === '镂空' ? 0.1 : 0.004 } }]),
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
        side: THREE.DoubleSide,
        ...混合参数(混合),
      }),
    [混合],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => geo?.dispose(), [geo]);
  mat.uniforms.map!.value = 贴图(图);
  (mat.uniforms.tint!.value as THREE.Vector4).set(s2l(色[0]), s2l(色[1]), s2l(色[2]), 透明度);
  mat.uniforms.solid!.value = 实心 ? 1 : 0;
  mat.uniforms.halfWidth!.value = 宽 / 2;
  return geo ? <mesh geometry={geo} material={mat} frustumCulled={false} /> : null;
};
