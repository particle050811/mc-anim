// 主世界的云（照 Photon 光影，参考视频作者亲口说用的 photon-main，整合包里是提交 40adec3，默认设置）：积云、高积云（体积）、卷云和卷积云（平面），加云影。
// 移植自 Photon include/sky/clouds.glsl、clouds/{common,constants,coverage_map,cumulus,altocumulus,cirrus}.glsl、include/weather/clouds.glsl、
// include/lighting/cloud_shadows.glsl：Photon Shaders License Agreement, Copyright © 2021-2025 Benjamin Stott ("SixthSurge")，许可证全文见 engine/light/大气/Photon-LICENSE.txt。
// 尺度：云在「云空间」里算，方块世界的位置、高度（离海平面）× CLOUDS_SCALE 进云空间（用户 10-14 定：云照视频，不迁就编排）。
// 风停住（world_age = 0），云不随帧动：各段首尾帧接得上。积云的局部覆盖图不预先画成图，直接算（同 Photon 不开 CLOUDS_CUMULUS_PRECOMPUTE_LOCAL_COVERAGE 时的写法），
// 视距照 Photon 开预计算时的覆盖图范围在云空间 67.5～75 公里外淡掉。浓积云（天气偏热、湿、大风才有）、夜光云、曙暮光、闪电没搬。
// 接入：lib/大气.ts 的 <Atmosphere />（或只开云的 <CloudOnlyAtmosphere />）打开，<PhotonClouds /> 给天气和加云、把这一遍登记进屏幕AO 的中间步骤（lib/体素/中间步骤.ts），屏幕AO 第 2 遍用 `PHOTON_CLOUD_SHADOW_GLSL`。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL, atmoLightAt, atmoUniforms, atmosphere, photonCloudsOn } from '../大气.ts';
import { registerMidPass, type MidPassContext } from '../../voxel/中间步骤.ts';

// 云高（用户 10-14：世界放大了，云高改合理）：Photon 默认 10 是按原版地形定的，云底离海只有 120 格。我们的史诗地形最高峰 y 435～444，
// 取 3：积云一团团云底在 y 363～1163（见 cumulusHeightMap），下坠和 6-2-5 俯冲都穿过；高积云 y 1130～1290；
// 卷云 y 2063 在悬停点以上、6-2-5 开头（y 约 2564）以下，悬停时头顶脚下都有云
export const CLOUDS_SCALE = 3;

// ---------- 天气 → 云的参数（include/weather/clouds.glsl 的 get_clouds_parameters；不下雨） ----------
export type CloudWeather = { temperature: number; humidity: number; wind: number };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const linearStep = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const dampen = (x: number) => {
  const c = clamp01(x);
  return c * (2 - c);
};
const lift = (x: number, a: number) => (x + x * a) / (1 + x * a);
const cubicSmooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const cloudParams = (w: CloudWeather, sunY: number) => {
  const { temperature: T, humidity: H, wind: W } = w;
  const dayFactor = smooth(0, 1, Math.abs(sunY) / 0.3);
  const l0Blend = clamp01(dampen(linearStep(0.5, 1, 1 - T)) * dampen(1 - W));
  const tw = 1 - 0.15 * linearStep(0.6, 1, T);
  const hw = 0.4 * H + 0.5 * H * H;
  const local = 0.1 + 0.1 * W;
  const l0Cov = [clamp01(tw * hw - 0.1 * local + 0.3 * l0Blend * l0Blend), clamp01(tw * hw + local + 0.3 * l0Blend * l0Blend)];
  const torn = linearStep(0.66, 0.9, W) * (1 - l0Blend);
  const l0Detail = [mix(0.33 * (1 + 0.5 * torn), 0.07, l0Blend * l0Blend), mix(0.4 * (1 + 0.5 * torn), 0.1, l0Blend)];
  const l0Edge = [mix(3, 2, l0Blend * l0Blend), mix(12, 7, l0Blend * l0Blend)];
  const l0AltScale = 0.8 / (mix(0.5, 1, smooth(0.4, 0.6, 0.25 * l0Cov[0] + 0.75 * l0Cov[1])) * 1200);
  const l1Blend = cubicSmooth(linearStep(0.5, 0.66, 1 - T));
  const ac = (linearStep(0.4, 1, H) * 0.5 + 0.5) * linearStep(0.4, 0.66, W) * linearStep(1, 0.8, T);
  const as = linearStep(0.25, 0.45, W * H);
  const l1Cov = [clamp01(mix(ac * 0.5, as, l1Blend)), clamp01(mix(ac * 1.5, as, l1Blend))];
  const cirrus = clamp01(0.5 * (0.6 - 0.4 * linearStep(0.5, 0.9, T) ** 2 + 0.4 * (1 - linearStep(0, 0.2, T))) * (1 - 0.5 * linearStep(0.5, 0.75, H)));
  const cirrocumulus = 0.8 * dampen((1 - 0.3 * linearStep(0.5, 1, T)) * (0.5 + 0.5 * linearStep(0.4, 1, H)) * W ** 1.5);
  const l0Shadow = linearStep(0.7, 1, (0.25 * l1Cov[0] + 0.75 * l1Cov[1]) * (1 + l1Blend)) * dampen(dayFactor);
  let ext = mix(0.05, 0.1, smooth(0, 0.3, Math.abs(sunY))) * (1 - 0.6 * l0Shadow);
  ext *= 1 - 0.4 * linearStep(0.8, 1, l0Cov[1] - l0Cov[1] * l0Blend);
  ext *= 1 - 0.5 * l0Blend;
  return { l0Cov, l0Detail, l0Edge, l0AltScale, l0Blend, l0Ext: ext, l0Shadow, l1Cov, l1Blend, cirrus, cirrocumulus, dayFactor, lift };
};

// ---------- 共用 uniform（云这一遍和屏幕AO 第 2 遍的云影共用同一份对象） ----------
const v4 = () => new THREE.Vector4();
export const cloudUniforms = {
  pcNoise: { value: null as THREE.Texture | null },
  pcCuHeight: { value: null as THREE.Texture | null }, // 每团积云的高度（cumulusHeightMap）
  pcWorleyB: { value: null as THREE.Texture | null },
  pcWorleyS: { value: null as THREE.Texture | null },
  pcCamXZ: { value: new THREE.Vector2() }, // 云空间里镜头的水平位置（世界 x、z × CLOUDS_SCALE）
  pcCamR: { value: 6371e3 }, // 云空间里镜头到地心
  pcSeaY: { value: 0 }, // 海平面的世界高度
  pcL0A: { value: v4() }, // 积云：覆盖下限、上限，两层 Worley 侵蚀权重
  pcL0B: { value: v4() }, // 积云：边缘锐化（底、顶），高度比例，层云混合
  pcL0C: { value: v4() }, // 积云：消光（= 散射），上层遮挡，噪声就绪（1），白天系数
  pcL1: { value: v4() }, // 高积云：覆盖下限、上限，层云混合，正午系数
  pcCi: { value: new THREE.Vector2() }, // 卷云、卷积云的量
  pcAdd: { value: [0, 1, 2, 3].map(() => v4()) }, // 加云：云空间水平位置 x、z，半径，覆盖
  pcAddN: { value: 0 },
  pcNear: { value: new THREE.Vector2(1, 1) }, // 去云：镜头周围云空间里多远以内删掉，软边宽
  pcClear: { value: v4() }, // 让开：云空间水平位置 x、z，半径（0 = 不让），软边
  pcLight: { value: [0, 1, 2].map(() => new THREE.Vector3()) }, // 三层所在高度的日光
};

// ---------- GLSL ----------
// 共用：常数、工具函数、三层的密度（云影也要用）。世界坐标 Y 朝上，云空间原点在地心正上方的镜头处，水平位置另加 pcCamXZ
export const PHOTON_CLOUD_COMMON_GLSL = /* glsl */ `
precision highp sampler3D;
uniform sampler2D pcNoise;
uniform sampler2D pcCuHeight;
uniform sampler3D pcWorleyB;
uniform sampler3D pcWorleyS;
uniform vec2 pcCamXZ;
uniform float pcCamR;
uniform float pcSeaY;
uniform vec4 pcL0A;
uniform vec4 pcL0B;
uniform vec4 pcL0C;
uniform vec4 pcL1;
uniform vec2 pcCi;
uniform vec4 pcAdd[4];
uniform int pcAddN;
uniform vec2 pcNear;
uniform vec4 pcClear;
uniform vec3 pcLight[3];
#define PC_S ${CLOUDS_SCALE.toFixed(1)}
#define PC_R 6371e3
#define PC_EPS 1e-6
#define PC_PI 3.14159265
#define PC_ISO 0.0795774715
#define PC_CU_R (PC_R + 900.0)
#define PC_CU_BH 2400.0
#define PC_CU_T 1200.0
#define PC_CU_TOP (PC_CU_R + PC_CU_BH + PC_CU_T)
#define PC_AC_R (PC_R + 3200.0)
#define PC_AC_T 480.0
#define PC_AC_TOP (PC_R + 3680.0)
#define PC_CI_R (PC_R + 6000.0)
#define PC_CI_THICK 1500.0
#define PC_CI_T 900.0
#define PC_CI_EXT 0.15

float pcSqr(float x) { return x * x; }
float pcLs(float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }
float pcDampen(float x) { x = clamp(x, 0.0, 1.0); return x * (2.0 - x); }
float pcLift(float x, float a) { return (x + x * a) / (1.0 + x * a); }
float pcCubic(float x) { return x * x * (3.0 - 2.0 * x); }
float pcPow15(float x) { return x * sqrt(x); }
vec2 pcHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 pcHash2(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// 球求交：(r − R)(r + R) 代替 |o|² − R²，地心在几千公里外，单精度直接相减会丢光
vec2 pcSphere(vec3 o, vec3 d, float R) {
  float b = dot(o, d);
  float r = length(o);
  float disc = b * b - (r - R) * (r + R);
  if (disc < 0.0) return vec2(-1.0);
  disc = sqrt(disc);
  return -b + vec2(-disc, disc);
}
vec2 pcShell(vec3 o, vec3 d, float ri, float ro) {
  vec2 a = pcSphere(o, d, ri);
  vec2 b = pcSphere(o, d, ro);
  if (b.y < 0.0) return vec2(-1.0);
  bool ai = a.y >= 0.0;
  return vec2(ai && a.x < 0.0 ? a.y : max(b.x, 0.0), ai && a.x > 0.0 ? a.x : b.y);
}
// iquilezles 的梯度噪声 → curl
vec2 pcPerlinGrad(vec2 coord) {
  vec2 i = floor(coord);
  vec2 f = fract(coord);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 g0 = pcHash2(i), g1 = pcHash2(i + vec2(1.0, 0.0)), g2 = pcHash2(i + vec2(0.0, 1.0)), g3 = pcHash2(i + vec2(1.0, 1.0));
  float v0 = dot(g0, f), v1 = dot(g1, f - vec2(1.0, 0.0)), v2 = dot(g2, f - vec2(0.0, 1.0)), v3 = dot(g3, f - vec2(1.0, 1.0));
  return g0 + u.x * (g1 - g0) + u.y * (g2 - g0) + u.x * u.y * (g0 - g1 - g2 + g3) + du * (u.yx * (v0 - v1 - v2 + v3) + vec2(v1, v2) - v0);
}
vec2 pcCurl(vec2 c) { vec2 g = pcPerlinGrad(c); return vec2(g.y, -g.x); }

// 去云（用户 10-14：云挨着镜头挡视线就删掉）：镜头周围一个球里的云清掉，穿云时只看到四周的云擦过，不整屏发白。
// 让开：竖直圆柱里积云、高积云清掉，城上空是云层里一块缺口，看城的镜头从哪个角度都看得见；圆柱半径按方位用噪声在 0.6～1.4 倍间起伏（绕一圈 8 个噪声格）。
// 返回 (镜头周围, 让开) 的保留比例
vec2 pcKeep(vec3 pos, vec2 xz) {
  vec2 k = vec2(smoothstep(pcNear.x, pcNear.x + pcNear.y, distance(pos, vec3(0.0, pcCamR, 0.0))), 1.0);
  if (pcClear.z > 0.0) {
    vec2 v = xz - pcClear.xy;
    float w = 0.6 + 0.8 * texture(pcNoise, vec2(0.3, 0.6) + v / max(length(v), 1e-3) * (8.0 / 6.2831853 / 512.0)).x;
    k.y = smoothstep(pcClear.z * w, pcClear.z * w + pcClear.w, length(v));
  }
  return k;
}

// 加云（用户 10-14：下降时加一朵就行）：加在高积云层，6-3-4 跟拍那几秒穿过它。圈里把这一层的覆盖抬到 pcAdd.w，形状还是噪声出的；
// 圈的半径用噪声在 0.6～1.4 倍间起伏成几瓣。返回抬到的覆盖（圈外 0）
float pcAddBoost(vec2 xz) {
  float boost = 0.0;
  float wob = 0.6 + 0.8 * texture(pcNoise, 0.0000065 * xz + 0.5).y;
  for (int i = 0; i < 4; i++) {
    if (i >= pcAddN) break;
    boost = max(boost, pcAdd[i].w * (1.0 - smoothstep(0.25 * pcAdd[i].z, pcAdd[i].z, distance(xz, pcAdd[i].xy) / wob)));
  }
  return boost;
}

// ---- 积云 ----
// 积云照 Photon 单层算，再把每一团整团挪到自己的高度（用户 10-14：云不该都挤在 +400 米一层，云底随机在海平面以上 300～1100 米，用户 10-14 比过 400～4000 后定）。
// 每团的高度存在 pcCuHeight（和覆盖的细噪声同一套纹理坐标），一团里处处一样，云底是平的、不会被拉斜
float pcCuBase(vec2 xz) { return PC_CU_R + PC_CU_BH * texture(pcCuHeight, 0.000027 * xz).r; }
float pcCuCoverage(vec2 xz) {
  vec2 n = vec2(texture(pcNoise, 0.000002 * xz).x, texture(pcNoise, 0.000027 * xz).w);
  float cu = 0.0, st = 0.0;
  if (pcL0B.w < 1.0 - PC_EPS) cu = pcLs(1.0 - mix(pcL0A.x, pcL0A.y, n.x), 1.0, n.y);
  if (pcL0B.w > PC_EPS) {
    st = pcCubic(pcLs(0.9 - pcL0A.x, 1.0, 2.0 * n.x * pcL0A.y));
    st = 0.5 * st + st * pcLs(0.3, 0.6, n.y);
    st = st / (st + 1.0);
  }
  return mix(cu, st, pcL0B.w);
}
float pcCuDensity(vec3 pos, bool detail) {
  float r = length(pos);
  if (r < PC_CU_R || r > PC_CU_TOP) return 0.0;
  vec2 xz = pos.xz + pcCamXZ;
  vec2 keep = pcKeep(pos, xz);
  float d = pcCuCoverage(xz) * keep.x * keep.y;
  if (d < PC_EPS) return 0.0;
  float h = r - pcCuBase(xz);
  if (h < 0.0 || h > PC_CU_T) return 0.0;
  float af = h * pcL0B.z;
  if (pcL0B.w > PC_EPS) d = mix(d, clamp(d * pcDampen(clamp(2.0 * af, 0.0, 1.0) * pcLs(0.0, 0.1, af) * pcLs(0.0, 0.6, 1.0 - af)), 0.0, 1.0), pcL0B.w);
  d -= smoothstep(0.2, 1.0, af) * (0.6 - 0.3 * pcL0B.w);
  d *= smoothstep(0.0, 0.2, af);
  if (d < PC_EPS) return 0.0;
  vec3 wp = vec3(xz.x, pos.y, xz.y);
  float w0 = detail ? texture(pcWorleyB, wp * 0.0009).x : 0.5;
  float w1 = detail ? texture(pcWorleyS, wp * 0.005).x : 0.5;
  float fade = 0.20 * smoothstep(0.85, 1.0, 1.0 - af) - 0.35 * smoothstep(0.05, 0.5, af) + 0.6;
  d -= pcL0A.z * pcSqr(w0) * pcDampen(1.0 - d);
  d -= pcL0A.w * pcSqr(w1) * pcDampen(1.0 - d) * fade;
  d = max(d, 0.0);
  d = pcLift(d, mix(pcL0B.x, pcL0B.y, af));
  return d * (0.1 + 0.9 * smoothstep(0.2, 0.7, af));
}

// ---- 高积云 ----
float pcAcDensity(vec3 pos, bool detail) {
  float r = length(pos);
  if (r < PC_AC_R || r > PC_AC_TOP) return 0.0;
  float af = 0.8 * (r - PC_AC_R) / (PC_AC_T * mix(0.5, 1.0, smoothstep(0.4, 0.6, pcL1.y)));
  vec2 xz = pos.xz + pcCamXZ;
  vec4 n = vec4(texture(pcNoise, 0.000005 * xz + 0.01).x, texture(pcNoise, 0.000047 * xz + 0.3).wx, texture(pcNoise, 0.0001 * xz + 0.6).w);
  float boost = pcAddBoost(xz);
  float added = pcAddN > 0 ? boost / pcAdd[0].w : 0.0; // 加的云在这里的比例
  float ac = max(mix(pcL1.x, pcL1.y, pcDampen(n.x)), boost);
  ac = pcLs(pcSqr(1.0 - ac), 1.0, n.y);
  ac -= 1.9 * pcSqr(1.0 - n.w) * pcDampen(1.0 - ac);
  ac -= smoothstep(0.2, 1.0, af) * 0.6;
  ac *= smoothstep(0.0, 0.2, af);
  float as_ = pcCubic(pcLs(0.9 - pcL1.x, 1.0, 2.0 * n.x * pcL1.y));
  as_ = 0.5 * as_ + as_ * pcLs(0.3, 0.6, n.y);
  as_ = 0.5 * as_ + as_ * pcLs(0.3, 0.7, n.z);
  as_ = as_ / (as_ + 1.0);
  as_ *= pcDampen(clamp(2.0 * af, 0.0, 1.0) * pcLs(0.0, 0.1, af) * pcLs(0.0, 0.6, 1.0 - af));
  as_ = clamp(as_, 0.0, 1.0);
  vec2 keep = pcKeep(pos, xz);
  float d = mix(ac, as_, pcL1.z * (1.0 - added)) * keep.x * max(keep.y, added);
  if (d < PC_EPS) return 0.0;
  float w = detail ? texture(pcWorleyS, vec3(xz.x, pos.y, xz.y) * 0.003).x : 0.5;
  d -= 0.3 * pcSqr(w) * pcDampen(1.0 - d) * (1.0 - 0.85 * pcL1.z);
  vec2 e = mix(vec2(3.0, 14.0), vec2(2.0, 7.0), pcL1.z);
  d = max(d, 0.0);
  d = pcLift(d, mix(e.x, e.y, af));
  return d * (0.1 + 0.9 * smoothstep(0.2, 0.7, af));
}

// ---- 卷云、卷积云（平面，coord = 球面上的水平位置） ----
float pcCiDensity(vec2 coord, float af) {
  coord += pcCamXZ;
  vec2 curl = pcCurl(0.00002 * coord) * 0.5 + pcCurl(0.00004 * coord) * 0.25 + pcCurl(0.00008 * coord) * 0.125;
  float hs = 1.0 - abs(1.0 - 2.0 * af);
  float ci = 0.7 * texture(pcNoise, 0.000001 * coord + 0.0032 * curl).x + 0.3 * texture(pcNoise, 0.000008 * coord + 0.0064 * curl).x;
  ci = pcLs(0.7 - pcCi.x, 1.0, ci);
  float amp = 0.2, freq = 0.00002, cs = 0.08;
  for (int i = 0; i < 4; i++) {
    ci -= texture(pcNoise, coord * freq + curl * cs).x * amp;
    amp *= 0.6;
    freq *= 2.0;
    cs *= 4.0;
  }
  ci = mix(1.0, 0.75, pcL0C.w) * pow(max(ci, 0.0), 3.0) * pcSqr(hs) * 0.5;
  float cov = 5.0 * pcLs(0.25, 0.9, pcCi.y * texture(pcNoise, 0.0000026 * coord + 0.25).w);
  float cc = pcDampen(texture(pcNoise, 0.000025 * coord + 0.033 * curl).w);
  cc = pcLs(1.0 - cov, 1.0, cc);
  vec2 cc2 = pcCurl(0.001 * coord);
  cc -= pcSqr(texture(pcNoise, coord * 0.00005 + 0.003 * cc2).y);
  cc -= pcSqr(texture(pcNoise, coord * 0.0002 + 0.007 * cc2).y) * 0.5;
  cc -= pcSqr(texture(pcNoise, coord * 0.0008 + 0.03 * cc2).y) * 0.1;
  cc = max(cc, 0.0);
  cc = 0.25 * pow(cc, 4.0) * hs;
  return ci + cc;
}`;

// 云影（cloud_shadows.glsl 的 render_cloud_shadow_map + get_cloud_shadows，逐像素直接算、不画阴影图）：rel = 着色点 − 镜头（世界坐标），y = 着色点世界高度。
// 返回日光那一份要乘的系数（强度 0.8）
export const PHOTON_CLOUD_SHADOW_GLSL = /* glsl */ `
float pcCloudShadow(vec3 rel, float y, vec3 L) {
  if (L.y < 0.05 || pcL0C.z < 0.5) return 1.0;
  vec3 o = vec3(PC_S * rel.x, PC_R + PC_S * (y - pcSeaY), PC_S * rel.z);
  float shadow = 1.0;
  float t = pcSphere(o, L, PC_CU_R + 0.5 * PC_CU_BH).y;
  t = pcSphere(o, L, pcCuBase((o + L * t).xz + pcCamXZ) + 0.25 * PC_CU_T).y;
  shadow *= exp(-0.25 * pcL0C.x * PC_CU_T / (abs(L.y) + PC_EPS) * pcCuDensity(o + L * t, false));
  float ext = mix(0.05, 0.1, pcL0C.w) * 0.1;
  t = pcSphere(o, L, PC_AC_R + 0.5 * PC_AC_T).y;
  shadow *= exp(-ext * PC_AC_T / (abs(L.y) + PC_EPS) * pcAcDensity(o + L * t, false));
  t = pcSphere(o, L, PC_CI_R).y;
  shadow *= exp(-PC_CI_EXT * PC_CI_T / (abs(L.y) + PC_EPS) * pcCiDensity((o + L * t).xz, 0.5)) * 0.5 + 0.5;
  float fade = smoothstep(0.05, 0.15, L.y) * (1.0 - pcLs(PC_CU_R, PC_CU_TOP, length(o)));
  return (shadow * fade + 1.0 - fade) * 0.8 + 0.2;
}`;

// 画云：clouds.glsl 的 draw_clouds（积云 → 高积云 → 卷云，按距离前后叠）。云空间里求交、步进；结果是线性的散射光（已含空气透视）和透过率
const PHOTON_CLOUD_DRAW_GLSL = /* glsl */ `
float pcPhaseHG(float nu, float g) { float gg = g * g; return (PC_ISO - PC_ISO * gg) / pcPow15(1.0 + gg - 2.0 * g * nu); }
float pcPhaseKN(float nu, float e) { return e / (6.2831853 * (e - e * nu + 1.0) * log(2.0 * e + 1.0)); }
float pcPhaseSingle(float c) { return 0.8 * max(pcPhaseKN(c, 2600.0), pcPhaseHG(c, 0.8)) + 0.2 * pcPhaseHG(c, -0.2); }
float pcPhaseMulti(float c, vec3 g) { return 0.65 * pcPhaseHG(c, g.x) + 0.10 * pcPhaseHG(c, g.y) + 0.25 * pcPhaseHG(c, -g.z); }
float pcPowder(float d, float c) { float p = PC_PI * d / (d + 0.15); return mix(p, 1.0, 0.8 * pcSqr(c * 0.5 + 0.5)); }
struct PcRes { vec3 s; float T; float dist; };
PcRes pcNone() { return PcRes(vec3(0.0), 1.0, 1e5); }
// clouds_aerial_perspective（CLOUDS_AERIAL_PERSPECTIVE_BOOST 1：距离 × 2）
vec3 pcAerial(vec3 s, float T, vec3 o, vec3 e, vec3 d, vec3 sky) {
  e = o + 2.0 * (e - o);
  vec3 at = dot(o, o) < dot(e, e)
    ? clamp(atmoTrans(o, d) / max(atmoTrans(e, d), vec3(1e-9)), 0.0, 1.0)
    : clamp(atmoTrans(e, -d) / max(atmoTrans(o, -d), vec3(1e-9)), 0.0, 1.0);
  return mix((1.0 - T) * sky, s, at);
}
PcRes pcBlend(PcRes a, PcRes b) {
  bool bf = b.dist < a.dist;
  return PcRes((bf ? b.s : a.s) + (bf ? b.T : a.T) * (bf ? a.s : b.s), a.T * b.T, min(a.dist, b.dist));
}

float pcCuOD(vec3 p, vec3 d, float dither, int n) {
  vec4 st = vec4(d, 1.0) * (0.1 * PC_CU_T / float(n));
  float od = 0.0;
  for (int i = 0; i < n; i++) {
    st *= 2.0;
    od += pcCuDensity(p + st.xyz * dither, true) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes pcCumulus(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (pcL0A.y < PC_EPS && pcAddN == 0) return pcNone();
  float r = length(o);
  vec2 ds = pcShell(o, rd, PC_CU_R, PC_CU_TOP);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < PC_CU_R || dT >= 0.0 && r < PC_CU_R && dT < ds.x) return pcNone();
  float len = clamp((dT >= 0.0 ? dT : ds.y) - ds.x, 0.0, 2e4);
  // 层比 Photon 的厚（各团高度不同），步数按 Photon 一层厚时的步长定，不按固定步数（步子太长会漏掉薄云、拉出竖条）
  float slP = PC_CU_T / max(abs(rd.y), PC_CU_T / 2e4) / mix(float(PC_CU_H), float(PC_CU_Z), abs(rd.y));
  int steps = int(min(ceil(len / max(slP, 1.0)), float(PC_CU_MAX)));
  float sl = len / float(max(steps, 1));
  vec3 st = rd * sl;
  vec3 ro = o + rd * (ds.x + sl * dither);
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float bounced = 0.4 * L.y / PC_PI;
  float ext = pcL0C.x, sh = pcL0C.y;
  float fall = 0.55 * mix(pcLift(clamp(ext / 0.1, 0.0, 1.0), 0.33), 1.0, c * 0.5 + 0.5);
  float ph0 = pcPhaseSingle(c);
  vec2 sc = vec2(0.0);
  float T = 1.0, dsum = 0.0, wsum = 0.0;
  for (int i = 0; i < PC_CU_MAX; i++) {
    if (i >= steps || T < 0.075) break;
    vec3 p = ro + st * float(i);
    float dens = pcCuDensity(p, true);
    if (dens < PC_EPS) continue;
    float dist = distance(ro, p);
    dens *= smoothstep(1.0, 0.95, dist / 2e4);
    dens *= smoothstep(1.0, 0.9, length(p.xz) / 7.5e4);
    float sT = exp(-dens * ext * sl);
    vec2 h = pcHash2(fract(p));
    float lod = pcCuOD(p, L, h.x, PC_CU_LIGHT);
    float sod = pcCuOD(p, vec3(0.0, 1.0, 0.0), h.y, PC_CU_AMB);
    float af = (length(p) - pcCuBase(p.xz + pcCamXZ)) / PC_CU_T;
    float god = mix(dens, 1.0, clamp(af * 2.0 - 1.0, 0.0, 1.0)) * af * PC_CU_T;
    // clouds_cumulus_scattering
    vec2 s = vec2(0.0);
    float sa = ext, ea = ext;
    float pw = pcPowder(dens + dens * pcL0B.w, c);
    float ph = ph0;
    vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + lod));
    for (int k = 0; k < 8; k++) {
      s.x += sa * exp(-ea * lod) * ph * (1.0 - 0.5 * sh);
      s.x += sa * exp(-ea * god) * PC_ISO * bounced;
      s.x += sa * exp(-ea * sod) * PC_ISO * sh * 0.5;
      s.y += sa * exp(-ea * sod) * PC_ISO;
      sa *= fall * pw;
      ea *= 0.4;
      g *= 0.8;
      pw = mix(pw, sqrt(pw), 0.5);
      ph = pcPhaseMulti(c, g);
    }
    sc += s * ((1.0 - sT) / ext) * T;
    T *= sT;
    dsum += dist * dens;
    wsum += dens;
  }
  float cT = pcLs(0.075, 1.0, T);
  vec3 col = pcAerial(sc.x * pcLight[0] + sc.y * atmoAmb, cT, o, ro, rd, sky);
  return PcRes(col, cT, wsum == 0.0 ? 1e6 : dsum / wsum + distance(o, ro));
}

float pcAcOD(vec3 p, vec3 d, float dither, int n) {
  vec4 st = vec4(d, 1.0) * (0.25 * PC_AC_T / float(n));
  float od = 0.0;
  for (int i = 0; i < n; i++) {
    st *= 2.0;
    od += pcAcDensity(p + st.xyz * dither, true) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes pcAltocumulus(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (pcL1.y < PC_EPS) return pcNone();
  int steps = int(mix(float(PC_AC_H), float(PC_AC_Z), abs(rd.y)));
  float r = length(o);
  vec2 ds = pcShell(o, rd, PC_AC_R, PC_AC_TOP);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < PC_AC_R || dT >= 0.0 && r < PC_AC_R && dT < ds.x) return pcNone();
  float len = clamp((dT >= 0.0 ? dT : ds.y) - ds.x, 0.0, 2e4);
  float sl = len / float(steps);
  vec3 st = rd * sl;
  vec3 ro = o + rd * (ds.x + sl * dither);
  float ext = mix(0.08, 0.16, pcL0C.w) * 0.1 * (2.0 - pcL1.z);
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float bounced = 0.4 * L.y / PC_PI;
  float fall = 0.5 * mix(pcLift(clamp(ext / 0.05, 0.0, 1.0), 0.33), 1.0, c * 0.5 + 0.5);
  float ph0 = pcPhaseSingle(c);
  vec2 sc = vec2(0.0);
  float T = 1.0, dsum = 0.0, wsum = 0.0;
  for (int i = 0; i < PC_AC_H; i++) {
    if (i >= steps || T < 0.075) break;
    vec3 p = ro + st * float(i);
    float dens = pcAcDensity(p, true);
    if (dens < PC_EPS) continue;
    float dist = distance(ro, p);
    dens *= 1.0 - smoothstep(0.95, 1.0, dist / 2e4);
    float sT = exp(-dens * ext * sl);
    vec2 h = pcHash2(fract(p));
    float lod = pcAcOD(p, L, h.x, PC_AC_LIGHT);
    float sod = pcAcOD(p, vec3(0.0, 1.0, 0.0), h.y, PC_AC_AMB);
    float af = (length(p) - PC_AC_R) / PC_AC_T;
    float god = mix(dens, 1.0, clamp(af * 2.0 - 1.0, 0.0, 1.0)) * af * PC_AC_T;
    vec2 s = vec2(0.0);
    float sa = ext, ea = ext;
    float pw = pcPowder(dens * (1.5 + 3.5 * pcL1.z), c);
    float ph = ph0;
    vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + lod));
    for (int k = 0; k < 8; k++) {
      s.x += sa * exp(-ea * lod) * ph;
      s.x += sa * exp(-ea * god) * PC_ISO * bounced;
      s.y += sa * exp(-ea * sod) * PC_ISO;
      sa *= fall * pw;
      ea *= 0.45;
      g *= 0.7;
      pw = mix(pw, sqrt(pw), 0.5);
      ph = pcPhaseMulti(c, g);
    }
    sc += s * ((1.0 - sT) / ext) * T;
    T *= sT;
    dsum += dist * dens;
    wsum += dens;
  }
  float cT = pcLs(0.075, 1.0, T);
  vec3 light = pcLight[1] * (1.0 + 0.4 * pcLs(0.5, 0.6, pcL1.x) * pcL1.w);
  vec3 col = pcAerial(sc.x * light + sc.y * atmoAmb, cT, o, ro, rd, sky);
  return PcRes(col, cT, wsum == 0.0 ? 1e6 : dsum / wsum + distance(o, ro));
}

float pcCiOD(vec3 o, vec3 d, float dither) {
  vec2 inner = pcSphere(o, d, PC_CI_R - 0.5 * PC_CI_THICK);
  vec2 outer = pcSphere(o, d, PC_CI_R + 0.5 * PC_CI_THICK);
  float len = min(inner.y >= 0.0 ? inner.x : outer.y, 1e3);
  const float growth = 1.5;
  vec3 p = o;
  vec4 st = vec4(d, 1.0) * (len * (growth - 1.0) / (pow(growth, 6.0) - 1.0) / growth);
  float od = 0.0;
  for (int i = 0; i < 6; i++) {
    st *= growth;
    vec3 q = p + st.xyz * dither;
    float r = length(q);
    float af = (r - PC_CI_R) / PC_CI_THICK + 0.5;
    if (af == clamp(af, 0.0, 1.0)) od += pcCiDensity((q * (PC_CI_R / r)).xz, af) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes pcCirrus(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (pcCi.x < PC_EPS && pcCi.y < PC_EPS) return pcNone();
  float r = length(o);
  vec2 ds = pcSphere(o, rd, PC_CI_R);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < PC_CI_R || dT >= 0.0 && r < PC_CI_R && dT < ds.y) return pcNone();
  float dsph = r < PC_CI_R ? ds.y : ds.x;
  vec3 sp = o + rd * dsph;
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float dens = pcCiDensity(sp.xz, 0.5);
  if (dens < PC_EPS) return pcNone();
  float lod = pcCiOD(sp, L, dither);
  float vT = exp(-0.5 * dens * PC_CI_EXT * PC_CI_THICK / (abs(rd.y) + PC_EPS));
  vec2 s = vec2(0.0);
  float ph = pcPhaseSingle(c);
  vec3 g = vec3(0.6, 0.9, 0.3);
  float pw = 8.0 * (1.0 - exp(-40.0 * dens));
  pw = mix(pw, 1.0, pcPow15(c * 0.5 + 0.5));
  float sa = PC_CI_EXT;
  float ea = PC_CI_EXT * (1.0 + 0.5 * max(smoothstep(0.0, 0.15, abs(L.y)) - smoothstep(0.5, 0.7, pcCi.x), 0.0));
  for (int k = 0; k < 4; k++) {
    s.x += sa * exp(-ea * lod) * ph * pw;
    s.y += sa * exp(-0.33 * PC_CI_THICK * ea * dens) * PC_ISO;
    sa *= 0.5;
    ea *= 0.25;
    g *= 0.5;
    pw = mix(pw, sqrt(pw), 0.5);
    ph = pcPhaseMulti(c, g);
  }
  s *= (1.0 - vT) / PC_CI_EXT;
  vec3 col = pcAerial(s.x * pcLight[2] + s.y * atmoAmb * 1.41, vT, o, sp, rd, sky);
  return PcRes(col, vT, dsph);
}

// rd：世界坐标的视线；sky：这个方向的晴空色（线性）；dT：到地形的距离（方块米，没有地形给负数）。返回 (散射光, 透过率)，apparent = 云的视距离（方块米）
vec4 pcDrawClouds(vec3 rd, vec3 sky, float dT, float dither, out float apparent) {
  vec3 o = vec3(0.0, pcCamR, 0.0);
  float dTc = dT < 0.0 ? -1.0 : dT * PC_S;
  PcRes res = pcCumulus(o, rd, sky, dTc, dither);
  if (!(res.T < 1e-3 && pcCamR < PC_CU_R)) {
    res = pcBlend(res, pcAltocumulus(o, rd, sky, dTc, dither));
    if (!(res.T < 1e-3 && pcCamR < PC_AC_R)) res = pcBlend(res, pcCirrus(o, rd, sky, dTc, dither));
  }
  apparent = res.dist / PC_S;
  return vec4(res.s, res.T);
}`;

// ---------- 云这一遍（全屏横条、预乘叠到画布、写云的前沿深度） ----------
// 步数：Photon 默认积云 40（地平线）～ 20（天顶）、朝太阳 6、朝上 2，高积云 12～6、4、2；Photon 四分之一分辨率画、靠十几帧的时间累积压噪点，
// 我们每帧独立，主步数乘 4
const STEPS = { cuH: 160, cuZ: 80, cuMax: 480, cuLight: 6, cuAmb: 2, acH: 48, acZ: 24, acLight: 4, acAmb: 2 };
const VS = /* glsl */ `
uniform vec2 uStrip;
void main() { gl_Position = vec4(position.x, mix(uStrip.x, uStrip.y, position.y * 0.5 + 0.5), 0.0, 1.0); }`;
const FS = /* glsl */ `
precision highp float;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
${PHOTON_CLOUD_COMMON_GLSL}
#define PC_CU_H ${STEPS.cuH}
#define PC_CU_Z ${STEPS.cuZ}
#define PC_CU_MAX ${STEPS.cuMax}
#define PC_CU_LIGHT ${STEPS.cuLight}
#define PC_CU_AMB ${STEPS.cuAmb}
#define PC_AC_H ${STEPS.acH}
#define PC_AC_Z ${STEPS.acZ}
#define PC_AC_LIGHT ${STEPS.acLight}
#define PC_AC_AMB ${STEPS.acAmb}
${PHOTON_CLOUD_DRAW_GLSL}
uniform sampler2D tDepth;
uniform sampler2D atmoSky;
uniform vec2 uSize;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uLogFar;
uniform float uExposure;
layout(location = 0) out highp vec4 oCol;
layout(location = 1) out highp vec4 oDep;
void main() {
  float d = texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).r;
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  float fwdK = -vdir.z;
  vec3 wdir = mat3(uCamWorld) * vdir;
  float tScene = d >= 1.0 ? -1.0 : (exp2(d * uLogFar) - 1.0) / fwdK;
  // 错开量：4×4 Bayer（不随帧变），合成时 4×4 平均掉（见 COMPOSITE_FS）
  const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 bq = ivec2(gl_FragCoord.xy) & 3;
  float dither = (BAYER[bq.y * 4 + bq.x] + 0.5) / 16.0;
  vec3 sky = atmoSkyAt(atmoSky, vec3(wdir.x, -wdir.z, wdir.y));
  float apparent;
  vec4 c = pcDrawClouds(wdir, sky, tScene, dither, apparent);
  float A = 1.0 - c.a;
  if (A < 1e-4) {
    oCol = vec4(0.0);
    oDep = vec4(1.0);
    return;
  }
  // 画布是画面值：云按「线性散射光 ÷ 不透明度」出色再预乘，8 位输出加 ±0.5/255 抖动
  vec3 col = atmoDisp(c.rgb / A * uExposure);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(17.0, 59.0), vec2(0.06711056, 0.00583715))));
  oCol = vec4(col * A + (jit - 0.5) / 255.0 * A, A);
  oDep = vec4(apparent < 1e5 ? log2(1.0 + apparent * fwdK) / uLogFar : 1.0);
}`;

// 合成：云（预乘）按 4×4 平均叠到画布，正好把 Bayer 的 16 档错开平均掉（视频级画布不超采样，不平均满屏网点）。
// 按场景深度加权，山脊、城墙边上的云不往前景里糊。画两次：先只叠色；再只写深度，平均后不透明度过半的写云的深度（各点按不透明度加权的平均），
// 别处深度不动（水面已经画了，见 屏幕AO.tsx 的 MidPass.afterWater）。后画的半透明（光柱、粒子）靠这个深度被云挡住
const COMPOSITE_FS = /* glsl */ `
precision highp float;
uniform sampler2D tCloud;
uniform sampler2D tCloudDepth;
uniform sampler2D tDepth;
uniform bool uDepthOnly;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(tDepth, 0) - 1;
  float dc = texelFetch(tDepth, c, 0).r;
  vec4 sum = vec4(0.0);
  float wsum = 0.0, dsum = 0.0, asum = 0.0;
  for (int y = -2; y < 2; y++)
    for (int x = -2; x < 2; x++) {
      ivec2 q = clamp(c + ivec2(x, y), ivec2(0), hi);
      float w = exp(-200.0 * abs(texelFetch(tDepth, q, 0).r - dc));
      vec4 col = texelFetch(tCloud, q, 0);
      sum += w * col;
      wsum += w;
      dsum += w * col.a * texelFetch(tCloudDepth, q, 0).r;
      asum += w * col.a;
    }
  gl_FragColor = sum / wsum;
  if (uDepthOnly && gl_FragColor.a < 0.5) discard;
  gl_FragDepth = uDepthOnly ? min(dsum / asum, dc) : gl_FragCoord.z;
}`;

// 加的云：场景坐标 [x, y, 半径]（方块米），在高积云层里
type Circle = [number, number, number];
type Settings = { weather: CloudWeather; add: Circle[]; near: [number, number]; clear: [number, number, number, number] | null; seaY: number; exposure: number };
// 默认天气：积云 + 高积云 + 卷云三层都有。湿度 0.55（用户 10-14 定；0.6 太密，0.45 时积云几乎没了）
export const defaultWeather: CloudWeather = { temperature: 0.5, humidity: 0.55, wind: 0.6 };
// 去云默认镜头 20 米内删掉、再 30 米渐变回来：下坠穿云时四周还看得到云团擦过
const defaultNear: [number, number] = [20, 30];
const settings: Settings = { weather: defaultWeather, add: [], near: defaultNear, clear: null, seaY: 0, exposure: 1 };

// 云先画到离屏的两张图（预乘的色、要写的深度），再合成到画布
let pass: {
  mat: THREE.ShaderMaterial;
  scene: THREE.Scene;
  compMat: THREE.ShaderMaterial;
  compScene: THREE.Scene;
  camera: THREE.Camera;
  rt: THREE.WebGLRenderTarget | null;
} | null = null;
const getPass = () => {
  if (pass) return pass;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...atmoUniforms,
      ...cloudUniforms,
      uStrip: { value: new THREE.Vector2(-1, 1) },
      tDepth: { value: null },
      atmoSky: { value: null },
      uSize: { value: new THREE.Vector2() },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uLogFar: { value: 1 },
      uExposure: { value: 1 },
    },
    vertexShader: VS,
    fragmentShader: FS,
    glslVersion: THREE.GLSL3,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: null }, tCloudDepth: { value: null }, tDepth: { value: null }, uDepthOnly: { value: false } },
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: COMPOSITE_FS,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const compQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
  compQuad.frustumCulled = false;
  const compScene = new THREE.Scene();
  compScene.add(compQuad);
  pass = { mat, scene, compMat, compScene, camera: new THREE.OrthographicCamera(), rt: null };
  return pass;
};

// 每团积云的高度图：积云的平面轮廓只由覆盖噪声定（pcCuCoverage：noise 的 a 通道 > 1 − 覆盖），在 512² 的 a 通道上按阈值
// 找连通的团（四邻接、平铺回绕），每团一个随机高度 0～1（× PC_CU_BH）；团外的格子跟最近的团（按格子一圈圈往外扩），轮廓稍大一点也落在同一团里。
// 阈值 0.56：再低团就连成一大片（0.53 时最大一团占四分之一）；云量高过它时团边上多出的一圈跟着最近的团走
const HEIGHT_THRESHOLD = 0.56;
let heightMap: THREE.DataTexture | null = null;
const cumulusHeightMap = (noise: Uint8Array) => {
  if (heightMap) return heightMap;
  const N = 512;
  const parent = new Int32Array(N * N).map((_, i) => i);
  const find = (a: number) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const on = (i: number) => noise[4 * i + 3] > HEIGHT_THRESHOLD * 255;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!on(i)) continue;
      for (const j of [y * N + ((x + 1) % N), ((y + 1) % N) * N + x]) if (on(j)) parent[find(i)] = find(j);
    }
  const label = new Int32Array(N * N).fill(-1);
  let queue: number[] = [];
  for (let i = 0; i < N * N; i++)
    if (on(i)) {
      label[i] = find(i);
      queue.push(i);
    }
  while (queue.length) {
    const next: number[] = [];
    for (const i of queue) {
      const x = i % N, y = (i - x) / N;
      for (const j of [y * N + ((x + 1) % N), y * N + ((x + N - 1) % N), ((y + 1) % N) * N + x, ((y + N - 1) % N) * N + x])
        if (label[j] < 0) {
          label[j] = label[i];
          next.push(j);
        }
    }
    queue = next;
  }
  // 团号 → 0～1 的随机数（整数哈希）
  const rand = (k: number) => {
    let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.round(255 * rand(label[i]));
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return (heightMap = t);
};

// 每帧更新共用 uniform（云这一遍、屏幕AO 的云影都读）；cam：主镜头
const camWorld = new THREE.Vector3();
export const updateCloudUniforms = (cam: THREE.Camera) => {
  const tex = atmosphere.clouds;
  const u = cloudUniforms;
  u.pcL0C.value.z = 0;
  if (!tex) return;
  u.pcNoise.value = tex.noise;
  u.pcCuHeight.value = cumulusHeightMap(tex.noise.image.data as Uint8Array);
  u.pcWorleyB.value = tex.worleyBubbly;
  u.pcWorleyS.value = tex.worleySwirley;
  camWorld.setFromMatrixPosition(cam.matrixWorld);
  u.pcCamXZ.value.set(CLOUDS_SCALE * camWorld.x, CLOUDS_SCALE * camWorld.z);
  u.pcCamR.value = 6371e3 + CLOUDS_SCALE * (camWorld.y - settings.seaY);
  u.pcSeaY.value = settings.seaY;
  const sunY = atmosphere.sun[2];
  const p = cloudParams(settings.weather, sunY);
  u.pcL0A.value.set(p.l0Cov[0], p.l0Cov[1], p.l0Detail[0], p.l0Detail[1]);
  u.pcL0B.value.set(p.l0Edge[0], p.l0Edge[1], p.l0AltScale, p.l0Blend);
  u.pcL0C.value.set(p.l0Ext, p.l0Shadow, 1, p.dayFactor);
  // 正午系数（Photon 的 time_noon，太阳在地平线以上且不在早晚过渡里时为 1），高积云在高覆盖时亮一些用
  // 高积云的量减半（用户 10-14：云太密、都在一层）：原样从地面看是盖满天的一整张，只留零散几片
  u.pcL1.value.set(0.5 * p.l1Cov[0], 0.5 * p.l1Cov[1], p.l1Blend, dampen(smooth(0.05, 0.3, sunY)));
  u.pcCi.value.set(p.cirrus, p.cirrocumulus);
  const add = settings.add.slice(0, 4);
  u.pcAddN.value = add.length;
  // 加云的场景坐标 (x, y) → 世界 (x, −y) → 云空间 × CLOUDS_SCALE；圈心覆盖 1（高积云薄，再低就只剩几缕）
  add.forEach(([x, y, r], i) => u.pcAdd.value[i].set(CLOUDS_SCALE * x, -CLOUDS_SCALE * y, CLOUDS_SCALE * r, 1));
  u.pcNear.value.set(CLOUDS_SCALE * settings.near[0], CLOUDS_SCALE * settings.near[1]);
  const c = settings.clear;
  u.pcClear.value.set(c ? CLOUDS_SCALE * c[0] : 0, c ? -CLOUDS_SCALE * c[1] : 0, c ? CLOUDS_SCALE * c[2] : 0, c ? CLOUDS_SCALE * c[3] : 0);
  // 三层所在的云空间高度上的日光（light_color.glsl：日光色 × 透过率 × 7）
  [1200, 3200, 6000].forEach((h, i) => u.pcLight.value[i].fromArray(atmoLightAt(h)));
};

// 一次画多少行：整屏一次画完的话单次绘制太长，浏览器的 GPU 看门狗会把上下文杀掉
const stripCount = 8;
export const drawPhotonClouds = (ctx: MidPassContext) => {
  if (!atmosphere.clouds || !atmosphere.sky) return;
  const { gl, camera: cam } = ctx;
  const p = getPass();
  const { mat, scene, camera } = p;
  if (!p.rt || p.rt.width !== ctx.width || p.rt.height !== ctx.height) {
    p.rt?.dispose();
    p.rt = new THREE.WebGLRenderTarget(ctx.width, ctx.height, { count: 2, type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  updateCloudUniforms(cam);
  const u = mat.uniforms;
  u.tDepth.value = ctx.depth;
  u.atmoSky.value = atmosphere.sky;
  (u.uSize.value as THREE.Vector2).set(ctx.width, ctx.height);
  (u.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
  (u.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
  u.uLogFar.value = Math.log2(cam.far + 1);
  u.uExposure.value = settings.exposure;
  const ac = gl.autoClear;
  gl.autoClear = false;
  gl.setRenderTarget(p.rt);
  const glc = gl.getContext();
  for (let i = 0; i < stripCount; i++) {
    (u.uStrip.value as THREE.Vector2).set(-1 + (2 * i) / stripCount, -1 + (2 * (i + 1)) / stripCount);
    gl.render(scene, camera);
    glc.flush();
  }
  const cu = p.compMat.uniforms;
  cu.tCloud.value = p.rt.textures[0];
  cu.tCloudDepth.value = p.rt.textures[1];
  cu.tDepth.value = ctx.depth;
  gl.setRenderTarget(ctx.target);
  const m = p.compMat;
  cu.uDepthOnly.value = false;
  gl.render(p.compScene, camera);
  Object.assign(m, { colorWrite: false, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true });
  cu.uDepthOnly.value = true;
  gl.render(p.compScene, camera);
  Object.assign(m, { colorWrite: true, depthTest: false, depthWrite: false });
  gl.autoClear = ac;
};

// 放进画布里画云（画布要挂 <ScreenAo />，在它第 3 遍的水面之后画）：weather 天气（0～1）；add 加云（场景坐标 [x, y, 半径]，最多 4 朵，方块米）；near 镜头周围去云（[半径, 软边]，方块米）；
// clear 让开（场景坐标 [x, y, 半径, 软边] 的竖直圆柱，里面的云变薄纱）；seaY 海平面的世界高度；exposure 云的曝光
export const PhotonClouds: React.FC<{
  weather?: CloudWeather;
  add?: Circle[];
  near?: [number, number];
  clear?: [number, number, number, number];
  seaY: number;
  exposure?: number;
}> = ({ weather = defaultWeather, add = [], near = defaultNear, clear,
  seaY,
  exposure = 1,
}) => {
  settings.weather = weather;
  settings.add = add;
  settings.near = near;
  settings.clear = clear ?? null;
  settings.seaY = seaY;
  settings.exposure = exposure;
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const [release] = useState(() => {
    const handle = delayRender('Photon 云');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    const off = registerMidPass(gl, {
      order: 10,
      afterWater: () => true,
      draw: (ctx) => {
        if (photonCloudsOn()) drawPhotonClouds(ctx);
      },
    });
    // Remotion 的画布只在换帧时重画：登记以后手动再画一次，画完才放行截图
    advance(performance.now());
    release();
    return off;
  }, [gl, advance, release]);
  useEffect(
    () => () => {
      settings.add = [];
      settings.near = defaultNear;
      settings.clear = null;
    },
    [],
  );
  return null;
};
