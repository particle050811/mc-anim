// 主世界的等距柱状天色图（2048×1024，半精度 RGBA，线性 Rec.709）：大气.ts 的 <Atmosphere />、Photon天.ts 的「精确」档共用。
// 和 大气.ts 原来逐像素调 skyRadiance 的写法逐位相同（用户 11-17 同意为提速动 大气.ts，前提是画面逐字节不变；天色图.test.ts 拿原写法对拍）：
// 只把不随像素变的提出循环（太阳仰角定的 hm、μs 坐标和 z 格，每行仰角定的 lutUv 的 a、b、μ 坐标和 y 格，三次米氏相函数共用的那一项），
// 每个数的运算和先后不变（浮点乘法不结合，权重照旧 wx·wy·wz 从左往右乘、8 个角照旧按 x、y、z 的次序累加）。
// Photon Shaders License Agreement, Copyright © 2021-2025 Benjamin Stott ("SixthSurge")，许可证全文见 engine/light/大气/Photon-LICENSE.txt。
import * as THREE from 'three';

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
const clampCell = (i: number, n: number) => Math.min(Math.max(i, 0), n - 1);
// Rec.2020 → Rec.709（经 XYZ）
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
const cr = Math.cos((2 * Math.PI) / 180);
const sr = Math.sin((2 * Math.PI) / 180);
// miePhase(ν, g) 里只随 g 变的四项：1 − g²、1 + g²、2g、4·(1 + (1 + 2g²)/3)（×4 是 2 的幂，先乘后乘结果一样）
const mieTerms = (g: number) => {
  const gg = g * g;
  return [1 - gg, 1 + gg, 2 * g, 4 * (1 + (1 + 2 * gg) / 3)] as const;
};
const [A85, B85, C85, D85] = mieTerms(0.85);
const [A86, B86, C86, D86] = mieTerms(0.86);
const [A87, B87, C87, D87] = mieTerms(0.87);

export const SKY_W = 2048;
export const SKY_H = 1024;
const columnCos = new Float64Array(SKY_W);
const columnSin = new Float64Array(SKY_W);
for (let i = 0; i < SKY_W; i++) {
  const az = ((i + 0.5) / SKY_W - 0.5) * 2 * Math.PI;
  columnCos[i] = Math.cos(az);
  columnSin[i] = Math.sin(az);
}

/** 天色图：data = 散射表（32 ν × 64 μ × 32 μs × RGB，Rec.2020），sun = 场景坐标的单位太阳方向，gain = 画面增益（大气.ts 的 ATMO_GAIN）。
 *  u = 方位 atan2(y, x) / 2π + 0.5，v = 0.5 + 0.5 sign(z) √|z| */
export const skyColorMap = (data: Float32Array, sun: readonly number[], gain: number) => {
  const px = new Uint16Array(SKY_W * SKY_H * 4);
  const sx = sun[0]!, sy = sun[1]!, mus = sun[2]!;
  const one = THREE.DataUtils.toHalfFloat(1);
  // 只随太阳仰角变：地平线下限 hm、μs 坐标和它的 z 格
  const t = Math.min(Math.max((mus + 0.05) / 0.15, 0), 1);
  const hm = -0.01 + 0.04 * (t * t * (3 - 2 * t));
  const ad = (isect(mus, Ri, Ro) - shellThick) / (Hh - shellThick);
  const w = uvr(Math.max(1 - ad / musA, 0) / (1 + ad), 32);
  let f = w * 32 - 0.5;
  let cell = Math.floor(f);
  const z0 = clampCell(cell, 32), z1 = clampCell(cell + 1, 32), fz = f - cell, gz = 1 - fz;
  for (let j = 0; j < SKY_H; j++) {
    const s = (2 * (j + 0.5)) / SKY_H - 1;
    const rowMu = Math.sign(s) * s * s;
    const ch = Math.sqrt(1 - rowMu * rowMu);
    const rz = rowMu * mus;
    // 只随这一行的仰角变：lutUv 的 a、b，μ 坐标和它的 y 格（ν 用的是夹之前的仰角）
    let mu = Math.max(rowMu, hm);
    const h = Math.sqrt(Math.max((1 - mu * mu) * (1 - mus * mus), 0));
    const a = mu * mus - h;
    const b = mu * mus + h;
    const degenerate = a === b, span = b - a;
    if (mu > 0) mu *= Math.sqrt(Math.sqrt(mu));
    const rmu = R * mu;
    const disc = rmu * rmu - R * R + Ri * Ri;
    let v: number;
    if (mu < 0 && disc >= 0) {
      const d = -rmu - Math.sqrt(Math.max(disc, 0));
      const dmin = R - Ri;
      v = 0.5 - 0.5 * uvr(rho === dmin ? 0 : (d - dmin) / (rho - dmin), 32);
    } else {
      const d = -rmu + Math.sqrt(disc + Hh * Hh);
      const dmin = Ro - R;
      v = 0.5 + 0.5 * uvr((d - dmin) / (rho + Hh - dmin), 32);
    }
    f = v * 64 - 0.5;
    cell = Math.floor(f);
    const y0 = clampCell(cell, 64), y1 = clampCell(cell + 1, 64), fy = f - cell, gy = 1 - fy;
    // z、y 定了以后四条 x 行的起点
    const r00 = (z0 * 64 + y0) * 32, r01 = (z0 * 64 + y1) * 32, r10 = (z1 * 64 + y0) * 32, r11 = (z1 * 64 + y1) * 32;
    let o = j * SKY_W * 4;
    for (let i = 0; i < SKY_W; i++, o += 4) {
      const nu = ch * (columnCos[i]! * sx + columnSin[i]! * sy) + rz;
      const u = uvr(degenerate ? a : (nu - a) / span, 16);
      // 取两次表：u·0.5 是瑞利那半张，u·0.5 + 0.5 是米氏那半张
      let ray0 = 0, ray1 = 0, ray2 = 0, mie0 = 0, mie1 = 0, mie2 = 0;
      for (let half = 0; half < 2; half++) {
        f = (half ? u * 0.5 + 0.5 : u * 0.5) * 32 - 0.5;
        cell = Math.floor(f);
        const x0 = clampCell(cell, 32), x1 = clampCell(cell + 1, 32), fx = f - cell, gx = 1 - fx;
        let q0 = 0, q1 = 0, q2 = 0, k: number, p: number;
        k = gx * gy * gz; p = (r00 + x0) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = fx * gy * gz; p = (r00 + x1) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = gx * fy * gz; p = (r01 + x0) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = fx * fy * gz; p = (r01 + x1) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = gx * gy * fz; p = (r10 + x0) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = fx * gy * fz; p = (r10 + x1) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = gx * fy * fz; p = (r11 + x0) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        k = fx * fy * fz; p = (r11 + x1) * 3; q0 += data[p]! * k; q1 += data[p + 1]! * k; q2 += data[p + 2]! * k;
        if (half) (mie0 = q0), (mie1 = q1), (mie2 = q2);
        else (ray0 = q0), (ray1 = q1), (ray2 = q2);
      }
      // 太阳附近米氏前向那一圈（面光源，太阳角半径 2°），光晕压到 MIE_HALO
      const pm = nu > cr ? 1 : nu * cr + Math.sqrt(Math.max(0, 1 - nu * nu)) * sr;
      const pm2 = 1 + pm * pm;
      const c0 = ray0 + mie0 * ((A85 * pm2) / (Math.PI * (B85 - C85 * pm) ** 1.5 * D85)) * 0.2 * MIE_HALO;
      const c1 = ray1 + mie1 * ((A86 * pm2) / (Math.PI * (B86 - C86 * pm) ** 1.5 * D86)) * 0.2 * MIE_HALO;
      const c2 = ray2 + mie2 * ((A87 * pm2) / (Math.PI * (B87 - C87 * pm) ** 1.5 * D87)) * 0.2 * MIE_HALO;
      // atmosphere_post_processing：饱和度 × 1.1、× 7，再转 Rec.709、乘增益
      const l = c0 * L0 + c1 * L1 + c2 * L2;
      const s0 = (l + (c0 - l) * 1.1) * 7, s1 = (l + (c1 - l) * 1.1) * 7, s2 = (l + (c2 - l) * 1.1) * 7;
      px[o] = THREE.DataUtils.toHalfFloat(Math.max(0, (M00 * s0 + M01 * s1 + M02 * s2) * gain));
      px[o + 1] = THREE.DataUtils.toHalfFloat(Math.max(0, (M10 * s0 + M11 * s1 + M12 * s2) * gain));
      px[o + 2] = THREE.DataUtils.toHalfFloat(Math.max(0, (M20 * s0 + M21 * s1 + M22 * s2) * gain));
      px[o + 3] = one;
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
