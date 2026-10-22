// 粒子面片：原版 SingleQuadParticle 那种始终和画面平行的方片，实例化一次画很多个（方块碎屑、感测体粉尘这类数量多的）。
// 少量、朝向固定的（振动、尖啸声波）各自建面片，不用这个。
// 照游戏：方片四角是镜头坐标系里的 (±1, ±1) × 半边长；贴图坐标右边是 U1、上边是 V0（可以是倒过来的小块）。
// 不受光：颜色 = 贴图 × 粒子颜色，吃雾（游戏里还要乘亮度图，夜视下满亮度；黑暗效果见 黑暗效果.tsx）。
// 接了对数深度（logdepthbuf 那几段）：画布开 logarithmicDepthBuffer 时深度才和别的物体对得上，没开时是空的。
// 半透明（`translucent`）的在 屏幕AO 里归第 3 遍画，按第 2 遍写回的深度做遮挡。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';

export type Particle = {
  p: V3; // 方片中心（场景坐标）
  half: number; // 半边长（游戏的 quadSize）
  uv: [number, number, number, number]; // [U0, V0, U1, V1]：画面左、上、右、下对应的贴图坐标（0~1，V 从贴图第一行算起）
  color: [number, number, number]; // 粒子颜色（游戏里的 rCol gCol bCol，sRGB 数值 0~1）
  alpha?: number;
};

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
  return count > 0 ? <primitive object={mesh} /> : null;
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

// 粒子的物理（Particle.tick，1.20.1）：每刻先 yd -= 0.04×重力，再移动，再三个分量都 ×摩擦；
// `hasPhysics` 时碰到方块：竖直方向被挡住、这一刻几乎没动（< 1e-5）就整个停住，之后不再动；落地那一刻水平速度再 ×0.7。
// 只处理一个水平地面（z = ground），不处理墙。
// 返回每刻结束时的位置（第 0 项是出生位置），长度 ticks + 1。坐标：场景（z 朝上）。
export const particlePath = (p0: V3, v0: V3, ticks: number, opt: { gravity: number; friction: number; ground?: number }): V3[] => {
  const out: V3[] = [[...p0] as V3];
  let [x, y, z] = p0;
  let [vx, vy, vz] = v0;
  let stopped = false;
  for (let k = 0; k < ticks; k++) {
    if (!stopped) {
      vz -= 0.04 * opt.gravity;
      let dz = vz;
      const want = vz;
      if (opt.ground !== undefined && z + dz < opt.ground) dz = opt.ground - z;
      x += vx;
      y += vy;
      z += dz;
      if (Math.abs(want) >= 1e-5 && Math.abs(dz) < 1e-5) stopped = true;
      const onGround = want !== dz && want < 0;
      vx *= opt.friction;
      vy *= opt.friction;
      vz *= opt.friction;
      if (onGround) {
        vx *= 0.7;
        vy *= 0.7;
      }
    }
    out.push([x, y, z]);
  }
  return out;
};

// 游戏在两刻之间按 partialTicks 插值 xo → x，所以画出来的位置比物理晚一刻
export const interpPathPos = (path: V3[], tau: number): V3 => {
  const k = Math.floor(tau);
  const frac = tau - k;
  const prevPos = path[Math.max(0, Math.min(path.length - 1, k - 1))];
  const curPos = path[Math.max(0, Math.min(path.length - 1, k))];
  return [prevPos[0] + (curPos[0] - prevPos[0]) * frac, prevPos[1] + (curPos[1] - prevPos[1]) * frac, prevPos[2] + (curPos[2] - prevPos[2]) * frac];
};

// Particle 构造函数里的随机速度（1.20.1）：每个分量先加 (random×2-1)×0.4，再归一化到 (random+random+1)×0.15×0.4，竖直再加 0.1。
// 输入输出都是游戏坐标（y 朝上）
export const particleInitVel = (rand: () => number, xd: number, yd: number, zd: number): [number, number, number] => {
  let x = xd + (rand() * 2 - 1) * 0.4;
  let y = yd + (rand() * 2 - 1) * 0.4;
  let z = zd + (rand() * 2 - 1) * 0.4;
  const speed = (rand() + rand() + 1) * 0.15;
  const len = Math.hypot(x, y, z) || 1;
  x = (x / len) * speed * 0.4;
  y = (y / len) * speed * 0.4 + 0.1;
  z = (z / len) * speed * 0.4;
  return [x, y, z];
};
