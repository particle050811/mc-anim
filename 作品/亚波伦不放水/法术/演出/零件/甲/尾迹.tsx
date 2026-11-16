// 朝镜头的尾迹带（Goety 的 TrailEffect + TrailRenderer，出自 Mowzie 那类拖尾）：弹每刻记一个旧位置，画的时候从当前位置往回连，
// 沿点列累计到 长 为止；每个点往「切线 × (点 − 相机)」两边各伸半宽（FACE_CAMERA），所以从哪看都是一条平带。
// 贴图 u 从头（当前位置）1 到尾 0，v 横跨带宽；实心（solid_trail、pointed_trail）alpha 恒 1，否则 alpha = a × 进度（尾巴淡出）。
// 朝镜头的偏移在顶点着色器里用 cameraPosition 现算，组件不用知道机位。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../../接口.ts';
import { blendParams, toTexture, type Blend, type RgbColor } from '../材质.ts';
import { sub, addVec, scaleVec, vecLength as vecLength, unitVec, trajectoryPos, type Trajectory } from '../弹道.ts';

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
export const trailPoints = (trajectory: Trajectory, tick: number, opts: { startTick?: number; 最多?: number; offset?: Vec3 } = {}): Vec3[] => {
  const offset = opts.offset ?? [0, 0, 0];
  const points: Vec3[] = [addVec(trajectoryPos(trajectory, tick), offset)];
  // TrailEffect 在 tickCount > 起刻 之后才开始记，记的是那一刻之前的位置
  for (let n = Math.floor(tick); n >= (opts.startTick ?? 0) && points.length < (opts.最多 ?? 64); n--) points.push(addVec(trajectory(n), offset));
  return points;
};

export const Trail: React.FC<{
  /** 新的在前，场景坐标 */
  points: readonly Vec3[];
  /** TrailEffect 的 width（整条宽的一半是它的一半）、length（格） */
  width: number;
  length: number;
  image: Png;
  色?: RgbColor;
  opacity?: number;
  /** solid：alpha 不随进度淡 */
  实心?: boolean;
  blend?: Blend;
}> = ({ points, width: width, length: length, image: image, 色: color = [1, 1, 1], opacity = 1, 实心: solid = false, blend: blend = '半透明' }) => {
  const cacheKey = JSON.stringify(points);
  const geo = useMemo(() => {
    // 沿点列走到 长 为止，最后一段截断
    const trail: { p: Vec3; 走: number }[] = [];
    let walked = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i === 0) {
        trail.push({ p, 走: 0 });
        continue;
      }
      const prevPoint = points[i - 1]!;
      const segLength = vecLength(sub(p, prevPoint));
      if (segLength < 1e-6) continue;
      if (walked + segLength >= length) {
        trail.push({ p: addVec(prevPoint, scaleVec(unitVec(sub(p, prevPoint)), length - walked)), 走: length });
        walked = length;
        break;
      }
      walked += segLength;
      trail.push({ p, 走: walked });
    }
    if (trail.length < 2 || walked <= 0) return null;
    const pos: number[] = [];
    const tan: number[] = [];
    const uvw: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    trail.forEach(({ p, 走: s }, i) => {
      const t = unitVec(sub(trail[Math.min(trail.length - 1, i + 1)]!.p, trail[Math.max(0, i - 1)]!.p));
      const progress = (walked - s) / walked;
      for (const sign of [-1, 1]) {
        pos.push(p[0], p[1], p[2]);
        tan.push(t[0], t[1], t[2]);
        uvw.push(progress, progress);
        side.push(sign);
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
  }, [cacheKey, length]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, tint: { value: new THREE.Vector4(1, 1, 1, 1) }, solid: { value: 0 }, halfWidth: { value: 0.1 }, alphaTest: { value: blend === '镂空' ? 0.1 : 0.004 } }]),
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
        side: THREE.DoubleSide,
        ...blendParams(blend),
      }),
    [blend],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => geo?.dispose(), [geo]);
  mat.uniforms.map!.value = toTexture(image);
  (mat.uniforms.tint!.value as THREE.Vector4).set(s2l(color[0]), s2l(color[1]), s2l(color[2]), opacity);
  mat.uniforms.solid!.value = solid ? 1 : 0;
  mat.uniforms.halfWidth!.value = width / 2;
  return geo ? <mesh geometry={geo} material={mat} frustumCulled={false} /> : null;
};
