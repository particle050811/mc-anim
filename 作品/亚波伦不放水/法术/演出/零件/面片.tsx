// 朝镜头的贴图面片（游戏里的粒子 SingleQuadParticle、物品片 ThrownItemRenderer 这类永远正对镜头的方片），同一张贴图的实例化一次画完。
// 和 @库/特效/粒子面片.tsx 的 ParticleQuads 同一个画法，多了三样法术要用的：加色混合、绕视线转（粒子的 roll）、宽高不等。
// 一张贴图一批：序列帧的粒子按帧分批，用 序列帧() 取当前帧。
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { blendParams, toTexture, type Blend, type RgbColor } from './材质.ts';

/**
 * 一张面片。一律用 片() 造，不写对象字面量（类有私有成员，字面量过不了类型检查）。
 * 坑：渲染用的 chrome-headless-shell（Remotion 的 157.0.8080.0-remotion-v3）开着 V8 的 DCHECK。以前各处用字面量 {位, 半宽, …} 造，
 * 它们共用同一串隐藏类，有的 半宽 是整数、有的是小数，隐藏类被作废；字面量的样板对象（boilerplate）跟着迁移时撞上 V8 的检查
 * （js-objects.cc 3350 行 TrustedCast，迁到的值是 Hole / UninitializedHeapNumber），页面进程当场崩掉，Remotion 等不到帧，
 * 看着是一直不出帧、各进程 CPU 都是 0。第 4 幕第 720 帧过度生长、撕咬、尖牙盛宴同时在场时必崩，出不出看种子和先后。类构造没有样板对象。
 */
export class QuadItem {
  declare private readonly brand: never;
  readonly 位: Vec3;
  /** 半边长（游戏的 quadSize）；半高不给 = 方的 */
  readonly halfWidth: number;
  readonly 色: RgbColor | undefined;
  /** [U0, V0, U1, V1]：画面左、上、右、下对应的贴图坐标；不给 = 整张 */
  readonly uv: readonly [number, number, number, number] | undefined;
  readonly opacity: number | undefined;
  /** 绕视线转的弧度（粒子的 roll） */
  readonly angleRad: number | undefined;
  readonly halfHeight: number | undefined;
  constructor(pos: Vec3, halfWidth: number, color: RgbColor | undefined, uv: readonly [number, number, number, number] | undefined, opacity: number | undefined, angleRad: number | undefined, halfHeight: number | undefined) {
    this.位 = pos;
    this.halfWidth = halfWidth;
    this.色 = color;
    this.uv = uv;
    this.opacity = opacity;
    this.angleRad = angleRad;
    this.halfHeight = halfHeight;
  }
}
export const facePatch = (
  pos: Vec3,
  halfWidth: number,
  color?: RgbColor,
  uv?: readonly [number, number, number, number],
  opacity?: number,
  angleRad?: number,
  halfHeight?: number,
): QuadItem => new QuadItem(pos, halfWidth, color, uv, opacity, angleRad, halfHeight);

/**
 * 近镜淡出（原创，段自己开）：[起, 止] 格。面片离镜头的距离减去它的半边长不到 起 就不画，到 止 画全；不给（默认）= 不淡，和游戏一样。
 * 用处：镜头跟进粒子堆里时，贴着镜头的几颗会放大成整屏的色块把人糊住（第 4 幕挥剑那一镜，火柱的火团贴在镜头前）
 */
export const nearFadeContext = createContext<readonly [number, number] | null>(null);

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec2 corner;
attribute vec3 iCenter;
attribute vec3 iSize;
attribute vec4 iUv;
attribute vec4 iColor;
uniform vec2 nearFade;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = vec2(mix(iUv.x, iUv.z, corner.x * 0.5 + 0.5), mix(iUv.w, iUv.y, corner.y * 0.5 + 0.5));
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iCenter, 1.0);
  if (nearFade.y > 0.0) vColor.a *= smoothstep(nearFade.x, nearFade.y, length(mvPosition.xyz) - max(iSize.x, iSize.y));
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

export const QuadGroup: React.FC<{ image: Png; items: readonly QuadItem[]; blend?: Blend; depthWrite?: boolean }> = ({ image: image, items: items, blend: blend = '镂空', depthWrite }) => {
  const count = items.length;
  const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
  const { mesh, geo } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    g.setAttribute('iUv', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, alphaTest: { value: blend === '镂空' ? 0.1 : 0.004 }, nearFade: { value: new THREE.Vector2(0, 0) } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      side: THREE.DoubleSide,
      ...blendParams(blend, depthWrite),
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return { mesh: m, geo: g };
  }, [capacity, blend, depthWrite]);
  useEffect(() => () => {
    geo.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [geo, mesh]);
  const nearFade = useContext(nearFadeContext);
  (mesh.material as THREE.ShaderMaterial).uniforms.map!.value = toTexture(image);
  ((mesh.material as THREE.ShaderMaterial).uniforms.nearFade!.value as THREE.Vector2).set(nearFade?.[0] ?? 0, nearFade?.[1] ?? 0);
  const centers = geo.getAttribute('iCenter') as THREE.InstancedBufferAttribute;
  const sizeAttribute = geo.getAttribute('iSize') as THREE.InstancedBufferAttribute;
  const uv = geo.getAttribute('iUv') as THREE.InstancedBufferAttribute;
  const colorAttr = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
  items.forEach((it, i) => {
    centers.setXYZ(i, it.位[0], it.位[1], it.位[2]);
    sizeAttribute.setXYZ(i, it.halfWidth, it.halfHeight ?? it.halfWidth, it.angleRad ?? 0);
    const q = it.uv ?? [0, 0, 1, 1];
    uv.setXYZW(i, q[0], q[1], q[2], q[3]);
    const c = it.色 ?? [1, 1, 1];
    // 颜色是乘在 sRGB 贴图上的系数，着色器在线性空间里乘，先换成线性
    colorAttr.setXYZW(i, s2l(c[0]), s2l(c[1]), s2l(c[2]), it.opacity ?? 1);
  });
  for (const a of [centers, sizeAttribute, uv, colorAttr]) a.needsUpdate = true;
  geo.instanceCount = count;
  return count > 0 ? <primitive object={mesh} /> : null;
};

/** 单张面片 */
export const Quad: React.FC<{ image: Png; 位: Vec3; halfWidth: number; halfHeight?: number; 色?: RgbColor; opacity?: number; angleRad?: number; uv?: readonly [number, number, number, number]; blend?: Blend; depthWrite?: boolean }> = ({
  image: image,
  blend: blend,
  depthWrite,
  位: pos,
  halfWidth: halfWidth,
  halfHeight,
  色: color,
  opacity,
  angleRad,
  uv,
}) => <QuadGroup image={image} items={[facePatch(pos, halfWidth, color, uv, opacity, angleRad, halfHeight)]} blend={blend} depthWrite={depthWrite} />;

/** 序列帧：第 序号 帧（向下取整）；循环 = 超出从头再来，否则停在最后一帧 */
export const sequenceFrame = <T,>(frames: readonly T[], index: number, loop = false): T => {
  const n = frames.length;
  const i = Math.floor(index);
  return frames[loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))]!;
};
