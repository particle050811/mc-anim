// 夜幕刀光的招架 `NightfallParry`：夜幕 EFNParryingSkill.spawnParryFlashParticle（jar 反汇编）
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../engine/model/parts.tsx';
import { interpPathPos, particleTexture } from '../粒子面片.tsx';
import { Billboard, nightfallPngs, rng } from './共用.tsx';

// - EFN_PARRY_FLASH_MAIN：位置先按 (r−0.5)×(0.95, 0.55, 0.95) 抖一下，再放一张 efn_parry_flash_main_render1～6 的白色全亮半透明闪光，
//   半边长 1.85，寿命 4 刻，按年龄换帧（age×5/4），随机绕视线转 ±45°。不走泛光。
// - ALL_SPARK（AllSpark → SparkParticle EXPANSIVE）：90 颗火星，方向 normalize((r−0.5)×2, (r−0.5)×1.4, (r−0.5)×2)，出生在中心外 0.12 格，
//   速度 0.05 + r×0.8 格/刻，每个分量再乘 0.7 + 0.6r；重力 0.4、摩擦 0.98，每刻另外 ×0.88，1/8 的刻随机抖 ±0.0075；寿命 5 + 0～9 刻；
//   颜色 (1, 0.7+0.3r, 0.2+0.2r)，随年龄 g = 0.7×(1 − 0.9k)、b = 0.2×(1 − 0.7k)；半边长 (0.02 + 0.03r)×0.4，随年龄 ×(1 + 0.8k)。
//   渲染是 Epic Fight 的 LIGHTNING：纯色方片，加色混合，不写深度。
// 游戏里两样都放在“玩家 0.6 身高处 → 攻击者 0.6 身高处”的中点，离玩家超过 1 格就拉回到 1 格；位置由调用的镜头给。
const parryLifeTicks = 4;
const parryHalfSize = 1.85;

const parryData = (center: V3, seed: number, exact: boolean) => {
  const rand = rng(seed);
  // ParryFlashMainParticle 的抖动（游戏 y 朝上 → 场景 z）；exact 不抖，闪光正落在刀碰箭那一点（用户 10-17：闪光要和刀碰到的位置一样）
  const jitter: V3 = [(rand() - 0.5) * 0.95, -(rand() - 0.5) * 0.95, (rand() - 0.5) * 0.55];
  const flashPos: V3 = exact ? [...center] : [center[0] + jitter[0], center[1] + jitter[1], center[2] + jitter[2]];
  const roll = ((rand() - 0.5) * 90 * Math.PI) / 180;
  const sparks = Array.from({ length: 90 }, () => {
    let dx = (rand() - 0.5) * 2;
    let dy = (rand() - 0.5) * 1.4;
    let dz = (rand() - 0.5) * 2;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const sp = 0.05 + rand() * 0.25 * 3.2;
    const lifespan = 5 + Math.floor(rand() * 10);
    const g0 = 0.7 + rand() * 0.3;
    const b0 = 0.2 + rand() * 0.2;
    const base = (rand() * 0.03 + 0.02) * 0.4;
    // 速度 = 方向×速度，每个分量再乘 0.7 + 0.6r（游戏坐标），换成场景 (x, −z, y)
    const vg = [dx * sp * (0.7 + rand() * 0.6), dy * sp * (0.7 + rand() * 0.6), dz * sp * (0.7 + rand() * 0.6)];
    let pos: V3 = [center[0] + dx * 0.12, center[1] - dz * 0.12, center[2] + dy * 0.12];
    let vel: V3 = [vg[0], -vg[2], vg[1]];
    const path: V3[] = [[...pos] as V3];
    for (let k = 0; k < lifespan; k++) {
      // Particle.tick：重力、移动、摩擦 0.98；SparkParticle：再 ×0.88，1/8 的刻随机抖
      vel = [vel[0], vel[1], vel[2] - 0.04 * 0.4];
      pos = [pos[0] + vel[0], pos[1] + vel[1], pos[2] + vel[2]];
      vel = vel.map((c) => c * 0.98 * 0.88) as V3;
      if (Math.floor(rand() * 8) === 0) vel = vel.map((c) => c + (rand() - 0.5) * 0.015) as V3;
      path.push([...pos] as V3);
    }
    return { path: path, lifespan: lifespan, g0, b0, base };
  });
  return { flashPos: flashPos, roll, sparks: sparks };
};

const sparkVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aHalf;
uniform float uViewH;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // 方片边长 2×半边长（世界尺寸）换成像素
  gl_PointSize = max(1.0, 2.0 * aHalf * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z);
  #include <logdepthbuf_vertex>
}`;
const sparkFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vColor, 1.0);
}`;

// 秒：招架后的剧情秒；位置：招架中心（场景坐标）；exact：闪光不抖
export const NightfallParry: React.FC<{ center: V3; sec: number; seed?: number; exact?: boolean }> = ({ center: center, sec: sec, seed: seed = 1, exact = false }) => {
  const data = useMemo(() => parryData(center, seed, exact), [center, seed, exact]);
  const flashMat = useMemo(() => {
    // 游戏的半透明粒子着色器 alpha < 0.1 丢掉、写深度
    return new THREE.MeshBasicMaterial({ map: mainTexture('efn_parry_flash_main_render1'), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: true });
  }, []);
  const quad = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return geometry;
  }, []);
  const sparkPoints = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    geometry.setAttribute('aHalf', new THREE.Float32BufferAttribute(new Float32Array(90), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uViewH: { value: 720 } },
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    const pts = new THREE.Points(geometry, mat);
    pts.frustumCulled = false;
    pts.onBeforeRender = (gl) => {
      mat.uniforms.uViewH.value = gl.getDrawingBufferSize(new THREE.Vector2()).y;
    };
    return pts;
  }, []);
  useEffect(
    () => () => {
      flashMat.dispose();
      quad.dispose();
      sparkPoints.geometry.dispose();
      (sparkPoints.material as THREE.Material).dispose();
    },
    [flashMat, quad, sparkPoints],
  );
  if (sec < 0) return null;
  const tick = sec * 20;
  const age = Math.floor(tick);
  const showFlash = age <= parryLifeTicks;
  if (showFlash) {
    const key = `efn_parry_flash_main_render${Math.min(5, Math.floor((age * 5) / parryLifeTicks)) + 1}`;
    flashMat.map = mainTexture(key);
  }
  // 火星：游戏按上一刻 → 这一刻插值画
  const pos = sparkPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
  const col = sparkPoints.geometry.getAttribute('aColor') as THREE.BufferAttribute;
  const half = sparkPoints.geometry.getAttribute('aHalf') as THREE.BufferAttribute;
  let drawCount = 0;
  for (const spark of data.sparks) {
    if (tick >= spark.lifespan + 1) continue;
    const sparkPos = interpPathPos(spark.path, tick);
    const k = Math.min(1, Math.max(0, Math.floor(tick) / spark.lifespan));
    pos.setXYZ(drawCount, ...sparkPos);
    col.setXYZ(drawCount, 1, age === 0 ? spark.g0 : 0.7 * (1 - k * 0.9), age === 0 ? spark.b0 : 0.2 * (1 - k * 0.7));
    half.setX(drawCount, spark.base * (1 + k * 0.8));
    drawCount++;
  }
  for (const attr of [pos, col, half]) attr.needsUpdate = true;
  sparkPoints.geometry.setDrawRange(0, drawCount);
  return (
    <>
      {showFlash && <Billboard at={data.flashPos} quad={quad} mat={flashMat} half={parryHalfSize} roll={data.roll} renderOrder={22} />}
      {drawCount > 0 && <primitive object={sparkPoints} />}
    </>
  );
};

// 主画面（不走泛光）的粒子贴图：sRGB、最近邻
const mainTexCache = new Map<string, THREE.DataTexture>();
const mainTexture = (key: string) => {
  let t = mainTexCache.get(key);
  if (!t) {
    const img = nightfallPngs[key];
    t = particleTexture(img.px, img.w, img.h, img.px);
    mainTexCache.set(key, t);
  }
  return t;
};
