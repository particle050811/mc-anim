// 区段瘦身（实验，用户 10-31 提的「只导入顶层」的原型）：不改格式、不改引擎，把网格里一个面都不出的格子换成上面那格的色板号，段并起来。
// 依据是 engine/voxel/网格.ts 的面剔除：一格出不出面只看六个邻居的遮挡掩码，别的格出不出面也只看这一格的掩码。所以掩码不变地换方块，网格逐字节不变（实验/核对网格.ts 拿真网格比）。
// 第 0 档（默认，网格逐字节不变）动的格子：
//   - 核心里不贴区段边的格：六面都被挡住（k=0 下面按石头、最上一格上面按空气，同网格），换成同掩码、同样全部面都能被剔的方块（水只换同一种水）。
//   - apron 只给邻居当遮挡用、自己不出面：非空气的格，上一格同掩码就跟上一格（只看一列，不看四周）。
//   - 核心贴区段边的格不动：它朝外的面进裙边（见 网格.ts 文件头），LOD 交界看得见。
// 第 1 档（裙边窗 = M，网格变、只差埋着的裙边）：贴边的格上下 M 格内、本列和四邻列全是整格不透明，也换。裙边贴图变了，但它埋在邻区段的地面下 M 格以上（风险见实验报告）。
// 粗级（L ≥ 1）还要给 主世界地形.ts 的运行时补丁留余地：
//   - 每列最上面两个非空气格不动：补水面 把最上面那格换成水，下一格的顶面就露出来了；补草看最上面那格是什么方块。
//   - 跨 z −2 的那一层整层不动：补水面只改这层，改完旁边更高的列朝这边的侧面露出来。
//   - 水不换：补水草把水换成水草，四周的水的侧面露出来，换过的水颜色会变。
// 挖地标、整平在渲染时才做，会露出埋着的格子，所以和 保留盒 碰上的区段整个不动（调用方判断）。
import type { SectionData } from '../../../engine/voxel/区段包.ts';

export type 瘦身表 = { 掩: Uint8Array; 可换: Uint8Array; 石掩: number };
type 方块表最小 = { blockProps: { full: Uint8Array; leaf: Uint8Array; layer: Uint8Array }; faceTable: readonly Float32Array[]; faceStride: number; voxelFromState: (s: string) => number };

export const 建瘦身表 = (b: 方块表最小): 瘦身表 => {
  const { full, leaf, layer } = b.blockProps;
  const n = b.faceTable.length;
  const 掩 = new Uint8Array(n), 可换 = new Uint8Array(n);
  for (let v = 1; v < n; v++) {
    掩[v] = full[v]! | (leaf[v]! << 1) | (layer[v] === 3 ? 4 : 0);
    const f = b.faceTable[v]!;
    let ok = f.length > 0 && 掩[v] !== 0;
    for (let o = 0; ok && o < f.length; o += b.faceStride) if (f[o + 1]! >= 6) ok = false; // 不剔的面（十字、方块中间的面）总要画
    可换[v] = ok ? 1 : 0;
  }
  return { 掩, 可换, 石掩: 掩[b.voxelFromState('minecraft:stone')]! };
};

export type 瘦身选项 = {
  /** 第几级：粗级树叶按实心算（同 buildSectionMesh 的 solidLeaves = L ≥ 1） */
  L: number;
  /** 包的状态号 → 体素值 */
  值: ArrayLike<number>;
  /** 第 1 档：贴边的格上下这么多格内都是整格不透明才换；不给就是第 0 档，贴边的格不动 */
  裙边窗?: number;
};

const 列边 = 34;
const 列数 = 列边 * 列边;

/** 把区段摊成稠密的色板号，下标 k * 列数 + 列（k 从下往上） */
export const 摊开 = (d: SectionData): Uint16Array => {
  const vox = new Uint16Array(列数 * d.nz);
  let r = 0;
  for (let c = 0; c < 列数; c++) {
    let z = d.nz;
    for (const end = r + d.runCounts[c]!; r < end; r++) {
      const p = d.paletteIndex[r]!;
      const z0 = z - d.runLengths[r]!;
      if (p) for (let k = z0; k < z; k++) vox[k * 列数 + c] = p;
      z = z0;
    }
  }
  return vox;
};

/** 稠密的色板号 → 区段：段重新并，色板只留用到的、按第一次用到的先后重排（第 0 项还是空气，同烘焙） */
export const 收拢 = (d: SectionData, vox: Uint16Array): SectionData => {
  const P = d.palette.length / 2;
  const 新号 = new Int32Array(P).fill(-1);
  新号[0] = 0;
  const pal: number[] = [d.palette[0]!, d.palette[1]!];
  const runCounts = new Uint16Array(列数);
  let cap = 1 << 12;
  let idx = new Uint16Array(cap), len = new Uint16Array(cap);
  let R = 0;
  for (let c = 0; c < 列数; c++) {
    const r0 = R;
    for (let k = d.nz - 1; k >= 0; k--) {
      const p = vox[k * 列数 + c]!;
      let q = 新号[p]!;
      if (q < 0) {
        q = 新号[p] = pal.length / 2;
        pal.push(d.palette[2 * p]!, d.palette[2 * p + 1]!);
      }
      if (R > r0 && idx[R - 1] === q) len[R - 1]!++;
      else {
        if (R === cap) {
          cap *= 2;
          const a = new Uint16Array(cap), b = new Uint16Array(cap);
          a.set(idx);
          b.set(len);
          idx = a;
          len = b;
        }
        idx[R] = q;
        len[R++] = 1;
      }
    }
    runCounts[c] = R - r0;
  }
  return { L: d.L, i: d.i, j: d.j, kBottom: d.kBottom, nz: d.nz, palette: Uint16Array.from(pal), runCounts, paletteIndex: idx.subarray(0, R), runLengths: len.subarray(0, R) };
};

/** 就地改稠密的色板号，返回动了多少格 */
export const 换隐藏格 = (d: SectionData, vox: Uint16Array, 表: 瘦身表, o: 瘦身选项) => {
  const { 掩, 可换, 石掩 } = 表;
  const P = d.palette.length / 2;
  const 号值 = new Uint16Array(P);
  const 号掩 = new Uint8Array(P), 号可换 = new Uint8Array(P);
  for (let p = 1; p < P; p++) {
    const v = o.值[d.palette[2 * p]!]!;
    号值[p] = v;
    号掩[p] = 掩[v]!;
    号可换[p] = 可换[v]!;
  }
  const 粗 = o.L >= 1;
  const 守顶 = 粗 ? 2 : 0;
  const M = o.裙边窗;
  let 核心动 = 0, 环动 = 0, 贴边动 = 0;
  const nz = d.nz;
  const 水面层 = 粗 ? Math.floor(-2 / 2 ** o.L) - d.kBottom : -1;
  // 第 1 档：每列从下往上数，每格往上连续几格是整格不透明（含自己）、往下连续几格（出了底当实心）
  let 连上: Int32Array | null = null, 连下: Int32Array | null = null;
  if (M !== undefined) {
    连上 = new Int32Array(列数 * nz);
    连下 = new Int32Array(列数 * nz);
    for (let c = 0; c < 列数; c++) {
      let n = 0;
      for (let k = nz - 1; k >= 0; k--) {
        n = 号掩[vox[k * 列数 + c]!]! & 1 ? n + 1 : 0;
        连上[k * 列数 + c] = n;
      }
      n = 1 << 20;
      for (let k = 0; k < nz; k++) {
        n = 号掩[vox[k * 列数 + c]!]! & 1 ? n + 1 : 0;
        连下[k * 列数 + c] = n;
      }
    }
  }
  for (let y = 0; y < 列边; y++)
    for (let x = 0; x < 列边; x++) {
      const c = y * 列边 + x;
      const 是环 = x === 0 || y === 0 || x === 列边 - 1 || y === 列边 - 1;
      const 贴边 = !是环 && (x === 1 || y === 1 || x === 列边 - 2 || y === 列边 - 2);
      if (贴边 && M === undefined) continue;
      let 见过 = 0; // 从上往下见过几个非空气格
      for (let k = nz - 1; k >= 0; k--) {
        const at = k * 列数 + c;
        const p = vox[at]!;
        if (!p) continue;
        见过++;
        if (见过 <= 守顶 || k + 1 >= nz || k === 水面层) continue;
        const m = 号掩[p]!;
        if (!m) continue;
        const 上 = vox[at + 列数]!;
        if (!上 || 上 === p || 号掩[上] !== m || !号可换[上]) continue;
        if ((m & 4) && 号值[上] !== 号值[p]) continue; // 水只换同一种水（补水草认的是水的体素值）
        if (是环) {
          vox[at] = 上;
          环动++;
          continue;
        }
        if (!号可换[p] || (粗 && m & 4)) continue;
        if (贴边) {
          if (!(m & 1)) continue;
          const 窗够 = (n: number) => 连上![k * 列数 + n]! > M! && 连下![k * 列数 + n]! > M!;
          if (!窗够(c) || !窗够(c - 1) || !窗够(c + 1) || !窗够(c - 列边) || !窗够(c + 列边)) continue;
          vox[at] = 上;
          贴边动++;
          continue;
        }
        const 剔 = 1 | (粗 && (m & 3) ? 2 : 0) | (m & 4 ? 4 : 0); // 同 网格.ts 的 cullMask
        const 下掩 = k === 0 ? 石掩 : 号掩[vox[at - 列数]!]!;
        if (!(号掩[上]! & 剔) || !(下掩 & 剔) || !(号掩[vox[at - 1]!]! & 剔) || !(号掩[vox[at + 1]!]! & 剔) || !(号掩[vox[at - 列边]!]! & 剔) || !(号掩[vox[at + 列边]!]! & 剔)) continue;
        vox[at] = 上;
        核心动++;
      }
    }
  return { 核心动, 环动, 贴边动 };
};

/** 烘焙时的瘦身参数（实验，默认不瘦）：档 0、1 见文件头；保留盒是场景坐标的水平框 [x0, y0, x1, y1] */
export type 烘焙瘦身 = { 档: 0 | 1; 保留盒: number[][] };

/** 这个区段（连 apron 一圈）和保留盒碰上了没有 */
export const 碰保留盒 = (盒们: number[][], id: { L: number; i: number; j: number }) => {
  const 格 = 2 ** id.L, 边 = 32 * 格;
  const x0 = id.i * 边 - 格, y0 = id.j * 边 - 格, x1 = id.i * 边 + 边 + 格, y1 = id.j * 边 + 边 + 格;
  return 盒们.some((b) => b[0]! < x1 && b[2]! > x0 && b[1]! < y1 && b[3]! > y0);
};

/** 一个区段瘦身：摊开、换、收拢 */
export const 瘦身区段 = (d: SectionData, 表: 瘦身表, o: 瘦身选项): SectionData => {
  const vox = 摊开(d);
  换隐藏格(d, vox, 表, o);
  return 收拢(d, vox);
};
