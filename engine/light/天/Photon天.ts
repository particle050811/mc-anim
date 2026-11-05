// 三渲二光影层的 Photon 天（用户 11-04 定天、云、光照抽成可单独配置的组件）：做的事同 engine/light/大气.ts 的 <Atmosphere />（散射表、天色图、
// 地平线和水面的天色、日光天光、云的噪声），写同一份共用状态（atmosphere、atmoUniforms），着色.ts 的水面、云、合成照旧读那里。
// 大气.ts 应力转动在用、一行不改（用户 11-04 定应力转动的指纹不能变），这里抄它的式子。
// 天色图两种展开（用户 11-04 定 B 类都做）：
//   精确 = CPU 上同 大气.ts 的 buildSky 逐位相同（去掉每像素的数组分配和闭包，同样的运算、同样的顺序，一张约 0.55 秒，原来 1.2～1.4 秒）；
//   GPU = 片元着色器里 float32 算（一张不到几毫秒；和精确的差在半精度的末位）。太阳每帧在动的段（2-日落划船）原来每帧光展开天色图就要 2 秒。
// Photon Shaders License Agreement, Copyright © 2021-2025 Benjamin Stott ("SixthSurge")，许可证全文见 engine/light/大气/Photon-LICENSE.txt。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { use写入者, 新写入槽 } from '../../core/写入者.ts';
import { ATMO_GAIN, atmoUniforms, atmosphere } from '../大气.ts';
import scatteringBin from 'asset:数据/大气/散射';
import noiseBin from 'asset:数据/大气/噪声';
import worleyBubblyBin from 'asset:数据/大气/沃利-泡';
import worleySwirleyBin from 'asset:数据/大气/沃利-卷';

export type 天色图算法 = '精确' | 'GPU';

// ---------- 散射表、云的噪声（同 大气.ts 的 loadLut、loadCloudTextures） ----------
let lut: Float32Array | null = null;
let lutLoading: Promise<Float32Array> | null = null;
const loadLut = () =>
  (lutLoading ??= fetch(scatteringBin)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const h = new Uint16Array(buf);
      const f = new Float32Array(h.length);
      for (let i = 0; i < h.length; i++) f[i] = THREE.DataUtils.fromHalfFloat(h[i]!);
      lut = f;
      return f;
    }));

export type 云噪声 = { noise: THREE.DataTexture; worleyBubbly: THREE.Data3DTexture; worleySwirley: THREE.Data3DTexture };
let 噪声: 云噪声 | null = null;
let 噪声加载: Promise<云噪声> | null = null;
const fetchBytes = (url: string) => fetch(url).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b));
export const 取云噪声 = () =>
  (噪声加载 ??= Promise.all([fetchBytes(noiseBin), fetchBytes(worleyBubblyBin), fetchBytes(worleySwirleyBin)]).then(([n, wb, ws]) => {
    const noise = new THREE.DataTexture(n, 512, 512, THREE.RGBAFormat, THREE.UnsignedByteType);
    const worley = (d: Uint8Array) => {
      const t = new THREE.Data3DTexture(d, 64, 64, 64);
      t.format = THREE.RedFormat;
      t.wrapR = THREE.RepeatWrapping;
      return t;
    };
    const out = { noise, worleyBubbly: worley(wb), worleySwirley: worley(ws) };
    for (const t of [out.noise, out.worleyBubbly, out.worleySwirley]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.unpackAlignment = 1;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    }
    return (噪声 = out);
  }));
export const 云噪声 = () => 噪声;

// ---------- 天色（同 大气.ts 的 lutUv、texel、miePhase、skyRadiance：同样的运算、同样的顺序，只把每像素的数组换成模块里的几个数） ----------
const R = 6371e3;
const Ri = R - 1e3;
const Ro = R + 110e3;
const Hh = Math.sqrt(Ro * Ro - Ri * Ri);
const rho = Math.sqrt(R * R - Ri * Ri);
const shellThick = Ro - Ri;
const uvr = (v: number, n: number) => v * (1 - 1 / n) + 0.5 / n;
const isect = (mu: number, r: number, rs: number) => {
  const d = r * r * (mu * mu - 1) + rs * rs;
  return d >= 0 ? -r * mu + Math.sqrt(d) : -1;
};
const musA = (isect(-0.35, Ri, Ro) - shellThick) / (Hh - shellThick);
let U = 0, V = 0, W = 0;
const lutUv = (nu: number, mu: number, mus: number) => {
  const h = Math.sqrt(Math.max((1 - mu * mu) * (1 - mus * mus), 0));
  const a = mu * mus - h;
  const b = mu * mus + h;
  U = uvr(a === b ? a : (nu - a) / (b - a), 16);
  if (mu > 0) mu *= Math.sqrt(Math.sqrt(mu));
  const rmu = R * mu;
  const disc = rmu * rmu - R * R + Ri * Ri;
  if (mu < 0 && disc >= 0) {
    const d = -rmu - Math.sqrt(Math.max(disc, 0));
    const dmin = R - Ri;
    V = 0.5 - 0.5 * uvr(rho === dmin ? 0 : (d - dmin) / (rho - dmin), 32);
  } else {
    const d = -rmu + Math.sqrt(disc + Hh * Hh);
    const dmin = Ro - R;
    V = 0.5 + 0.5 * uvr((d - dmin) / (rho + Hh - dmin), 32);
  }
  const ad = (isect(mus, Ri, Ro) - shellThick) / (Hh - shellThick);
  W = uvr(Math.max(1 - ad / musA, 0) / (1 + ad), 32);
};
let o0 = 0, o1 = 0, o2 = 0;
const texel = (data: Float32Array, u: number, v: number, w: number) => {
  let f = u * 32 - 0.5;
  let i = Math.floor(f);
  const x0 = Math.min(Math.max(i, 0), 31), x1 = Math.min(Math.max(i + 1, 0), 31), fx = f - i;
  f = v * 64 - 0.5;
  i = Math.floor(f);
  const y0 = Math.min(Math.max(i, 0), 63), y1 = Math.min(Math.max(i + 1, 0), 63), fy = f - i;
  f = w * 32 - 0.5;
  i = Math.floor(f);
  const z0 = Math.min(Math.max(i, 0), 31), z1 = Math.min(Math.max(i + 1, 0), 31), fz = f - i;
  o0 = o1 = o2 = 0;
  for (let zz = 0; zz < 2; zz++) {
    const zi = zz ? z1 : z0, wz = zz ? fz : 1 - fz;
    for (let yy = 0; yy < 2; yy++) {
      const yi = yy ? y1 : y0, wy = yy ? fy : 1 - fy;
      for (let xx = 0; xx < 2; xx++) {
        const xi = xx ? x1 : x0, wx = xx ? fx : 1 - fx;
        const k = wx * wy * wz;
        const o = ((zi * 64 + yi) * 32 + xi) * 3;
        o0 += data[o]! * k;
        o1 += data[o + 1]! * k;
        o2 += data[o + 2]! * k;
      }
    }
  }
};
const cr = Math.cos((2 * Math.PI) / 180);
const sr = Math.sin((2 * Math.PI) / 180);
const miePhase = (nu: number, g: number) => {
  const mu = nu > cr ? 1 : nu * cr + Math.sqrt(Math.max(0, 1 - nu * nu)) * sr;
  const gg = g * g;
  return ((1 - gg) * (1 + mu * mu)) / (Math.PI * (1 + gg - 2 * g * mu) ** 1.5 * 4 * (1 + (1 + 2 * gg) / 3));
};
const mul3 = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!));
const M = mul3(
  [
    [3.2406, -1.5372, -0.4986],
    [-0.9689, 1.8758, 0.0415],
    [0.0557, -0.204, 1.057],
  ],
  [
    [0.6369736, 0.1446172, 0.1688585],
    [0.2627066, 0.6779996, 0.0592938],
    [0, 0.0280728, 1.0608437],
  ],
);
const [M00, M01, M02] = M[0]!, [M10, M11, M12] = M[1]!, [M20, M21, M22] = M[2]!;
const L0 = 0.2627066, L1 = 0.6779996, L2 = 0.0592938;
const MIE_HALO = 0.3;
const out = [0, 0, 0];
const skyRadiance = (data: Float32Array, nu: number, mu: number, mus: number) => {
  const t = Math.min(Math.max((mus + 0.05) / 0.15, 0), 1);
  const hm = -0.01 + 0.04 * (t * t * (3 - 2 * t));
  mu = Math.max(mu, hm);
  lutUv(nu, mu, mus);
  texel(data, U * 0.5, V, W);
  const a0 = o0, a1 = o1, a2 = o2;
  texel(data, U * 0.5 + 0.5, V, W);
  const c0 = a0 + o0 * miePhase(nu, 0.85) * 0.2 * MIE_HALO;
  const c1 = a1 + o1 * miePhase(nu, 0.86) * 0.2 * MIE_HALO;
  const c2 = a2 + o2 * miePhase(nu, 0.87) * 0.2 * MIE_HALO;
  const l = c0 * L0 + c1 * L1 + c2 * L2;
  const s0 = (l + (c0 - l) * 1.1) * 7, s1 = (l + (c1 - l) * 1.1) * 7, s2 = (l + (c2 - l) * 1.1) * 7;
  out[0] = (M00 * s0 + M01 * s1 + M02 * s2) * ATMO_GAIN;
  out[1] = (M10 * s0 + M11 * s1 + M12 * s2) * ATMO_GAIN;
  out[2] = (M20 * s0 + M21 * s1 + M22 * s2) * ATMO_GAIN;
  return out;
};

// 日光、天光（同 大气.ts 的 transmittance、sunlightAt、ambientOf）
const BETA_R = [8.059e-6, 1.671e-5, 4.08e-5];
const BETA_M = [1.666e-6, 1.813e-6, 1.959e-6];
const BETA_O = [8.3e-7, 1.315e-6, 5.44e-8];
const chapman = (x: number, c: number) => {
  const s = Math.sqrt(Math.PI * 0.5 * x);
  if (c >= 0) return s / ((s - 1) * c + 1);
  const sn = Math.sqrt(Math.max(0, 1 - c * c));
  return s / ((s - 1) * c - 1) + 2 * s * Math.exp(x - x * sn) * Math.sqrt(sn);
};
const transmittance = (h: number, mu: number) => {
  const r = Math.max(R + h, R + 10);
  if (mu < 0 && r * r * (1 - mu * mu) < R * R) return [0, 0, 0];
  const mR = 8.4e3 * Math.exp(-(r - R) / 8.4e3) * chapman(r / 8.4e3, mu);
  const mM = 1.25e3 * Math.exp(-(r - R) / 1.25e3) * chapman(r / 1.25e3, mu);
  return [0, 1, 2].map((i) => Math.min(1, Math.exp(-(BETA_R[i]! * mR + BETA_M[i]! * mM + BETA_O[i]! * mR))));
};
const SUNLIGHT = [1.051, 0.985, 0.94];
const LUMA_709 = [0.2126, 0.7152, 0.0722];
const saturate11 = (c: number[], luma: number[]) => {
  const l = c[0]! * luma[0]! + c[1]! * luma[1]! + c[2]! * luma[2]!;
  return c.map((x) => l + (x - l) * 1.1);
};
const sunlightAt = (sunScene: number[], h: number) => {
  const t = transmittance(h, sunScene[2]!);
  return saturate11(SUNLIGHT.map((x, i) => x * t[i]!), LUMA_709).map((x) => x * 7 * ATMO_GAIN);
};
const ambientOf = (data: Float32Array, sunScene: number[]) => {
  const mus = sunScene[2]!;
  const c = [...skyRadiance(data, 0.78 * mus, 0.78, mus)];
  return c.map((x) => x * 2 * Math.PI * 1.13);
};

// ---------- 天色图 ----------
const SKY_W = 2048;
const SKY_H = 1024;
const HOR_N = 16;
const WATER_ELEV = [0, 0.05, 0.1, 0.15, 0.2, 0.28, 0.4, 1];
const 列cos = new Float64Array(SKY_W);
const 列sin = new Float64Array(SKY_W);
for (let i = 0; i < SKY_W; i++) {
  const az = ((i + 0.5) / SKY_W - 0.5) * 2 * Math.PI;
  列cos[i] = Math.cos(az);
  列sin[i] = Math.sin(az);
}
/** 精确：同 大气.ts 的 buildSky 逐位相同 */
const 精确天色图 = (data: Float32Array, sun: number[]) => {
  const px = new Uint16Array(SKY_W * SKY_H * 4);
  const mus = sun[2]!;
  const 一 = THREE.DataUtils.toHalfFloat(1);
  for (let j = 0; j < SKY_H; j++) {
    const s = (2 * (j + 0.5)) / SKY_H - 1;
    const mu = Math.sign(s) * s * s;
    const ch = Math.sqrt(1 - mu * mu);
    for (let i = 0; i < SKY_W; i++) {
      const nu = ch * (列cos[i]! * sun[0]! + 列sin[i]! * sun[1]!) + mu * sun[2]!;
      const c = skyRadiance(data, nu, mu, mus);
      const o = (j * SKY_W + i) * 4;
      px[o] = THREE.DataUtils.toHalfFloat(Math.max(0, c[0]!));
      px[o + 1] = THREE.DataUtils.toHalfFloat(Math.max(0, c[1]!));
      px[o + 2] = THREE.DataUtils.toHalfFloat(Math.max(0, c[2]!));
      px[o + 3] = 一;
    }
  }
  const tex = new THREE.DataTexture(px, SKY_W, SKY_H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
};

// GPU：同一套式子写成 GLSL。两处相减会丢精度的（地心几千公里，float32 只有 7 位）改成不相减的等价式，常数在 JS 里用双精度先算好
const 双 = (x: number) => x.toPrecision(17);
const 天色片元 = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D tLut;
uniform vec3 uSun;
uniform mat3 uM;
out highp vec4 oCol;
#define SR ${双(R)}
#define SRi ${双(Ri)}
#define SHH ${双(Hh)}
#define SHH2 ${双(Ro * Ro - Ri * Ri)}
#define SRHO ${双(rho)}
#define SRHO2 ${双(R * R - Ri * Ri)}
#define SSHELL ${双(shellThick)}
#define SMUSA ${双(musA)}
#define SCR ${双(cr)}
#define SSR ${双(sr)}
float uvr(float v, float n) { return v * (1.0 - 1.0 / n) + 0.5 / n; }
vec3 lutUv(float nu, float mu, float mus) {
  float h = sqrt(max((1.0 - mu * mu) * (1.0 - mus * mus), 0.0));
  float a = mu * mus - h;
  float b = mu * mus + h;
  float unu = uvr(a == b ? a : (nu - a) / (b - a), 16.0);
  if (mu > 0.0) mu *= sqrt(sqrt(mu));
  float rmu = SR * mu;
  float disc = rmu * rmu - SRHO2;
  float umu;
  if (mu < 0.0 && disc >= 0.0) {
    // −rmu − √disc = ρ² / (−rmu + √disc)
    float d = SRHO2 / (-rmu + sqrt(max(disc, 0.0)));
    umu = 0.5 - 0.5 * uvr((d - 1000.0) / (SRHO - 1000.0), 32.0);
  } else {
    float q = sqrt(disc + SHH2);
    // −rmu + q：rmu 大于 0 时写成 (q² − rmu²) / (q + rmu)
    float d = rmu > 0.0 ? (SHH2 - SRHO2) / (q + rmu) : q - rmu;
    umu = 0.5 + 0.5 * uvr((d - 110000.0) / (SRHO + SHH - 110000.0), 32.0);
  }
  // isect(mus, Ri, Ro) = −Ri·mus + √(Ro² − Ri² + Ri²·mus²)
  float m = SRi * mus;
  float s = sqrt(SHH2 + m * m);
  float is = m > 0.0 ? SHH2 / (s + m) : s - m;
  float ad = (is - SSHELL) / (SHH - SSHELL);
  float umus = uvr(max(1.0 - ad / SMUSA, 0.0) / (1.0 + ad), 32.0);
  return vec3(unu, umu, umus);
}
vec3 texel(vec3 t) {
  vec3 f = t * vec3(32.0, 64.0, 32.0) - 0.5;
  vec3 i = floor(f);
  vec3 w = f - i;
  ivec3 a = clamp(ivec3(i), ivec3(0), ivec3(31, 63, 31));
  ivec3 b = clamp(ivec3(i) + 1, ivec3(0), ivec3(31, 63, 31));
  vec3 c = vec3(0.0);
  for (int z = 0; z < 2; z++)
    for (int y = 0; y < 2; y++)
      for (int x = 0; x < 2; x++) {
        ivec3 q = ivec3(x == 0 ? a.x : b.x, y == 0 ? a.y : b.y, z == 0 ? a.z : b.z);
        float k = (x == 0 ? 1.0 - w.x : w.x) * (y == 0 ? 1.0 - w.y : w.y) * (z == 0 ? 1.0 - w.z : w.z);
        c += texelFetch(tLut, q, 0).rgb * k;
      }
  return c;
}
float mie(float nu, float g) {
  float mu = nu > SCR ? 1.0 : nu * SCR + sqrt(max(0.0, 1.0 - nu * nu)) * SSR;
  float gg = g * g;
  return ((1.0 - gg) * (1.0 + mu * mu)) / (3.14159265358979 * pow(1.0 + gg - 2.0 * g * mu, 1.5) * 4.0 * (1.0 + (1.0 + 2.0 * gg) / 3.0));
}
void main() {
  vec2 ij = gl_FragCoord.xy - 0.5;
  float s = (2.0 * (ij.y + 0.5)) / ${SKY_H}.0 - 1.0;
  float mu = sign(s) * s * s;
  float ch = sqrt(1.0 - mu * mu);
  float az = ((ij.x + 0.5) / ${SKY_W}.0 - 0.5) * 6.28318530717959;
  float nu = ch * (cos(az) * uSun.x + sin(az) * uSun.y) + mu * uSun.z;
  float mus = uSun.z;
  float t = clamp((mus + 0.05) / 0.15, 0.0, 1.0);
  mu = max(mu, -0.01 + 0.04 * (t * t * (3.0 - 2.0 * t)));
  vec3 uvw = lutUv(nu, mu, mus);
  vec3 a = texel(vec3(uvw.x * 0.5, uvw.yz));
  vec3 b = texel(vec3(uvw.x * 0.5 + 0.5, uvw.yz));
  vec3 c = a + b * vec3(mie(nu, 0.85), mie(nu, 0.86), mie(nu, 0.87)) * (0.2 * ${MIE_HALO});
  float l = dot(c, vec3(${L0}, ${L1}, ${L2}));
  vec3 st = (l + (c - l) * 1.1) * 7.0;
  oCol = vec4(max(uM * st * ${ATMO_GAIN}, 0.0), 1.0);
}`;

type GPU天 = { rt: THREE.WebGLRenderTarget; 场: THREE.Scene; 材质: THREE.ShaderMaterial; 机: THREE.Camera; lut: THREE.Data3DTexture };
let gpu: GPU天 | null = null;
const 取GPU = (data: Float32Array) => {
  if (gpu) return gpu;
  // 散射表进 3D 贴图（RGBA，x = ν 32、y = μ 64、z = μs 32）；最近邻取、着色器里自己做三线性（同 CPU，硬件的线性插值权重只有 8 位）
  const n = 32 * 64 * 32;
  const px = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    px[i * 4] = data[i * 3]!;
    px[i * 4 + 1] = data[i * 3 + 1]!;
    px[i * 4 + 2] = data[i * 3 + 2]!;
    px[i * 4 + 3] = 1;
  }
  const lutTex = new THREE.Data3DTexture(px, 32, 64, 32);
  lutTex.format = THREE.RGBAFormat;
  lutTex.type = THREE.FloatType;
  lutTex.minFilter = lutTex.magFilter = THREE.NearestFilter;
  lutTex.generateMipmaps = false;
  lutTex.unpackAlignment = 1;
  lutTex.needsUpdate = true;
  const rt = new THREE.WebGLRenderTarget(SKY_W, SKY_H, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.colorSpace = THREE.NoColorSpace;
  const m3 = new THREE.Matrix3().set(M00, M01, M02, M10, M11, M12, M20, M21, M22);
  const 材质 = new THREE.ShaderMaterial({
    uniforms: { tLut: { value: lutTex }, uSun: { value: new THREE.Vector3() }, uM: { value: m3 } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 天色片元,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const 片 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), 材质);
  片.frustumCulled = false;
  const 场 = new THREE.Scene();
  场.add(片);
  return (gpu = { rt, 场, 材质, 机: new THREE.OrthographicCamera(), lut: lutTex });
};
/** GPU 天色图要画的太阳方向（场景坐标、单位长）；画布的 useFrame 里调 备天色图 才真画 */
let 待画: number[] | null = null;

/** 光影层每帧开头调：GPU 天色图要换太阳了就画一遍 */
export const 备天色图 = (gl: THREE.WebGLRenderer) => {
  if (!待画 || !gpu) return;
  (gpu.材质.uniforms.uSun!.value as THREE.Vector3).set(待画[0]!, 待画[1]!, 待画[2]!);
  const 原 = gl.getRenderTarget();
  gl.setRenderTarget(gpu.rt);
  gl.render(gpu.场, gpu.机);
  gl.setRenderTarget(原);
  待画 = null;
};

const 共用 = atmoUniforms;
const 应用 = (data: Float32Array, sunIn: readonly number[], far: number, 算法: 天色图算法) => {
  const l = Math.hypot(...sunIn);
  const sun = sunIn.map((x) => x / l);
  const key = (算法 === 'GPU' ? 'gpu:' : '') + sun.join(',');
  if (atmosphere.skyKey !== key) {
    if (算法 === 'GPU') {
      const g = 取GPU(data);
      if (atmosphere.sky !== (g.rt.texture as unknown as THREE.DataTexture)) atmosphere.sky?.dispose();
      atmosphere.sky = g.rt.texture as unknown as THREE.DataTexture;
      待画 = sun;
    } else {
      if (gpu && atmosphere.sky === (gpu.rt.texture as unknown as THREE.DataTexture)) atmosphere.sky = null;
      atmosphere.sky?.dispose();
      atmosphere.sky = 精确天色图(data, sun);
    }
    atmosphere.skyKey = key;
    atmosphere.sun = sun;
    const hor = 共用.atmoHor.value;
    for (let i = 0; i < HOR_N; i++) {
      const az = (i / HOR_N - 0.5) * 2 * Math.PI;
      const c = skyRadiance(data, Math.cos(az) * sun[0]! + Math.sin(az) * sun[1]!, 0, sun[2]!);
      hor.set(c, i * 3);
    }
    atmosphere.waterBands = WATER_ELEV.map((mu) => {
      const ch = Math.sqrt(1 - mu * mu);
      const acc = [0, 0, 0];
      for (let i = 0; i < HOR_N; i++) {
        const az = (i / HOR_N) * 2 * Math.PI;
        const c = skyRadiance(data, ch * (Math.cos(az) * sun[0]! + Math.sin(az) * sun[1]!) + mu * sun[2]!, mu, sun[2]!);
        for (let k = 0; k < 3; k++) acc[k]! += c[k]! / HOR_N;
      }
      return new THREE.Color(acc[0], acc[1], acc[2]);
    });
    atmosphere.ambient = ambientOf(data, sun);
    const light = sunlightAt(sun, 0);
    Object.assign(共用.atmoLight.value, { x: light[0], y: light[1], z: light[2] });
    Object.assign(共用.atmoAmb.value, { x: atmosphere.ambient[0], y: atmosphere.ambient[1], z: atmosphere.ambient[2] });
    // 场景 (x, y, z) → 世界 (x, z, −y)
    Object.assign(共用.atmoSun.value, { x: sun[0], y: sun[2], z: -sun[1] });
  }
  共用.atmoP.value.y = far;
  共用.atmoP.value.x = 1;
};

const 天槽 = 新写入槽();
const 关天 = () => {
  共用.atmoP.value.x = 0;
  atmosphere.cloudsOnly = false;
  atmosphere.cloudLight = null;
};

/** 放进画布里打开（同 大气.ts 的 <Atmosphere />）：sun = 场景坐标指向太阳；far = 地形远端（米）；算法 = 天色图怎么展开 */
export const Photon天: React.FC<{ sun: readonly [number, number, number]; far: number; 算法: 天色图算法 }> = ({ sun, far, 算法 }) => {
  use写入者(天槽, 关天);
  atmosphere.cloudsOnly = false;
  atmosphere.cloudLight = null;
  const advance = useThree((s) => s.advance);
  const [data, setData] = useState(噪声 && lut);
  const [release] = useState(() => {
    if (噪声 && lut) return () => {};
    const handle = delayRender('Photon 天的散射表和云的噪声');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    if (!data)
      Promise.all([loadLut(), 取云噪声()]).then(
        ([l, c]) => {
          // 光影渲染.tsx 按 atmosphere.clouds 判断云的贴图到了没有（同 大气.ts）
          atmosphere.clouds = c;
          setData(l);
        },
        (e) => cancelRender(e),
      );
  }, [data]);
  if (data) {
    atmosphere.clouds ??= 噪声;
    应用(data, sun, far, 算法);
  }
  useEffect(() => {
    if (!data) return;
    advance(performance.now());
    release();
  }, [data, advance, release]);
  return null;
};
