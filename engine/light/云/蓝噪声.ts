// 质量.抖动 = '蓝噪声' 用的 64×64 阈值表（0～1）：照 Ulichney 1993 的 void-and-cluster 自己写（环面高斯能量 σ 1.5，起始点用固定种子撒 10%）。
// 只按像素坐标取、不按帧变，乱序出帧结果一样；是常数，模块里算一次。纯模块。
export const blueNoiseEdge = 64;

const generate = (n: number, σ: number): Float32Array => {
  const N = n * n;
  const kernel = new Float64Array(N);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = Math.min(x, n - x), dy = Math.min(y, n - y);
      kernel[y * n + x] = Math.exp(-(dx * dx + dy * dy) / (2 * σ * σ));
    }
  const energy = new Float64Array(N);
  const filled = new Uint8Array(N);
  const addAt = (i: number, s: number) => {
    const ix = i % n, iy = (i / n) | 0;
    for (let y = 0; y < n; y++) {
      const ky = ((y - iy + n) % n) * n, rowStart = y * n;
      for (let x = 0; x < n; x++) energy[rowStart + x] += s * kernel[ky + ((x - ix + n) % n)]!;
    }
  };
  const pickPoint = (want: 0 | 1, densest: boolean) => {
    let b = -1, v = densest ? -Infinity : Infinity;
    for (let i = 0; i < N; i++) if (filled[i] === want && (densest ? energy[i]! > v : energy[i]! < v)) (v = energy[i]!), (b = i);
    return b;
  };
  let seed = 12345;
  const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  const startCount = Math.round(N * 0.1);
  for (let k = 0; k < startCount; ) {
    const i = Math.floor(random() * N);
    if (!filled[i]) (filled[i] = 1), addAt(i, 1), k++;
  }
  // 最挤的点挪到最空的地方，直到挪出来的还是它自己
  for (;;) {
    const densestIndex = pickPoint(1, true);
    filled[densestIndex] = 0;
    addAt(densestIndex, -1);
    const freeSlot = pickPoint(0, false);
    filled[freeSlot] = 1;
    addAt(freeSlot, 1);
    if (freeSlot === densestIndex) break;
  }
  const rank = new Int32Array(N);
  const origHas = filled.slice(), origEnergy = energy.slice();
  for (let r = startCount - 1; r >= 0; r--) {
    const i = pickPoint(1, true);
    filled[i] = 0;
    addAt(i, -1);
    rank[i] = r;
  }
  filled.set(origHas);
  energy.set(origEnergy);
  for (let r = startCount; r < N; r++) {
    const i = pickPoint(0, false);
    filled[i] = 1;
    addAt(i, 1);
    rank[i] = r;
  }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = (rank[i]! + 0.5) / N;
  return out;
};

let noiseTable: Float32Array | null = null;
export const blueNoise = () => (noiseTable ??= generate(blueNoiseEdge, 1.5));
