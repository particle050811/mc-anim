// 凋灵寂灭（启示录）。出处 goety_revelation 反编译：WitherQuietusSpell、QuietusVirtualEntity、QuietusBeamRenderer、着色器 shaders/core/quietus_beam.{vsh,fsh}；灵魂、烟是原版 SOUL、SMOKE。
// 放出来的那一刻：
// - 光束（QuietusBeamRenderer）：从施法者半身高到目标半身高的一根圆柱（24 边、两头封口），没有贴图，全靠着色器画：
//   进度 = 年龄 ÷ 8 刻；半径 = 0.15 × (1 − smoothstep(0.2, 1, 进度))；芯近黑、侧对视线的边缘（和封口的外圈）是红的，
//   噪声把红边宽度和颜色搅乱，进度过 0.2 以后按噪声一块块蚀掉、整体透明度也降到 0。
//   普通 alpha 混合、做深度测试、不写深度、只画正面。下面的着色器是照 quietus_beam.{vsh,fsh} 移植到 three 的（算式和常数原样，变量换了名）；
//   原文件是私有资产 数据/着色器/启示录/quietus_beam.*（All Rights Reserved），asset: 引进来只有 URL、拿不到文本，所以没有直接读它。
//   Seed 游戏里是 (实体 id & 0xFFFF) × 0.125，这里用 种子 × 0.125。
// - 烟：光束第 1 刻沿线每 0.5 格放一颗原版 SMOKE（从 1 格处到束长）。
// - 灵魂：目标半身高处撒原版 SOUL 28～34 颗（nextInt(18, 25) + 10），竖直散布 0.02，速度 高斯 × 0.12（0.07 + 0.05）。
//   SoulParticle：半边长 (0.1～0.2) × 1.5，摩擦 0.96，没有重力，贴图 soul_0～10 按年龄换，半透明粒子表，寿命 4 ÷ (随机 × 0.9 + 0.1) 刻。
// 没做：目标身上的寂灭状态效果；灵魂粒子构造时父类加的那点随机初速（× 0.01，小到看不出）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 减, 乘, 长, 单位 } from '../零件/弹道.ts';
import { 服务端撒, 贴图粒子, VanillaParticles, type ParticleSpawn, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import 元, { 寂灭束刻, 寂灭落点 } from './凋灵寂灭.元.ts';
import 魂0 from 'asset:贴图/法术/minecraft/particle/soul_0';
import 魂1 from 'asset:贴图/法术/minecraft/particle/soul_1';
import 魂2 from 'asset:贴图/法术/minecraft/particle/soul_2';
import 魂3 from 'asset:贴图/法术/minecraft/particle/soul_3';
import 魂4 from 'asset:贴图/法术/minecraft/particle/soul_4';
import 魂5 from 'asset:贴图/法术/minecraft/particle/soul_5';
import 魂6 from 'asset:贴图/法术/minecraft/particle/soul_6';
import 魂7 from 'asset:贴图/法术/minecraft/particle/soul_7';
import 魂8 from 'asset:贴图/法术/minecraft/particle/soul_8';
import 魂9 from 'asset:贴图/法术/minecraft/particle/soul_9';
import 魂10 from 'asset:贴图/法术/minecraft/particle/soul_10';

const 魂类: 粒子类 = { 帧: [魂0, 魂1, 魂2, 魂3, 魂4, 魂5, 魂6, 魂7, 魂8, 魂9, 魂10].map(png), 选帧: '按年龄', 重力: 0, 摩擦: 0.96, 混合: '半透明' };

const 顶点着色 = `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uLength;
uniform float uProgress;
varying vec3 vEyePos;
varying vec3 vEyeNormal;
varying vec3 vNoisePos;
varying float vCap;
void main() {
  float progress = clamp(uProgress, 0.0, 1.0);
  float radius = 0.15 * (1.0 - smoothstep(0.2, 1.0, progress));
  vec3 scaled = vec3(position.x * radius, position.y * uLength, position.z * radius);
  vec4 mvPosition = modelViewMatrix * vec4(scaled, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vEyePos = mvPosition.xyz;
  vEyeNormal = mat3(modelViewMatrix) * normal;
  vNoisePos = vec3(position.x, position.y * uLength, position.z);
  vCap = abs(normal.y);
  #include <logdepthbuf_vertex>
}
`;
const 片元着色 = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uProgress;
uniform float uSeed;
varying vec3 vEyePos;
varying vec3 vEyeNormal;
varying vec3 vNoisePos;
varying float vCap;
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float valueNoise(vec3 p) {
  vec3 c = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  float lower = mix(mix(hash3(c), hash3(c + vec3(1.0, 0.0, 0.0)), w.x), mix(hash3(c + vec3(0.0, 1.0, 0.0)), hash3(c + vec3(1.0, 1.0, 0.0)), w.x), w.y);
  float upper = mix(mix(hash3(c + vec3(0.0, 0.0, 1.0)), hash3(c + vec3(1.0, 0.0, 1.0)), w.x), mix(hash3(c + vec3(0.0, 1.0, 1.0)), hash3(c + vec3(1.0, 1.0, 1.0)), w.x), w.y);
  return mix(lower, upper, w.z);
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  #include <logdepthbuf_fragment>
  float progress = clamp(uProgress, 0.0, 1.0);
  float decay = smoothstep(0.2, 1.0, progress);
  vec3 seedOffset = fract(vec3(uSeed) * vec3(0.1031, 0.11369, 0.13787)) * 127.0;
  vec3 np = vNoisePos * vec3(2.3, 1.7, 2.3) + seedOffset;
  np.y -= progress * 3.0;
  float noise = (2.0 * valueNoise(np) + valueNoise(np * 2.0 + vec3(19.1, 7.7, 31.3))) / 3.0;

  vec3 n = vEyeNormal * inversesqrt(max(dot(vEyeNormal, vEyeNormal), 0.000001));
  vec3 v = -vEyePos * inversesqrt(max(dot(vEyePos, vEyePos), 0.000001));
  float facing = abs(dot(n, v));
  float sideWidth = mix(0.26, 0.44, noise);
  float sideAA = max(fwidth(facing), 0.001);
  float sideRim = 1.0 - smoothstep(sideWidth - sideAA, sideWidth + sideAA, facing);
  float capDistance = 1.0 - length(vNoisePos.xz);
  float capWidth = mix(0.045, 0.10, noise);
  float capAA = max(fwidth(capDistance), 0.001);
  float capRim = 1.0 - smoothstep(capWidth - capAA, capWidth + capAA, capDistance);
  float rim = mix(sideRim, capRim, clamp(vCap, 0.0, 1.0));

  float field = noise - mix(-0.12, 1.12, decay) - 0.08 * rim;
  float erosionAA = max(fwidth(noise), 0.012);
  float breakup = smoothstep(0.0, 0.16, decay);
  float coverage = mix(1.0, smoothstep(-erosionAA, erosionAA, field), breakup);
  float erosionRim = (1.0 - smoothstep(erosionAA, erosionAA + 0.065, field)) * breakup;
  float edge = max(rim * mix(0.55, 1.0, smoothstep(0.18, 0.7, noise)), erosionRim * 0.9);
  vec3 coreColor = vec3(0.006, 0.0008, 0.0012);
  vec3 rimColor = mix(vec3(0.68, 0.008, 0.025), vec3(1.0, 0.04, 0.09), noise);
  vec3 beamColor = mix(coreColor, rimColor, edge);
  float alpha = coverage * (1.0 - decay);
  // 游戏里这些数直接写进 sRGB 帧缓冲；three 这边在线性空间出色，先换成线性再走它的输出转换
  gl_FragColor = vec4(toLinear(beamColor), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const 光束: React.FC<{ 起: 点; 终: 点; 进度: number; 种子: number }> = ({ 起, 终, 进度, 种子 }) => {
  const { geo, mat } = useMemo(() => {
    // 圆柱沿局部 +Y，底在原点、高 1、半径 1（长度和半径在着色器里乘）
    const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false);
    g.translate(0, 0.5, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uLength: { value: 1 }, uProgress: { value: 0 }, uSeed: { value: 0 } },
      vertexShader: 顶点着色,
      fragmentShader: 片元着色,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    return { geo: g, mat: m };
  }, []);
  const 向 = 减(终, 起);
  mat.uniforms.uLength!.value = 长(向);
  mat.uniforms.uProgress!.value = 进度;
  mat.uniforms.uSeed!.value = 种子 * 0.125;
  const d = 单位(向);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));
  return <mesh geometry={geo} material={mat} position={[起[0], 起[1], 起[2]]} quaternion={q} frustumCulled={false} />;
};

const 凋灵寂灭: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 落 = 寂灭落点(目标);
  const 向 = 单位(减(落, 起点));
  const 距 = 长(减(落, 起点));
  const 烟: ParticleSpawn[] = [];
  for (let i = 1, k = 0; i < 距; i += 0.5, k++) {
    const p = 加(起点, 乘(向, i));
    烟.push({ 种: 'smoke', 刻: 1, p: [p[0], p[1], p[2]], v: [0, 0, 0], 种子: 种子 * 211 + k });
  }
  const r = rng(种子 * 7919 + 17);
  const 魂数 = 18 + Math.floor(r() * 7) + 10;
  const 魂们: 粒子出生[] = 服务端撒(落, 魂数, [0, 0, 0.02], 0.12, 种子 + 3).map((撒, i) => {
    const 抽 = rng(种子 * 131 + i);
    return { 刻: 0, 位: 撒.位, 速: 撒.速, 寿命: Math.floor(4 / (抽() * 0.9 + 0.1)), 半径: 0.1 * (抽() * 0.5 + 0.5) * 2 * 1.5, 种子: i };
  });
  return (
    <>
      {刻 < 寂灭束刻 && <光束 起={起点} 终={落} 进度={刻 / 寂灭束刻} 种子={种子} />}
      <VanillaParticles spawns={烟} 秒={秒} />
      <贴图粒子 类={魂类} 出生们={魂们} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 凋灵寂灭);
