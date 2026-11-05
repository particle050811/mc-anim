// 质量.抖动 = '蓝噪声' 用的 64×64 阈值表（0～1）：照 Ulichney 1993 的 void-and-cluster 自己写（环面高斯能量 σ 1.5，起始点用固定种子撒 10%）。
// 只按像素坐标取、不按帧变，乱序出帧结果一样；是常数，模块里算一次。纯模块。
export const 蓝噪声边 = 64;

const 生成 = (n: number, σ: number): Float32Array => {
  const N = n * n;
  const 核 = new Float64Array(N);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = Math.min(x, n - x), dy = Math.min(y, n - y);
      核[y * n + x] = Math.exp(-(dx * dx + dy * dy) / (2 * σ * σ));
    }
  const 能 = new Float64Array(N);
  const 有 = new Uint8Array(N);
  const 加 = (i: number, s: number) => {
    const ix = i % n, iy = (i / n) | 0;
    for (let y = 0; y < n; y++) {
      const ky = ((y - iy + n) % n) * n, 行 = y * n;
      for (let x = 0; x < n; x++) 能[行 + x] += s * 核[ky + ((x - ix + n) % n)]!;
    }
  };
  const 找 = (要有: 0 | 1, 最挤: boolean) => {
    let b = -1, v = 最挤 ? -Infinity : Infinity;
    for (let i = 0; i < N; i++) if (有[i] === 要有 && (最挤 ? 能[i]! > v : 能[i]! < v)) (v = 能[i]!), (b = i);
    return b;
  };
  let 种 = 12345;
  const 随 = () => (种 = (Math.imul(种, 1103515245) + 12345) >>> 0) / 4294967296;
  const 起 = Math.round(N * 0.1);
  for (let k = 0; k < 起; ) {
    const i = Math.floor(随() * N);
    if (!有[i]) (有[i] = 1), 加(i, 1), k++;
  }
  // 最挤的点挪到最空的地方，直到挪出来的还是它自己
  for (;;) {
    const 挤 = 找(1, true);
    有[挤] = 0;
    加(挤, -1);
    const 空 = 找(0, false);
    有[空] = 1;
    加(空, 1);
    if (空 === 挤) break;
  }
  const 名次 = new Int32Array(N);
  const 原有 = 有.slice(), 原能 = 能.slice();
  for (let r = 起 - 1; r >= 0; r--) {
    const i = 找(1, true);
    有[i] = 0;
    加(i, -1);
    名次[i] = r;
  }
  有.set(原有);
  能.set(原能);
  for (let r = 起; r < N; r++) {
    const i = 找(0, false);
    有[i] = 1;
    加(i, 1);
    名次[i] = r;
  }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = (名次[i]! + 0.5) / N;
  return out;
};

let 表: Float32Array | null = null;
export const 蓝噪声 = () => (表 ??= 生成(蓝噪声边, 1.5));
