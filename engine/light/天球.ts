// 原版主世界的天球：星星怎么撒、月相取贴图哪一格、日月星跟着时刻怎么转。纯数据和纯函数（不引 react、three），星月.tsx 照它画，测试直接跑。
// 照 1.20.1 client 的 LevelRenderer（按官方映射看的类结构和算法，代码是重写的）：
// - 星星：createStars 用 RandomSource.create(10842)（LegacyRandomSource，即 java.util.Random 的 48 位线性同余）撒 1500 次，
//   落在单位球壳里（0.01 < 长² < 1）的才留，每颗是 100 格外、边长 0.3～0.5 格、绕视线随机转一个角的方片；
// - 日月星在 renderSky 里先绕 Y 转 −90°、再绕 X 转 天角 × 360°；太阳在 +Y 100 格外，月亮在 −Y 100 格外、半边长 20 格，贴图 moon_phases.png 4×2 格。
// 游戏坐标 x 东、y 上、z 南；场景坐标 x 东、y 北、z 上（同 engine/light/ 各模块）。
import type { V3 } from './环境.ts';

/** 原版天球半径（格）：日月星都画在这么远 */
export const skyDomeRadius = 100;
/** 月亮方片半边长（格） */
export const moonHalfSide = 20;
/** 星星撒几次（落在球壳外的不要，实际颗数少于这个） */
export const starCount = 1500;
/** createStars 的种子 */
export const starSeed = 10842;

const mask = (1n << 48n) - 1n;
/** java.util.Random / LegacyRandomSource：48 位线性同余。nextFloat、nextDouble 和 Java 逐位一样 */
export class OldRandom {
  #s: bigint;
  constructor(seed: number) {
    this.#s = (BigInt(seed) ^ 0x5deece66dn) & mask;
  }
  #nextBits(bits: number) {
    this.#s = (this.#s * 0x5deece66dn + 0xbn) & mask;
    return Number(this.#s >> BigInt(48 - bits));
  }
  /** 0～1，24 位精度（Java 的 float） */
  nextFloat() {
    return this.#nextBits(24) / 2 ** 24;
  }
  nextDouble() {
    const highBits = this.#nextBits(26);
    const lowBits = this.#nextBits(27);
    return (highBits * 2 ** 27 + lowBits) / 2 ** 53;
  }
}

const f = Math.fround;

/** 原版星星：每颗 4 个顶点（游戏坐标，天球半径 100），按顶点顺序组成一个方片。顺序和 createStars 一样，颗数确定 */
export const vanillaStars = (): Float64Array => {
  const r = new OldRandom(starSeed);
  const vertices: number[] = [];
  for (let i = 0; i < starCount; i++) {
    // 原版这几个量在 float 里算再转 double
    let x = f(f(r.nextFloat() * 2) - 1);
    let y = f(f(r.nextFloat() * 2) - 1);
    let z = f(f(r.nextFloat() * 2) - 1);
    const halfSide = f(f(0.15) + f(r.nextFloat() * f(0.1)));
    let lenSq = x * x + y * y + z * z;
    if (!(lenSq < 1 && lenSq > 0.01)) continue;
    lenSq = 1 / Math.sqrt(lenSq);
    x *= lenSq;
    y *= lenSq;
    z *= lenSq;
    const [cx, cy, cz] = [x * skyDomeRadius, y * skyDomeRadius, z * skyDomeRadius];
    const azimuthRad = Math.atan2(x, z);
    const [sa, ca] = [Math.sin(azimuthRad), Math.cos(azimuthRad)];
    const polarAngle = Math.atan2(Math.sqrt(x * x + z * z), y);
    const [sb, cb] = [Math.sin(polarAngle), Math.cos(polarAngle)];
    const angleRad = r.nextDouble() * Math.PI * 2;
    const [sc, cc] = [Math.sin(angleRad), Math.cos(angleRad)];
    for (let j = 0; j < 4; j++) {
      const u = ((j & 2) - 1) * halfSide;
      const v = (((j + 1) & 2) - 1) * halfSide;
      const rotX = u * cc - v * sc;
      const second = v * cc + u * sc;
      const yOffset = rotX * sb;
      const starDirC = -rotX * cb;
      vertices.push(cx + starDirC * sa - second * ca, cy + yOffset, cz + second * sa + starDirC * ca);
    }
  }
  return Float64Array.from(vertices);
};

/** 月相（0～7，环境.ts 的 月相）→ moon_phases.png 上那一格的 [u0, v0, u1, v1]（v 从上往下，贴图不翻） */
export const moonPhaseCell = (phase: number): [number, number, number, number] => {
  const colIndex = phase % 4;
  const row = Math.floor(phase / 4) % 2;
  return [colIndex / 4, row / 2, (colIndex + 1) / 4, (row + 1) / 2];
};

/** 原版月亮方片：4 个顶点 [游戏坐标 x, y, z, u, v]（renderSky 的顶点顺序，u、v 按 月相格） */
export const moonVertices = (phase: number): [number, number, number, number, number][] => {
  const [u0, v0, u1, v1] = moonPhaseCell(phase);
  const s = moonHalfSide;
  const y = -skyDomeRadius;
  return [
    [-s, y, s, u1, v1],
    [s, y, s, u0, v1],
    [s, y, -s, u0, v0],
    [-s, y, -s, u1, v0],
  ];
};

/** 3×3 矩阵（按行）：游戏坐标的天球向量 → 场景坐标。角 = 天角（环境.ts），倾角 = 轨道往南倾（度）。
 *  太阳（游戏 +Y）转出来正好是 环境.ts 的 太阳方向(角, 倾角) */
export const skyMatrix = (skyAngle: number, tiltDeg = 0): [V3, V3, V3] => {
  const θ = skyAngle * Math.PI * 2;
  const φ = (tiltDeg * Math.PI) / 180;
  const [sθ, cθ, sφ, cφ] = [Math.sin(θ), Math.cos(θ), Math.sin(φ), Math.cos(φ)];
  return [
    [0, -sθ, -cθ],
    [-cφ, -sφ * cθ, sφ * sθ],
    [-sφ, cφ * cθ, -cφ * sθ],
  ];
};

export const mulMatVec = (m: readonly (readonly number[])[], v: readonly number[]): V3 => [
  m[0]![0]! * v[0]! + m[0]![1]! * v[1]! + m[0]![2]! * v[2]!,
  m[1]![0]! * v[0]! + m[1]![1]! * v[1]! + m[1]![2]! * v[2]!,
  m[2]![0]! * v[0]! + m[2]![1]! * v[1]! + m[2]![2]! * v[2]!,
];
