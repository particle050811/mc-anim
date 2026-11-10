// 炼狱结界在本片里的线：等宽、加粗、发光。用户 11-10 定「加粗 并且加一个发光特效 便于观众看清楚」（看了预览 1110-0739 的 16～19）。
// 原版的细线（粗细随朝向变、暗红、不发光）留在 @库/特效/炼狱结界.tsx 不动；这里只借它的形状（@库/特效/炼狱结界线.ts 的 结界棱表：30 条棱、20 个顶点）和转动、半径、透明度的约定。
// 画法（本片自定，不是原版的）：每条棱一张朝着镜头的面片，片元按离线心多远算亮度：中间一条不透明的亮芯（芯心橙黄、芯边炽红），外面一圈加色的晕。
// 20 个顶点各叠一个亮点（长度 0 的线，只剩两头的圆帽）。粗细按世界里的格数算，远了不小于「最小芯宽像素」，全景里不会细成丝。
// 混合：预乘，源 ONE、目标 1−源透明度，芯的透明度 1（盖住背景）、晕的透明度 0（纯加色），一遍画完。不写深度：结界里要灌法术粒子，写了会把后画的半透明挡出缝；有深度测试，会被地面、人挡住。
// 雾：加色的东西不能往雾色上混，按场景雾的浓度把亮度压下去。没做全屏泛光（engine/post/后期.tsx：全场景泛光用户 10-17 定不做），晕是片元里按距离算的。
// 坐标：同 炼狱结界线框，放在场景坐标（Z 朝上）的 group 里，原点是结界中心。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { 炼狱结界原版, 结界棱表 } from '@库/特效/炼狱结界线.ts';

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 lineEnd;
// (0 起点 / 1 终点, 1 = 圆帽外沿 / 0 = 端点处, ±1 哪一侧)
attribute vec3 corner;
// (宽度倍数, 晕亮度倍数)
attribute vec2 grade;
uniform vec2 halfScreen;
uniform float haloHalfWidth;
uniform float minHaloHalfPx;
uniform float maxHaloHalfPx;
varying vec2 vUv;
varying float vGlow;
void main() {
  vec4 va = modelViewMatrix * vec4(position, 1.0);
  vec4 vb = modelViewMatrix * vec4(lineEnd, 1.0);
  // 镜头在结界里时棱会穿到镜头后面：先裁到近平面，不然投影翻面
  float near = projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0) * 1.01;
  if (va.z > -near && vb.z > -near) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (va.z > -near) va = mix(va, vb, (-near - va.z) / (vb.z - va.z));
  else if (vb.z > -near) vb = mix(vb, va, (-near - vb.z) / (va.z - vb.z));
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 d = cb.xy / cb.w * halfScreen - ca.xy / ca.w * halfScreen;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  bool atEnd = corner.x > 0.5;
  vec4 mvPosition = atEnd ? vb : va;
  vec4 c = atEnd ? cb : ca;
  float pxPerBlock = projectionMatrix[1][1] * halfScreen.y / -mvPosition.z;
  float hw = min(max(haloHalfWidth * pxPerBlock, minHaloHalfPx), maxHaloHalfPx) * grade.x;
  vec2 off = dir * (atEnd ? 1.0 : -1.0) * corner.y * hw + vec2(-dir.y, dir.x) * corner.z * hw;
  c.xy += off / halfScreen * c.w;
  gl_Position = c;
  vUv = corner.zy;
  vGlow = grade.y;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;
const FRAG = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 coreCenter;
uniform vec3 coreEdge;
uniform vec3 haloColor;
uniform float coreRatio;
uniform float haloStrength;
uniform float opacity;
varying vec2 vUv;
varying float vGlow;
void main() {
  #include <logdepthbuf_fragment>
  // 0 = 线心，1 = 晕的外沿
  float dist = length(vUv);
  if (dist >= 1.0) discard;
  float aa = fwidth(dist);
  float core = 1.0 - smoothstep(coreRatio - aa, coreRatio + aa, dist);
  // 晕：贴着芯最亮，到外沿平滑落到 0
  float h = 1.0 - dist;
  float halo = (h * h * h * 0.75 + exp(-dist * dist * 40.0) * 0.6) * haloStrength * vGlow;
  float k = opacity;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      k *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      k *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
  vec3 coreColor = mix(coreCenter, coreEdge, smoothstep(0.25, 1.0, dist / coreRatio));
  gl_FragColor = vec4(mix(haloColor * halo, coreColor, core) * k, core * k);
  #include <colorspace_fragment>
}
`;

type 色 = readonly [number, number, number];

export type 结界辉线外观 = {
  /** 亮芯的宽度（格，世界里的粗细） */
  芯宽: number;
  /** 连晕在内的总宽（格） */
  晕宽: number;
  /** 芯在画面上最细几像素，按 720 高的画面说，别的画幅等比放大 */
  最小芯宽像素: number;
  /** 晕的亮度 */
  晕强: number;
  /** 顶点亮点比线宽几倍、晕亮几倍；亮点倍 0 = 不画 */
  亮点倍: number;
  亮点晕倍: number;
  /** 颜色（sRGB 0～1）：芯心、芯边、晕 */
  芯心色: 色;
  芯边色: 色;
  晕色: 色;
};

/** 默认外观：数值是对着核对段（灰底、暗红底）的静帧取的，没经用户看过。原版暗红 (0.54, 0, 0.11) 提亮成炽红的芯边和晕，芯心偏橙黄 */
export const 结界辉线默认: 结界辉线外观 = {
  芯宽: 0.17,
  晕宽: 1.2,
  最小芯宽像素: 3,
  晕强: 1.0,
  亮点倍: 1.9,
  亮点晕倍: 1.2,
  芯心色: [1, 0.78, 0.42],
  芯边色: [1, 0.2, 0.06],
  晕色: [1, 0.09, 0.05],
};

export type 炼狱结界辉线属性 = {
  /** 同 炼狱结界线框：只管转动，0 = 没转 */
  秒: number;
  半径系数?: number;
  透明度?: number;
  外观?: Partial<结界辉线外观>;
  /** 粗细整体倍数（芯、晕、最小像素一起乘）：演出里结界小的时候线跟着细 */
  粗细倍?: number;
};

export const 炼狱结界辉线: React.FC<炼狱结界辉线属性> = ({ 秒, 半径系数 = 炼狱结界原版.半径系数, 透明度 = 1, 外观, 粗细倍 = 1 }) => {
  const gl = useThree((s) => s.gl);
  // 画布尺寸变了要重取实际像素
  useThree((s) => s.size);
  const 观 = { ...结界辉线默认, ...外观 };
  const { 亮点倍, 亮点晕倍 } = 观;
  const mesh = useMemo(() => {
    const { 顶点, 棱 } = 结界棱表();
    const 线: { 起: readonly number[]; 止: readonly number[]; 档: readonly [number, number] }[] = 棱.map(([a, b]) => ({ 起: 顶点[a]!, 止: 顶点[b]!, 档: [1, 1] }));
    if (亮点倍 > 0) for (const p of 顶点) 线.push({ 起: p, 止: p, 档: [亮点倍, 亮点晕倍] });
    const pos: number[] = [];
    const end: number[] = [];
    const corner: number[] = [];
    const grade: number[] = [];
    const idx: number[] = [];
    线.forEach((s, i) => {
      // 沿线 4 排、每排 2 个顶点：起点帽沿、起点、终点、终点帽沿，连成 3 个四边形
      for (const [端, 帽] of [[0, 1], [0, 0], [1, 0], [1, 1]] as const) {
        for (const 侧 of [1, -1]) {
          pos.push(...s.起);
          end.push(...s.止);
          corner.push(端, 帽, 侧);
          grade.push(...s.档);
        }
      }
      for (let q = 0; q < 3; q++) {
        const o = i * 8 + q * 2;
        idx.push(o, o + 1, o + 2, o + 3, o + 2, o + 1);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('lineEnd', new THREE.Float32BufferAttribute(end, 3));
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 3));
    geometry.setAttribute('grade', new THREE.Float32BufferAttribute(grade, 2));
    geometry.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          halfScreen: { value: new THREE.Vector2(1, 1) },
          haloHalfWidth: { value: 0 },
          minHaloHalfPx: { value: 0 },
          maxHaloHalfPx: { value: 0 },
          coreRatio: { value: 0 },
          haloStrength: { value: 0 },
          opacity: { value: 1 },
          coreCenter: { value: new THREE.Color() },
          coreEdge: { value: new THREE.Color() },
          haloColor: { value: new THREE.Color() },
        },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const m = new THREE.Mesh(geometry, material);
    m.frustumCulled = false;
    return m;
  }, [亮点倍, 亮点晕倍]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);
  const u = (mesh.material as THREE.ShaderMaterial).uniforms;
  const 缓冲 = gl.getDrawingBufferSize(new THREE.Vector2());
  const 芯比 = 观.芯宽 / 观.晕宽;
  u.halfScreen!.value.set(缓冲.x / 2, 缓冲.y / 2);
  u.haloHalfWidth!.value = (观.晕宽 / 2) * 粗细倍;
  u.minHaloHalfPx!.value = ((观.最小芯宽像素 / 2) * (缓冲.y / 720) * 粗细倍) / 芯比;
  // 镜头贴着线时不让一条线的晕糊掉半个画面
  u.maxHaloHalfPx!.value = 缓冲.y * 0.12;
  u.coreRatio!.value = 芯比;
  u.haloStrength!.value = 观.晕强;
  u.opacity!.value = Math.min(1, Math.max(0, 透明度));
  (u.coreCenter!.value as THREE.Color).setRGB(...观.芯心色, THREE.SRGBColorSpace);
  (u.coreEdge!.value as THREE.Color).setRGB(...观.芯边色, THREE.SRGBColorSpace);
  (u.haloColor!.value as THREE.Color).setRGB(...观.晕色, THREE.SRGBColorSpace);
  if (透明度 <= 0 || 半径系数 <= 0) return null;
  const 角 = (秒 * 炼狱结界原版.每秒转度 * Math.PI) / 180;
  return (
    // 外层把场景坐标（Z 朝上）转回 MC 的轴（Y 朝上）
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[角, 角, 角]} scale={半径系数}>
        <primitive object={mesh} />
      </group>
    </group>
  );
};
