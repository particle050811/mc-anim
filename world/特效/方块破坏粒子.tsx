// 方块破坏粒子：原版挖掉 / 打掉方块时崩出的那把小方片（1.20.1 `ParticleEngine.destroy` + `TerrainParticle`）。用户 10-02 要求：
// 战利品箱被打碎、墙被动力钻头矛扫到的那一管方块不再整块飞出，而是原地崩成小方片。照游戏：
// - destroy：方块每个碰撞箱按 0.25 格分格（每轴至少 2 份，整格 4×4×4 = 64 个），每格中心放一个粒子，速度是该格相对方块中心的偏移 (d − 0.5)，
//   再经 `Particle` 构造函数随机化（粒子面片.tsx 的 `particleInitVel`）；
// - TerrainParticle：重力 1（0.04 格/刻²）、摩擦 0.98、半边长 0.05～0.1 格、寿命 4/(random×0.9+0.1) 刻、颜色 0.6（草、树叶再乘群系色）；
//   贴图取方块粒子贴图里随机 1/4 见方的小块（左右倒过来）。
// 和游戏不同：不处理碰撞；数量可按 `density`（每轴几份）减，近处照原版 4。
// 外迸：在原版速度上再加一份（格/刻，场景坐标）：被高速旋转的钻头矛扫到的那一管，粒子顺着离开矛轴的方向甩（模型/特效/方块飞溅.tsx）。
// 时间：粒子自己的时钟（秒，× 20 = 刻）。一镜到底近景慢放时，调用处按特效倍速换成粒子时钟（同 6-1-5 的药水炸开）。
// 画：和画面平行的方片，一次画很多个（同 粒子面片.tsx）。一镜到底的画布开着对数深度缓冲（`logarithmicDepthBuffer`，公里尺度场景），
// 所以这里单写了一份带对数深度的着色器（`BreakParticleQuads`），和 粒子面片.tsx 现在一样，没合回去。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { rng } from '../../engine/model/parts.tsx';
import { interpPathPos, type Particle, particleInitVel, particlePath } from './粒子面片.tsx';

// 一镜到底近景慢放里的粒子时钟倍速（粒子速度按比例放大，撞击比日常挖方块猛得多）：
// - 战利品箱：同 6-1-5 的药水炸开（倍速 55），慢放下一秒上下散干净，把画面让给飞出来的物品；
// - 墙上被矛管扫到的方块：20。镜头比矛尖晚 0.018 秒才到墙上，这时粒子还有一半没散，镜头从粒子中间钻过去，看得出那一管是崩成粒子的
export const closeupBreakClockScale = { chest: 55, 墙: 20 };

export type BreakParticle = { path: V3[]; life: number; half: number; uv: [number, number, number, number]; color: [number, number, number] };

// 一个方块（`center`、`size`，单位格，场景坐标 Z 朝上）崩出来的粒子。`uvRect`：方块粒子贴图在图集里的范围 [u0, v0, u1, v1]（V 从第一行算起）；
// `color`：粒子颜色（sRGB 0～1，原版 0.6，再乘染色）；`density`：每轴几份（原版整格 4）；`outwardVel`：按出生位置额外加的速度
export const spawnBlockBreak = (
  center: V3,
  size: V3,
  uvRect: [number, number, number, number],
  color: [number, number, number],
  seed: number,
  density = 4,
  outwardVel?: (p0: V3, rand: () => number) => V3,
): BreakParticle[] => {
  const rand = rng(seed * 4099 + 17);
  const out: BreakParticle[] = [];
  // 每轴份数：原版是 max(2, ceil(边长 / 0.25))；按 `density`/4 缩
  const divisions = size.map((s) => Math.max(2, Math.ceil((Math.min(1, s) / 0.25) * (density / 4))));
  const [u0, v0, u1, v1] = uvRect;
  for (let i = 0; i < divisions[0]; i++)
    for (let j = 0; j < divisions[1]; j++)
      for (let k = 0; k < divisions[2]; k++) {
        const cellFrac = [(i + 0.5) / divisions[0], (j + 0.5) / divisions[1], (k + 0.5) / divisions[2]];
        const p0: V3 = [center[0] + (cellFrac[0] - 0.5) * size[0], center[1] + (cellFrac[1] - 0.5) * size[1], center[2] + (cellFrac[2] - 0.5) * size[2]];
        // 游戏坐标（y 朝上）：x = 场景 x、y = 场景 z、z = -场景 y
        const [gx, gy, gz] = particleInitVel(rand, cellFrac[0] - 0.5, cellFrac[2] - 0.5, -(cellFrac[1] - 0.5));
        const life = Math.floor(4 / (rand() * 0.9 + 0.1));
        const ex = outwardVel ? outwardVel(p0, rand) : [0, 0, 0];
        const half = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
        const uo = rand() * 3;
        const vo = rand() * 3;
        const du = (u1 - u0) / 4;
        const dv = (v1 - v0) / 4;
        out.push({
          path: particlePath(p0, [gx + ex[0], -gz + ex[1], gy + ex[2]], life + 1, { gravity: 1, friction: 0.98 }),
          life,
          half,
          // [左 U0, 上 V0, 右 U1, 下 V1]：游戏里 U0 取 (uo+1)/4、U1 取 uo/4（左右倒过来）
          uv: [u0 + du * (uo + 1), v0 + dv * vo, u0 + du * uo, v0 + dv * (vo + 1)],
          color,
        });
      }
  return out;
};

// 崩开以后 `sec`（粒子时钟）时还活着的粒子，追加到 `out`；`scale`：整体缩放（以 `pivot` 为中心，远景放大用）
export const collectBreakParticles = (ps: BreakParticle[], sec: number, out: Particle[], scale = 1, pivot: V3 = [0, 0, 0]) => {
  if (sec < 0) return;
  const t = sec * 20;
  for (const particle of ps) {
    // 生成后下一刻开始动；寿命到了的那一刻被移除，所以看得到 life + 1 刻
    if (t >= particle.life + 1) continue;
    const pos = interpPathPos(particle.path, t);
    out.push({
      p: scale === 1 ? pos : [pivot[0] + (pos[0] - pivot[0]) * scale, pivot[1] + (pos[1] - pivot[1]) * scale, pivot[2] + (pos[2] - pivot[2]) * scale],
      half: particle.half * scale,
      uv: particle.uv,
      color: particle.color,
    });
  }
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
varying vec2 vUv;
varying vec4 vColor;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vUv) * vColor;
  // 游戏的粒子着色器：alpha < 0.1 的像素丢掉
  if (c.a < 0.1) discard;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// 受光照的版本（`lit`）：原版粒子按所在位置的光照变亮变暗（`TerrainParticle` 的 getLightColor），这里的对应做法是和方块碎块同一套光照：
// 同 方块飞溅.tsx 的 debrisMat（场景灯 + 0.35 自发光，都乘颜色），法线朝上（同地面顶面）。不受光照的版本在暗场景里比地面黑一截。
const litMaterial = (tex: THREE.Texture) => {
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, alphaTest: 0.1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'attribute vec2 corner;\nattribute vec3 iCenter;\nattribute float iHalf;\nattribute vec4 iUv;\nattribute vec4 iColor;\nvarying vec4 vParticleColor;\n' +
      sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 0.0, 1.0 );')
        .replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n\tvec2 particleUv = vec2( mix( iUv.x, iUv.z, corner.x * 0.5 + 0.5 ), mix( iUv.w, iUv.y, corner.y * 0.5 + 0.5 ) );\n\tvMapUv = particleUv;\n\tvEmissiveMapUv = particleUv;\n\tvParticleColor = iColor;',
        )
        .replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * vec4( iCenter, 1.0 );\n\tmvPosition.xy += corner * iHalf;\n\tgl_Position = projectionMatrix * mvPosition;');
    sh.fragmentShader =
      'varying vec4 vParticleColor;\n' +
      sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor *= vParticleColor;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vParticleColor.rgb;');
  };
  material.customProgramCacheKey = () => 'break-particle-lit';
  return material;
};

export const BreakParticleQuads: React.FC<{ tex: THREE.Texture; items: Particle[]; lit?: boolean }> = ({ tex, items, lit = false }) => {
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
    if (lit) geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); // 只为让 three 编出 vMapUv，值在着色器里换掉
    const mat = lit ? litMaterial(tex) : new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      side: THREE.DoubleSide,
    });
    const instMesh = new THREE.Mesh(geometry, mat);
    instMesh.frustumCulled = false;
    return { mesh: instMesh, geo: geometry };
  }, [cap, lit, lit ? tex : null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      geo.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [geo, mesh],
  );
  if (!lit) (mesh.material as THREE.ShaderMaterial).uniforms.map.value = tex;
  const centerAttr = geo.getAttribute('iCenter') as THREE.InstancedBufferAttribute;
  const halfAttr = geo.getAttribute('iHalf') as THREE.InstancedBufferAttribute;
  const uvAttr = geo.getAttribute('iUv') as THREE.InstancedBufferAttribute;
  const col = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
  items.forEach((it, i) => {
    centerAttr.setXYZ(i, it.p[0], it.p[1], it.p[2]);
    halfAttr.setX(i, it.half);
    uvAttr.setXYZW(i, it.uv[0], it.uv[1], it.uv[2], it.uv[3]);
    col.setXYZW(i, s2l(it.color[0]), s2l(it.color[1]), s2l(it.color[2]), it.alpha ?? 1);
  });
  for (const attr of [centerAttr, halfAttr, uvAttr, col]) attr.needsUpdate = true;
  geo.instanceCount = count;
  return count > 0 ? <primitive object={mesh} /> : null;
};
