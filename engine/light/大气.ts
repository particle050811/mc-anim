// 主世界的物理天空、空气雾、边界雾的共用状态（照 Photon 光影），主世界所有镜头经 lib/主世界光照.tsx 用（<Atmosphere /> 不在画布里时各处走原来的代码）。云在 大气/云.ts。
// 移植自 Photon 光影 include/sky/atmosphere.glsl、include/fog/overworld/analytic.glsl、include/fog/simple_fog.glsl、include/lighting/colors/light_color.glsl：
// Photon Shaders License Agreement, Copyright © 2021-2025 Benjamin Stott ("SixthSurge")，许可证全文见 engine/light/大气/Photon-LICENSE.txt。
// - 天色：Photon 预积分的散射表（大气/散射.bin = Photon 的 scattering.dat），按太阳方向在 CPU 上展开成一张等距柱状天色图（线性 Rec.709），穹顶、云、水共用。
// - 空气雾：三通道瑞利 + 米氏、按高度指数衰减的解析积分；边界雾：地形边上（远端 = 地形远，约 40 公里）融进这个方向的天色。
// 接入：<Atmosphere /> 放进画布打开；带雾的材质（lib/高度雾.ts 的 fog_* 着色块）、屏幕AO 第 2 遍、云（大气/云.ts）、穹顶读这里的共用 uniform。
// 坐标：GLSL 里是 three 的世界坐标（Y 朝上），JS 接口和天色图按场景坐标（Z 朝上）。高度起点 = 海平面 = 世界 y 0。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import scatteringBin from 'asset:数据/大气/散射';
import noiseBin from 'asset:数据/大气/噪声';
import worleyBubblyBin from 'asset:数据/大气/沃利-泡';
import worleySwirleyBin from 'asset:数据/大气/沃利-卷';

// 画面增益：Photon 的天色在它自己的曝光下出色，我们是 three 的 NeutralToneMapping、曝光 1，按天顶、天边的画面值对到参考视频
export const ATMO_GAIN = 1.55;

// ---------- 散射表（32 μs × 64 μ × 32 ν × RGB，半精度；Photon 的 Rec.2020 工作色彩空间） ----------
let lut: Float32Array | null = null;
let lutLoading: Promise<Float32Array> | null = null;
const loadLut = () =>
  (lutLoading ??= fetch(scatteringBin)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const h = new Uint16Array(buf);
      const f = new Float32Array(h.length);
      for (let i = 0; i < h.length; i++) f[i] = THREE.DataUtils.fromHalfFloat(h[i]);
      lut = f;
      return f;
    }));

// 云的噪声（Photon image/ 下的原件）：noise.png 512² RGBA（转成了不带预乘的原始字节）、worley_bubbly / worley_swirley 64³ 单通道；Photon 的 .mcmeta 是线性过滤、平铺
type CloudTextures = { noise: THREE.DataTexture; worleyBubbly: THREE.Data3DTexture; worleySwirley: THREE.Data3DTexture };
let cloudTexLoading: Promise<CloudTextures> | null = null;
const fetchBytes = (url: string) => fetch(url).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b));
const loadCloudTextures = () =>
  (cloudTexLoading ??= Promise.all([fetchBytes(noiseBin), fetchBytes(worleyBubblyBin), fetchBytes(worleySwirleyBin)]).then(([n, wb, ws]) => {
    const noise = new THREE.DataTexture(n, 512, 512, THREE.RGBAFormat, THREE.UnsignedByteType);
    const worley = (d: Uint8Array) => {
      const t = new THREE.Data3DTexture(d, 64, 64, 64);
      t.format = THREE.RedFormat;
      t.wrapR = THREE.RepeatWrapping;
      return t;
    };
    const out = { noise: noise, worleyBubbly: worley(wb), worleySwirley: worley(ws) };
    for (const t of [out.noise, out.worleyBubbly, out.worleySwirley]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.unpackAlignment = 1;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    }
    return out;
  }));

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
// atmosphere.glsl 的 atmosphere_scattering_uv（观察点在地面）
const lutUv = (nu: number, mu: number, mus: number) => {
  const h = Math.sqrt(Math.max((1 - mu * mu) * (1 - mus * mus), 0));
  const a = mu * mus - h;
  const b = mu * mus + h;
  const unu = uvr(a === b ? a : (nu - a) / (b - a), 16);
  if (mu > 0) mu *= Math.sqrt(Math.sqrt(mu));
  const rmu = R * mu;
  const disc = rmu * rmu - R * R + Ri * Ri;
  let umu: number;
  if (mu < 0 && disc >= 0) {
    const d = -rmu - Math.sqrt(Math.max(disc, 0));
    const dmin = R - Ri;
    umu = 0.5 - 0.5 * uvr(rho === dmin ? 0 : (d - dmin) / (rho - dmin), 32);
  } else {
    const d = -rmu + Math.sqrt(disc + Hh * Hh);
    const dmin = Ro - R;
    umu = 0.5 + 0.5 * uvr((d - dmin) / (rho + Hh - dmin), 32);
  }
  const ad = (isect(mus, Ri, Ro) - shellThick) / (Hh - shellThick);
  const umus = uvr(Math.max(1 - ad / musA, 0) / (1 + ad), 32);
  return [unu, umu, umus];
};
// 三线性、夹边（x = ν 32、y = μ 64、z = μs 32）
const axis = (t: number, n: number) => {
  const f = t * n - 0.5;
  const i = Math.floor(f);
  return [Math.min(Math.max(i, 0), n - 1), Math.min(Math.max(i + 1, 0), n - 1), f - i];
};
const texel = (data: Float32Array, u: number, v: number, w: number, out: number[]) => {
  const [x0, x1, fx] = axis(u, 32);
  const [y0, y1, fy] = axis(v, 64);
  const [z0, z1, fz] = axis(w, 32);
  out[0] = out[1] = out[2] = 0;
  for (const [zi, wz] of [[z0, 1 - fz], [z1, fz]])
    for (const [yi, wy] of [[y0, 1 - fy], [y1, fy]])
      for (const [xi, wx] of [[x0, 1 - fx], [x1, fx]]) {
        const k = wx * wy * wz;
        const o = ((zi * 64 + yi) * 32 + xi) * 3;
        out[0] += data[o] * k;
        out[1] += data[o + 1] * k;
        out[2] += data[o + 2] * k;
      }
};
// 太阳附近米氏前向的那一圈：atmosphere.glsl 用的 klein_nishina / cornette-shanks 面光源版本（太阳角半径 2°）
const miePhase = (nu: number, g: number) => {
  const cr = Math.cos((2 * Math.PI) / 180);
  const sr = Math.sin((2 * Math.PI) / 180);
  const mu = nu > cr ? 1 : nu * cr + Math.sqrt(Math.max(0, 1 - nu * nu)) * sr;
  const gg = g * g;
  return ((1 - gg) * (1 + mu * mu)) / (Math.PI * (1 + gg - 2 * g * mu) ** 1.5 * 4 * (1 + (1 + 2 * gg) / 3));
};
// Rec.2020 → Rec.709（经 XYZ）
const mul3 = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const XYZ_TO_709 = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
];
const R2020_TO_XYZ = [
  [0.6369736, 0.1446172, 0.1688585],
  [0.2627066, 0.6779996, 0.0592938],
  [0, 0.0280728, 1.0608437],
];
const M2020_709 = mul3(XYZ_TO_709, R2020_TO_XYZ);
const LUMA_2020 = [0.2627066, 0.6779996, 0.0592938];
const LUMA_709 = [0.2126, 0.7152, 0.0722];
// atmosphere_post_processing：饱和度 × 1.1
const saturate11 = (c: number[], luma: number[]) => {
  const l = c[0] * luma[0] + c[1] * luma[1] + c[2] * luma[2];
  return c.map((x) => l + (x - l) * 1.1);
};
const to709 = (c: number[]) => M2020_709.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2]);

const scratch = [0, 0, 0];
// 太阳周围米氏光晕压到 0.3（用户 10-15 嫌眩光太大、看不出方形太阳）：Photon 靠自动曝光压暗太阳附近，我们是固定曝光 + 上面的增益，原样的光晕几度内全冲成白的
const MIE_HALO = 0.3;
// 地面看出去的天色（线性 Rec.709，含 Photon 的 ×7 和 ATMO_GAIN）。ν = 视线·太阳，μ = 视线仰角正弦，μs = 太阳仰角正弦
const skyRadiance = (data: Float32Array, nu: number, mu: number, mus: number) => {
  const hm = -0.01 + 0.04 * (() => {
    const t = Math.min(Math.max((mus + 0.05) / 0.15, 0), 1);
    return t * t * (3 - 2 * t);
  })();
  mu = Math.max(mu, hm);
  const [u, v, w] = lutUv(nu, mu, mus);
  texel(data, u * 0.5, v, w, scratch);
  const a = [...scratch];
  texel(data, u * 0.5 + 0.5, v, w, scratch);
  const g = [0.85, 0.86, 0.87];
  const c = a.map((x, i) => x + scratch[i] * miePhase(nu, g[i]) * 0.2 * MIE_HALO);
  return to709(saturate11(c, LUMA_2020).map((x) => x * 7)).map((x) => x * ATMO_GAIN);
};

// atmosphere_transmittance：Chapman 函数近似的光学空气量（瑞利 8.4 公里、米氏 1.25 公里标高），Rec.709 消光系数，臭氧按瑞利的空气量
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
  return [0, 1, 2].map((i) => Math.min(1, Math.exp(-(BETA_R[i] * mR + BETA_M[i] * mM + BETA_O[i] * mR))));
};
// light_color.glsl：日光 = 日光色 × 到这个高度的透过率，再过 atmosphere_post_processing、× 7
const SUNLIGHT = [1.051, 0.985, 0.94];
export const sunlightAt = (sunScene: number[], h: number) => {
  const t = transmittance(h, sunScene[2]);
  return saturate11(SUNLIGHT.map((x, i) => x * t[i]), LUMA_709).map((x) => x * 7 * ATMO_GAIN);
};
// 天光：天色表里仰角 μ 0.78、方位和太阳垂直的那一点 × 2π × 1.13（light_color.glsl 的 ambient_color 取法）
const ambientOf = (data: Float32Array, sunScene: number[]) => {
  const mus = sunScene[2];
  const c = skyRadiance(data, 0.78 * mus, 0.78, mus);
  return c.map((x) => x * 2 * Math.PI * 1.13);
};

// ---------- 共用 uniform（普通对象 / Float32Array：three 克隆材质时只复制引用，见 lib/高度雾.ts） ----------
// atmoP：x 开关（1 开）、y 地形远端（米）
const atmoPVec = { x: 0, y: 40000, z: 0, w: 0 };
const atmoSunVec = { x: 0, y: 1, z: 0 };
const atmoLightVec = { x: 0, y: 0, z: 0 };
const atmoAmbVec = { x: 0, y: 0, z: 0 };
const HOR_N = 16;
const atmoHorArr = new Float32Array(HOR_N * 3);
export const atmoUniforms = {
  atmoP: { value: atmoPVec },
  atmoSun: { value: atmoSunVec },
  atmoLight: { value: atmoLightVec },
  atmoAmb: { value: atmoAmbVec },
  atmoHor: { value: atmoHorArr },
};
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) Object.assign(uniforms, atmoUniforms);
}
Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, atmoUniforms);
export const atmoOn = () => atmoPVec.x > 0.5;

// 打开时的其余状态：天色图（等距柱状，场景坐标：u = 方位 atan2(y, x) / 2π + 0.5，v = 0.5 + 0.5 sign(z) √|z|，地平线附近行密）、
// 水面反射的 8 档天色、云所在高度的日光
// cloudLight：只开云时（<CloudOnlyAtmosphere />）云用的日光，不按高度变
type AtmoState = { sky: THREE.DataTexture | null; sun: number[]; skyKey: string; waterBands: THREE.Color[]; ambient: number[]; clouds: CloudTextures | null; cloudsOnly: boolean; cloudLight: number[] | null };
export const atmosphere: AtmoState = { sky: null, sun: [0, 0, 1], skyKey: '', waterBands: [], ambient: [0, 0, 0], clouds: null, cloudsOnly: false, cloudLight: null };
export const atmoLightAt = (h: number) => atmosphere.cloudLight ?? sunlightAt(atmosphere.sun, h);
// 要不要画 Photon 的云：大气打开，或只开云
export const photonCloudsOn = () => atmoOn() || atmosphere.cloudsOnly;
// 天色图 2048×1024：太阳附近光晕的亮度在一两度里变化很快，512×256 时线性插值露出一格一格的纹
const SKY_W = 2048;
const SKY_H = 1024;
const WATER_ELEV = [0, 0.05, 0.1, 0.15, 0.2, 0.28, 0.4, 1];
const buildSky = (data: Float32Array, sun: number[]) => {
  const px = new Uint16Array(SKY_W * SKY_H * 4);
  const mus = sun[2];
  for (let j = 0; j < SKY_H; j++) {
    const s = (2 * (j + 0.5)) / SKY_H - 1;
    const mu = Math.sign(s) * s * s;
    const ch = Math.sqrt(1 - mu * mu);
    for (let i = 0; i < SKY_W; i++) {
      const az = ((i + 0.5) / SKY_W - 0.5) * 2 * Math.PI;
      const nu = ch * (Math.cos(az) * sun[0] + Math.sin(az) * sun[1]) + mu * sun[2];
      const c = skyRadiance(data, nu, mu, mus);
      const o = (j * SKY_W + i) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = THREE.DataUtils.toHalfFloat(Math.max(0, c[k]));
      px[o + 3] = THREE.DataUtils.toHalfFloat(1);
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
const apply = (data: Float32Array, sunIn: [number, number, number], far: number) => {
  const l = Math.hypot(...sunIn);
  const sun = sunIn.map((x) => x / l);
  const key = sun.join(',');
  if (atmosphere.skyKey !== key) {
    atmosphere.sky?.dispose();
    atmosphere.sky = buildSky(data, sun);
    atmosphere.skyKey = key;
    atmosphere.sun = sun;
    for (let i = 0; i < HOR_N; i++) {
      const az = (i / HOR_N - 0.5) * 2 * Math.PI;
      const c = skyRadiance(data, Math.cos(az) * sun[0] + Math.sin(az) * sun[1], 0, sun[2]);
      atmoHorArr.set(c, i * 3);
    }
    atmosphere.waterBands = WATER_ELEV.map((mu) => {
      const ch = Math.sqrt(1 - mu * mu);
      const acc = [0, 0, 0];
      for (let i = 0; i < HOR_N; i++) {
        const az = (i / HOR_N) * 2 * Math.PI;
        const c = skyRadiance(data, ch * (Math.cos(az) * sun[0] + Math.sin(az) * sun[1]) + mu * sun[2], mu, sun[2]);
        for (let k = 0; k < 3; k++) acc[k] += c[k] / HOR_N;
      }
      return new THREE.Color(acc[0], acc[1], acc[2]);
    });
    atmosphere.ambient = ambientOf(data, sun);
    const light = sunlightAt(sun, 0);
    Object.assign(atmoLightVec, { x: light[0], y: light[1], z: light[2] });
    Object.assign(atmoAmbVec, { x: atmosphere.ambient[0], y: atmosphere.ambient[1], z: atmosphere.ambient[2] });
    // 场景 (x, y, z) → 世界 (x, z, −y)
    Object.assign(atmoSunVec, { x: sun[0], y: sun[2], z: -sun[1] });
  }
  atmoPVec.y = far;
  atmoPVec.x = 1;
};

// 放进画布里打开：sun = 场景坐标指向太阳；far = 地形远端（米，边界雾在这里融进天色）。卸载时关
export const Atmosphere: React.FC<{ sun: [number, number, number]; far: number }> = ({ sun, far }) => {
  const advance = useThree((s) => s.advance);
  const [data, setData] = useState(atmosphere.clouds && lut);
  const [release] = useState(() => {
    if (atmosphere.clouds && lut) return () => {};
    const handle = delayRender('大气散射表和云的噪声');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    if (!data)
      Promise.all([loadLut(), loadCloudTextures()]).then(([l, c]) => {
        atmosphere.clouds = c;
        setData(l);
      }, (e) => cancelRender(e));
  }, [data]);
  if (data) apply(data, sun, far);
  useEffect(() => {
    if (!data) return;
    advance(performance.now());
    release();
  }, [data, advance, release]);
  useEffect(
    () => () => {
      atmoPVec.x = 0;
    },
    [],
  );
  return null;
};

// 只开 Photon 的云（暮色森林，用户 10-15 定「Photon 云 + 暮色光照」）：天、雾、灯都还是那个世界自己的（atmoP 不开，材质的雾、穹顶不换），
// 云远处融进的天色图按 skyAt（场景坐标的方向 → 线性颜色）展开，日光 light、天光 ambient 是线性颜色。key：天色、光变了就换一个（同一个 key 只展开一次）
export const CloudOnlyAtmosphere: React.FC<{ sun: [number, number, number]; skyAt: (d: number[]) => number[]; light: number[]; ambient: number[]; skyKey: string }> = ({ sun, skyAt, light, ambient, skyKey }) => {
  const advance = useThree((s) => s.advance);
  const [ready, setReady] = useState(atmosphere.clouds !== null);
  const [release] = useState(() => {
    if (atmosphere.clouds) return () => {};
    const handle = delayRender('云的噪声');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    if (!ready) loadCloudTextures().then((c) => ((atmosphere.clouds = c), setReady(true)), (e) => cancelRender(e));
  }, [ready]);
  const key = 'only:' + skyKey;
  if (atmosphere.skyKey !== key) {
    const l = Math.hypot(...sun);
    const s = sun.map((x) => x / l);
    const W = 512, H = 256;
    const px = new Uint16Array(W * H * 4);
    for (let j = 0; j < H; j++) {
      const t = (2 * (j + 0.5)) / H - 1;
      const mu = Math.sign(t) * t * t;
      const ch = Math.sqrt(1 - mu * mu);
      for (let i = 0; i < W; i++) {
        const az = ((i + 0.5) / W - 0.5) * 2 * Math.PI;
        const c = skyAt([ch * Math.cos(az), ch * Math.sin(az), mu]);
        const o = (j * W + i) * 4;
        for (let k = 0; k < 3; k++) px[o + k] = THREE.DataUtils.toHalfFloat(Math.max(0, c[k]));
        px[o + 3] = THREE.DataUtils.toHalfFloat(1);
      }
    }
    const tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    atmosphere.sky?.dispose();
    atmosphere.sky = tex;
    atmosphere.skyKey = key;
    atmosphere.sun = s;
    atmosphere.cloudLight = light;
    Object.assign(atmoAmbVec, { x: ambient[0], y: ambient[1], z: ambient[2] });
    Object.assign(atmoSunVec, { x: s[0], y: s[2], z: -s[1] });
  }
  atmosphere.cloudsOnly = true;
  useEffect(() => {
    if (!ready) return;
    advance(performance.now());
    release();
  }, [ready, advance, release]);
  useEffect(
    () => () => {
      atmosphere.cloudsOnly = false;
      atmosphere.cloudLight = null;
    },
    [],
  );
  return null;
};

// ---------- GLSL（世界坐标） ----------
export const ATMO_PARS_GLSL = /* glsl */ `
uniform vec4 atmoP;
uniform vec3 atmoSun;
uniform vec3 atmoLight;
uniform vec3 atmoAmb;
uniform vec3 atmoHor[${HOR_N}];`;
export const ATMO_FN_GLSL = /* glsl */ `
#define ATMO_ISO 0.07957747
float atmoHG(float nu, float g) { float g2 = g * g; return ATMO_ISO * (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * nu, 1e-5), 1.5); }
// analytic.glsl 的 air_fog_analytic_airmass：密度 2^(−(h − 起点) / 半衰)，写成两端密度相减（同 lib/高度雾.ts 的 heightFogAirmass，高空往下看不溢出）
float atmoMass(vec3 o, vec3 e, float st, float hl) {
  float L = distance(o, e);
  float a = exp2((st - o.y) / hl);
  float k = 0.6931472 * (e.y - o.y) / hl;
  float m = abs(k) < 1e-3 ? L * a * (1.0 - 0.5 * k) : L * (a - exp2((st - e.y) / hl)) / k;
  return clamp(m, 0.0, L) * 0.5;
}
// 空气雾（线性）：返回 o → e 这段的内散射，T = 透过率。瑞利 5e-4 × (0.31, 0.67, 1.0)²·⁴、海平面 + 30 起每 30 米减半；米氏消光 1e-4、散射 0.9e-4、+ 7 起每 7 米减半
vec3 atmoAir(vec3 o, vec3 e, out vec3 T) {
  const vec3 bR = 5e-4 * vec3(0.07832, 0.40651, 1.0);
  float mR = atmoMass(o, e, 30.0, 30.0);
  float mM = atmoMass(o, e, 7.0, 7.0);
  vec3 od = bR * mR + vec3(1e-4 * mM);
  T = exp(-od);
  vec3 integ = (1.0 - T) / max(od, vec3(1e-7));
  vec3 rs = integ * mR * bR;
  vec3 ms = integ * mM * 0.9e-4;
  float nu = dot(normalize(e - o), atmoSun);
  vec3 S = 2.0 * (rs + ms) * ATMO_ISO * atmoAmb;
  float amt = 1.0, an = 1.0;
  vec3 x = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    x += amt * (rs * ATMO_ISO + ms * (0.7 * atmoHG(nu, 0.5 * an) + 0.3 * atmoHG(nu, -0.2 * an)));
    amt *= 0.5;
    an *= 0.7;
  }
  return S + x * atmoLight;
}
// simple_fog.glsl 的边界雾：地形留下的比例，水平距离到地形远端时剩 2^−2.4，视线朝上时减弱
float atmoBorder(vec3 o, vec3 e) {
  vec3 v = e - o;
  float l = length(v.xz) / atmoP.y;
  float t = clamp(normalize(v).y / 0.2, 0.0, 1.0);
  return mix(exp2(-2.4 * l * l), 1.0, 0.75 * t * (2.0 - t));
}
// 这个方位贴着地平线的天色（线性）
vec3 atmoHorizon(vec3 v) {
  float u = atan(-v.z, v.x) * 0.15915494 + 0.5;
  float f = u * ${HOR_N.toFixed(1)};
  int i0 = int(floor(f));
  float w = f - float(i0);
  i0 = ((i0 % ${HOR_N}) + ${HOR_N}) % ${HOR_N};
  return mix(atmoHor[i0], atmoHor[(i0 + 1) % ${HOR_N}], w);
}
// three 的 NeutralToneMapping（曝光 1）+ sRGB 编码：线性 → 画面值
vec3 atmoNeutral(vec3 color) {
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < 0.76) return color;
  float newPeak = 1.0 - 0.0576 / (peak - 0.52);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 atmoDisp(vec3 L) {
  vec3 c = clamp(atmoNeutral(max(L, vec3(0.0))), 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
// 画面值上的雾（材质的雾在出色之后混）：画面 = 出色 × keep + 返回值。keep = 边界雾留下的 × 透过率
vec3 atmoFogParts(vec3 o, vec3 e, out vec3 keep) {
  vec3 T;
  vec3 S = atmoAir(o, e, T);
  float bf = atmoBorder(o, e);
  keep = bf * T;
  return atmoDisp(atmoHorizon(e - o)) * (1.0 - bf) * T + atmoDisp(S / max(1.0 - T, vec3(1e-4))) * (1.0 - T);
}
vec3 atmoFog(vec3 c, vec3 o, vec3 e) {
  vec3 keep;
  vec3 B = atmoFogParts(o, e, keep);
  return c * keep + B;
}
// 天色图采样（场景坐标的方向）
vec3 atmoSkyAt(sampler2D t, vec3 d) {
  float u = atan(d.y, d.x) * 0.15915494 + 0.5;
  float v = 0.5 + 0.5 * sign(d.z) * sqrt(abs(d.z));
  return texture(t, vec2(u, v)).rgb;
}
// atmosphere_transmittance：r 是到地心的距离、mu 是视线和当地竖直的夹角余弦，打到地面返回 0
float atmoChapman(float x, float c) {
  float s = sqrt(1.5707963 * x);
  if (c >= 0.0) return s / ((s - 1.0) * c + 1.0);
  float sn = sqrt(max(0.0, 1.0 - c * c));
  return s / ((s - 1.0) * c - 1.0) + 2.0 * s * exp(x - x * sn) * sqrt(sn);
}
vec3 atmoTrans(vec3 p, vec3 d) {
  const float RP = 6371e3;
  float r = length(p);
  float mu = dot(p, d) / r;
  float rc = max(r, RP + 10.0);
  if (mu < 0.0 && rc * rc * (1.0 - mu * mu) < RP * RP) return vec3(0.0);
  float hh = r - RP;
  float mR = 8.4e3 * exp(-hh / 8.4e3) * atmoChapman(r / 8.4e3, mu);
  float mM = 1.25e3 * exp(-hh / 1.25e3) * atmoChapman(r / 1.25e3, mu);
  return clamp(exp(-(vec3(8.059e-6, 1.671e-5, 4.080e-5) * mR + vec3(1.666e-6, 1.813e-6, 1.959e-6) * mM + vec3(8.30e-7, 1.315e-6, 5.44e-8) * mR)), 0.0, 1.0);
}`;
