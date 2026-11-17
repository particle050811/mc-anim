// 粒子面片：原版 SingleQuadParticle 那种始终和画面平行的方片，实例化一次画很多个（方块碎屑、感测体粉尘这类数量多的）。
// 少量、朝向固定的（振动、尖啸声波）各自建面片，不用这个。
// 照游戏：方片四角是镜头坐标系里的 (±1, ±1) × 半边长；贴图坐标右边是 U1、上边是 V0（可以是倒过来的小块）。
// 不受光：颜色 = 贴图 × 粒子颜色，吃雾（游戏里还要乘亮度图，夜视下满亮度；黑暗效果见 黑暗效果.tsx）。
// 接了对数深度（logdepthbuf 那几段）：画布开 logarithmicDepthBuffer 时深度才和别的物体对得上，没开时是空的。
// 半透明（`translucent`）的在 屏幕AO 里归第 3 遍画，按第 2 遍写回的深度做遮挡。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { trialOff } from '../../engine/core/试看.ts';
import type { Particle } from './粒子物理.ts';

// 物理、插值和数据形状在纯模块 粒子物理.ts，这里原样转出，老代码照旧从这里引
export { interpPathPos, particleInitVel, particlePath, ParticlePhysics, type Particle } from './粒子物理.ts';

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec2 corner;
attribute vec3 iCenter;
attribute float iHalf;
attribute vec4 iUv;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  // 右（corner.x = 1）取 U1，上（corner.y = 1）取 V0
  vUv = vec2(mix(iUv.x, iUv.z, corner.x * 0.5 + 0.5), mix(iUv.w, iUv.y, corner.y * 0.5 + 0.5));
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iCenter, 1.0);
  mvPosition.xy += corner * iHalf;
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
  // 游戏的粒子着色器：alpha < 0.1 的像素丢掉
  if (c.a < alphaTest) discard;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// `tex`：贴图（DataTexture，sRGB）；`items`：这一帧要画的粒子；`translucent`：半透明混合（游戏的 PARTICLE_SHEET_TRANSLUCENT），否则不透明；
// `depthWrite`：写不写深度。游戏的半透明粒子也写深度，成百上千个叠在一起的（气流.tsx）要关掉，
// 否则先画的近处粒子会把后画的远处挡掉（实例不排序），叠不出浓淡。
export const ParticleQuads: React.FC<{ tex: THREE.Texture; items: Particle[]; translucent?: boolean; alphaTest?: number; depthWrite?: boolean }> = ({
  tex,
  items,
  translucent = false,
  alphaTest = 0.1,
  depthWrite = true,
}) => {
  const count = items.length;
  const cap = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
  const { mesh, geo } = useMemo(() => {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    geometry.setAttribute('iHalf', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
    geometry.setAttribute('iUv', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geometry.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, alphaTest: { value: alphaTest } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      transparent: translucent,
      depthWrite,
      side: THREE.DoubleSide,
    });
    const instMesh = new THREE.Mesh(geometry, mat);
    instMesh.frustumCulled = false;
    return { mesh: instMesh, geo: geometry };
  }, [cap, translucent, alphaTest, depthWrite]);
  useEffect(() => () => {
    geo.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [geo, mesh]);
  (mesh.material as THREE.ShaderMaterial).uniforms.map.value = tex;
  const centerAttr = geo.getAttribute('iCenter') as THREE.InstancedBufferAttribute;
  const halfAttr = geo.getAttribute('iHalf') as THREE.InstancedBufferAttribute;
  const uvAttr = geo.getAttribute('iUv') as THREE.InstancedBufferAttribute;
  const col = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
  items.forEach((it, i) => {
    centerAttr.setXYZ(i, it.p[0], it.p[1], it.p[2]);
    halfAttr.setX(i, it.half);
    uvAttr.setXYZW(i, it.uv[0], it.uv[1], it.uv[2], it.uv[3]);
    // 粒子颜色是乘在 sRGB 贴图上的系数，着色器在线性空间里乘，所以先换成线性
    col.setXYZW(i, s2l(it.color[0]), s2l(it.color[1]), s2l(it.color[2]), it.alpha ?? 1);
  });
  for (const attr of [centerAttr, halfAttr, uvAttr, col]) attr.needsUpdate = true;
  geo.instanceCount = count;
  // 试看 {"关": ["粒子"]}（anim trial list）
  return count > 0 && !trialOff('粒子') ? <primitive object={mesh} /> : null;
};

// 贴图：像素 → three 贴图（不翻转，V 从第一行算起），最近邻采样
const texCache = new WeakMap<object, THREE.DataTexture>();
export const particleTexture = (px: Uint8Array, width: number, height: number, key: object = px): THREE.DataTexture => {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.DataTexture(px, width, height, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    texCache.set(key, t);
  }
  return t;
};
