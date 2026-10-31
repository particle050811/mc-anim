// 封闭空洞填实（实验，瘦身的第 2 档）：一块里同一级的区段，从天上泛洪，碰不到的空洞（封闭的洞穴、矿道）填实。网格会变：洞壁的面没了，外面看得见的面不变（实验/核对视线.ts 打射线比）。
// 只看核心列：每列连续的「非整格不透明」（空气、水、树叶、花草……光线穿得过的都算）是一个区间，上下左右挨着的区间并起来，并到天上的留下，其余填实。
// 保守的地方，这些都算通天：
//   - 碰到区段顶的（上面是空气）；块外和没有区段的邻列（跨块不通信，同烘焙）。
//   - 碰上保留盒的区段里所有区间：挖开以后洞连通到外面，和它连着的都不能填。
//   - 粗级跨 z −2 的区间：主世界地形.ts 的 补水面 会把那层的实心换成水，把两边的洞打通。
// k底 以下当实心（同引擎），不算通路。填的是区间上面那格（一定是整格）的色板号，再瘦身（瘦身.ts）时段就并起来了。
// apron 跟着邻区段的核心填，区段算面时才认得那边已经实了。
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { 瘦身表 } from './瘦身.ts';

const 核 = 32;
const 列边 = 34;
const 列数 = 列边 * 列边;

export type 封洞区段 = { si: number; sj: number; d: SectionData; 保留: boolean };
type 区间表 = { 起: Int32Array; z0: Int32Array; z1: Int32Array; 号基: number; 顶: number };

export const 建封洞 = (区段们: 封洞区段[], 每边: number, L: number, 表: 瘦身表, 值: ArrayLike<number>) => {
  const 位 = new Int32Array(每边 * 每边).fill(-1);
  区段们.forEach((s, n) => (位[s.sj * 每边 + s.si] = n));
  const 水面格 = L >= 1 ? Math.floor(-2 / 2 ** L) : null;
  const 号整 = (d: SectionData) => {
    const P = d.palette.length / 2;
    const a = new Uint8Array(P);
    for (let p = 1; p < P; p++) a[p] = 表.掩[值[d.palette[2 * p]!]!]! & 1;
    return a;
  };
  // 第一遍：每个区段每个核心列的区间（从上往下）
  let 总 = 0;
  const 表们: 区间表[] = 区段们.map((s) => {
    const d = s.d;
    const 整 = 号整(d);
    const 起 = new Int32Array(核 * 核 + 1);
    const z0 = new Int32Array(d.paletteIndex.length), z1 = new Int32Array(d.paletteIndex.length);
    const 顶 = d.kBottom + d.nz - 1;
    let n = 0, r = 0;
    for (let c = 0; c < 列数; c++) {
      const x = c % 列边, y = (c - x) / 列边;
      const 是核 = x >= 1 && x <= 核 && y >= 1 && y <= 核;
      const end = r + d.runCounts[c]!;
      if (!是核) {
        r = end;
        continue;
      }
      const cc = (y - 1) * 核 + (x - 1);
      起[cc] = n;
      let z = 顶 + 1; // 这一段的顶 + 1（绝对格）
      let 开 = false;
      for (; r < end; r++) {
        const z底 = z - d.runLengths[r]!;
        const 通 = !整[d.paletteIndex[r]!];
        if (通) {
          if (!开) {
            z1[n] = z - 1;
            开 = true;
          }
          z0[n] = z底;
        } else if (开) {
          n++;
          开 = false;
        }
        z = z底;
      }
      if (开) n++;
    }
    起[核 * 核] = n;
    const 号基 = 总;
    总 += n;
    return { 起, z0, z1, 号基, 顶 };
  });
  // 并查集，天 是最后一号
  const 父 = new Int32Array(总 + 1);
  for (let i = 0; i <= 总; i++) 父[i] = i;
  const 根 = (a: number) => {
    let r = a;
    while (父[r] !== r) r = 父[r]!;
    while (父[a] !== r) {
      const n = 父[a]!;
      父[a] = r;
      a = n;
    }
    return r;
  };
  const 并 = (a: number, b: number) => {
    const x = 根(a), y = 根(b);
    if (x !== y) 父[Math.max(x, y)] = Math.min(x, y); // 天 不一定是根，比的时候用 根(天)
  };
  const 天 = 总;
  // 邻列：(si, sj, x, y) → 区间表和列号，块外或没有区段返回 null
  const 邻 = (si: number, sj: number, x: number, y: number) => {
    const sx = si + Math.floor(x / 核), sy = sj + Math.floor(y / 核);
    if (sx < 0 || sy < 0 || sx >= 每边 || sy >= 每边) return null;
    const n = 位[sy * 每边 + sx]!;
    if (n < 0) return null;
    return { 表: 表们[n]!, cc: (y - (sy - sj) * 核) * 核 + (x - (sx - si) * 核) };
  };
  区段们.forEach((s, n) => {
    const T = 表们[n]!;
    for (let cc = 0; cc < 核 * 核; cc++) {
      const a0 = T.起[cc]!, a1 = T.起[cc + 1]!;
      if (a0 === a1) continue;
      const x = cc % 核, y = (cc - x) / 核;
      for (let a = a0; a < a1; a++) {
        const 号 = T.号基 + a;
        if (s.保留 || T.z1[a] === T.顶 || (水面格 !== null && T.z0[a]! <= 水面格 && 水面格 <= T.z1[a]!)) 并(号, 天);
      }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const N = 邻(s.si, s.sj, x + dx, y + dy);
        if (!N) {
          for (let a = a0; a < a1; a++) 并(T.号基 + a, 天);
          continue;
        }
        const B = N.表;
        let a = a0, b = B.起[N.cc]!;
        const b1 = B.起[N.cc + 1]!;
        while (a < a1 && b < b1) {
          if (T.z1[a]! > B.顶) 并(T.号基 + a, 天); // 高过邻区段的顶：那边是空气
          if (T.z0[a]! <= B.z1[b]! && B.z0[b]! <= T.z1[a]!) 并(T.号基 + a, B.号基 + b);
          if (T.z0[a]! >= B.z0[b]!) a++;
          else b++;
        }
        for (; a < a1; a++) if (T.z1[a]! > B.顶) 并(T.号基 + a, 天);
      }
    }
  });
  const 封闭 = (号: number) => 根(号) !== 根(天);
  let 封闭区间 = 0;
  for (let i = 0; i < 总; i++) if (封闭(i)) 封闭区间++;

  /** 就地填第 n 个区段摊开的色板号（下标 k * 列数 + 列），返回填了多少格（核心） */
  const 填 = (n: number, vox: Uint16Array) => {
    const s = 区段们[n]!, d = s.d, T = 表们[n]!;
    const 整 = 号整(d);
    let 填格 = 0;
    for (let cc = 0; cc < 核 * 核; cc++) {
      const x = cc % 核, y = (cc - x) / 核;
      const c = (y + 1) * 列边 + x + 1;
      for (let a = T.起[cc]!; a < T.起[cc + 1]!; a++) {
        if (!封闭(T.号基 + a)) continue;
        const hi = T.z1[a]! - d.kBottom, lo = T.z0[a]! - d.kBottom;
        const p = vox[(hi + 1) * 列数 + c]!;
        for (let k = hi; k >= lo; k--) vox[k * 列数 + c] = p;
        填格 += hi - lo + 1;
      }
    }
    // apron：跟邻区段的核心。四个角不挨核心，不用
    for (let y = 0; y < 列边; y++)
      for (let x = 0; x < 列边; x++) {
        const 环x = x === 0 || x === 列边 - 1, 环y = y === 0 || y === 列边 - 1;
        if (环x === 环y) continue;
        const N = 邻(s.si, s.sj, x - 1, y - 1);
        if (!N) continue;
        const c = y * 列边 + x, B = N.表;
        for (let b = B.起[N.cc]!; b < B.起[N.cc + 1]!; b++) {
          if (!封闭(B.号基 + b)) continue;
          const hi = Math.min(B.z1[b]! - d.kBottom, d.nz - 2), lo = Math.max(B.z0[b]! - d.kBottom, 0);
          for (let k = hi; k >= lo; k--) {
            const 上 = vox[(k + 1) * 列数 + c]!;
            if (!整[vox[k * 列数 + c]!] && 整[上]) vox[k * 列数 + c] = 上;
          }
        }
      }
    return 填格;
  };
  return { 填, 区间: 总, 封闭区间 };
};
