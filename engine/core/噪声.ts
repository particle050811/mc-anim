// 确定性噪声：远景地形等共用。纯函数，同样的种子和坐标永远得到同样的值，每帧重算也不会抖。
// simplex2：二维 simplex 噪声（Stefan Gustavson 的公开实现），值域约 -1～1。fbm：叠几层。cell*：按格子取的随机数（Voronoi 分区、撒树用）。

const grad = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];

export type Noise2 = (x: number, y: number) => number;

// 按种子打乱的置换表（simplex2 用）
export const permutationTable = (seed: number) => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  let rngState = (seed * 2654435761) >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    rngState = (Math.imul(rngState ^ (rngState >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    const j = rngState % (i + 1);
    const t = table[i];
    table[i] = table[j];
    table[j] = t;
  }
  return table;
};

export const simplex2 = (seed: number): Noise2 => {
  const basePerm = permutationTable(seed);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = basePerm[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const s2 = (xin + yin) * F2;
    const i = Math.floor(xin + s2);
    const j = Math.floor(yin + s2);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let noiseSum = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const gradVec = grad[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      noiseSum += t0 * t0 * (gradVec[0] * x0 + gradVec[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const gradVec = grad[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      noiseSum += t1 * t1 * (gradVec[0] * x1 + gradVec[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const gradVec = grad[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      noiseSum += t2 * t2 * (gradVec[0] * x2 + gradVec[1] * y2);
    }
    return 70 * noiseSum;
  };
};

// 分形叠加：scale 是最大那层的特征长度（米），octaves 层，每层长度减半、幅度乘 gain
export const fbm = (noise: Noise2, x: number, y: number, scale: number, octaves = 4, gain = 0.5) => {
  let amp = 1;
  let freq = 1 / scale;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amp * noise(x * freq + octave * 17.3, y * freq - octave * 9.1);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
};

// 整数格子的哈希随机数 0～1（不同 k 给出互相独立的值）
export const hash2 = (ix: number, iy: number, k = 0) => {
  let hash = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(k + 0x3c6ef372, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

export const smoothstep = (edgeLo: number, edgeHi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edgeLo) / (edgeHi - edgeLo)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// sRGB 十六进制 → 线性 RGB（顶点色要线性值）
export const linHex = (hex: string): [number, number, number] => {
  const rgb = parseInt(hex.replace('#', ''), 16);
  const srgbToLinear = (channel: number) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return [srgbToLinear((rgb >> 16) & 255), srgbToLinear((rgb >> 8) & 255), srgbToLinear(rgb & 255)];
};
