// 天色图.ts 要和 大气.ts 11-17 以前的 buildSky 逐位相同：下面的 reference 是那份写法原样抄过来的（只补了类型断言），散射表用定种子的随机数。
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SKY_H, SKY_W, skyColorMap } from './天色图.ts';

const ATMO_GAIN = 1.55;
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
const axis = (t: number, n: number) => {
  const f = t * n - 0.5;
  const i = Math.floor(f);
  return [Math.min(Math.max(i, 0), n - 1), Math.min(Math.max(i + 1, 0), n - 1), f - i];
};
const texel = (data: Float32Array, u: number, v: number, w: number, out: number[]) => {
  const [x0, x1, fx] = axis(u, 32) as [number, number, number];
  const [y0, y1, fy] = axis(v, 64) as [number, number, number];
  const [z0, z1, fz] = axis(w, 32) as [number, number, number];
  out[0] = out[1] = out[2] = 0;
  for (let corner = 0; corner < 8; corner++) {
    const weight = (corner & 1 ? fx : 1 - fx) * (corner & 2 ? fy : 1 - fy) * (corner & 4 ? fz : 1 - fz);
    const offset = (((corner & 4 ? z1 : z0) * 64 + (corner & 2 ? y1 : y0)) * 32 + (corner & 1 ? x1 : x0)) * 3;
    out[0]! += data[offset]! * weight;
    out[1]! += data[offset + 1]! * weight;
    out[2]! += data[offset + 2]! * weight;
  }
};
const miePhase = (nu: number, g: number) => {
  const cr = Math.cos((2 * Math.PI) / 180);
  const sr = Math.sin((2 * Math.PI) / 180);
  const mu = nu > cr ? 1 : nu * cr + Math.sqrt(Math.max(0, 1 - nu * nu)) * sr;
  const gg = g * g;
  return ((1 - gg) * (1 + mu * mu)) / (Math.PI * (1 + gg - 2 * g * mu) ** 1.5 * 4 * (1 + (1 + 2 * gg) / 3));
};
const mul3 = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!));
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
const saturate11 = (c: number[], luma: number[]) => {
  const l = c[0]! * luma[0]! + c[1]! * luma[1]! + c[2]! * luma[2]!;
  return c.map((x) => l + (x - l) * 1.1);
};
const to709 = (c: number[]) => M2020_709.map((row) => row[0]! * c[0]! + row[1]! * c[1]! + row[2]! * c[2]!);
const scratch = [0, 0, 0];
const MIE_HALO = 0.3;
const skyRadiance = (data: Float32Array, nu: number, mu: number, mus: number) => {
  const hm = -0.01 + 0.04 * (() => {
    const t = Math.min(Math.max((mus + 0.05) / 0.15, 0), 1);
    return t * t * (3 - 2 * t);
  })();
  mu = Math.max(mu, hm);
  const [u, v, w] = lutUv(nu, mu, mus) as [number, number, number];
  texel(data, u * 0.5, v, w, scratch);
  const a = [...scratch];
  texel(data, u * 0.5 + 0.5, v, w, scratch);
  const g = [0.85, 0.86, 0.87];
  const c = a.map((x, i) => x + scratch[i]! * miePhase(nu, g[i]!) * 0.2 * MIE_HALO);
  return to709(saturate11(c, LUMA_2020).map((x) => x * 7)).map((x) => x * ATMO_GAIN);
};
const reference = (data: Float32Array, sun: number[]) => {
  const px = new Uint16Array(SKY_W * SKY_H * 4);
  const mus = sun[2]!;
  for (let j = 0; j < SKY_H; j++) {
    const s = (2 * (j + 0.5)) / SKY_H - 1;
    const mu = Math.sign(s) * s * s;
    const ch = Math.sqrt(1 - mu * mu);
    for (let i = 0; i < SKY_W; i++) {
      const az = ((i + 0.5) / SKY_W - 0.5) * 2 * Math.PI;
      const nu = ch * (Math.cos(az) * sun[0]! + Math.sin(az) * sun[1]!) + mu * sun[2]!;
      const c = skyRadiance(data, nu, mu, mus);
      const o = (j * SKY_W + i) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = THREE.DataUtils.toHalfFloat(Math.max(0, c[k]!));
      px[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  return px;
};

// 定种子的散射表：值落在真表的量级（0～4），少数是 0
const lut = (() => {
  const f = new Float32Array(32 * 64 * 32 * 3);
  let x = 0x9e3779b9;
  for (let i = 0; i < f.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const r = (x >>> 0) / 2 ** 32;
    f[i] = r < 0.02 ? 0 : r * r * 4;
  }
  return f;
})();
const unit = (s: number[]) => {
  const l = Math.hypot(...s);
  return s.map((x) => x / l);
};

describe('天色图同 大气.ts 原来的 buildSky 逐位相同', () => {
  // 应力转动的 SUN_OW（正西、仰角 20°）、天顶（a === b 那一支）、贴地、地平线下
  const suns = [unit([-0.94, 0, 0.342]), [0, 0, 1], unit([0.3, 0.5, 0.05]), unit([0.1, -0.7, -0.08])];
  for (const sun of suns)
    it(`太阳 ${sun.map((x) => x.toFixed(3)).join(', ')}`, () => {
      const got = skyColorMap(lut, sun, ATMO_GAIN).image.data as Uint16Array;
      const want = reference(lut, sun);
      let diff = 0;
      for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) diff++;
      expect(diff).toBe(0);
    });
});
