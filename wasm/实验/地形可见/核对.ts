// 核对器：原格子和改后的格子各走一遍渲染那条路（导入区段.ts 换体素块 → 网格.ts 建网格），比网格。
// 「全同」= 五种材质的顶点数据、分段逐字节相同，是变换 1 的验收。填封闭腔一定会少掉腔壁的面，另用「只少不改」验：
// 新网格的面按原顺序都逐字节在旧网格里，少掉的每个面都贴着被填的格，而被填的格经 封闭 独立复核确实四面不透风。
import { 边, 成区段, type 环境, type 包, type 格子 } from './公共.ts';
import type { SectionMesh, FaceGroup } from '../../../engine/voxel/网格.ts';

const 材质 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 字节 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** 渲染时第 0 级树叶镂空、粗级实心（世界.tsx：section.L >= 1） */
export const 建网格 = (环: 环境, 包: 包, g: 格子, 实心树叶 = g.id.L >= 1): SectionMesh => 环.网格.buildSectionMesh(环.导入区段.importedSectionVoxels(成区段(g), 包.体素上下文), 实心树叶);

export const 网格全同 = (a: SectionMesh, b: SectionMesh) => {
  if (a.面数 !== b.面数) return false;
  for (const m of 材质) {
    const x = a[m], y = b[m];
    if (x.n !== y.n || x.段.join() !== y.段.join()) return false;
    if (字节(x.pos).compare(字节(y.pos)) || 字节(x.uv).compare(字节(y.uv)) || 字节(x.tex).compare(字节(y.tex)) || 字节(x.col).compare(字节(y.col))) return false;
  }
  return true;
};

const 面同 = (a: FaceGroup, i: number, b: FaceGroup, j: number) => {
  for (let t = 0; t < 12; t++) if (a.pos[i * 12 + t] !== b.pos[j * 12 + t]) return false;
  for (let t = 0; t < 8; t++) if (a.uv[i * 8 + t] !== b.uv[j * 8 + t]) return false;
  for (let t = 0; t < 16; t++) if (a.tex[i * 16 + t] !== b.tex[j * 16 + t] || a.col[i * 16 + t] !== b.col[j * 16 + t]) return false;
  return true;
};

export type 面差 = { 少: number; 多: number; 少的不贴: number };
/** 旧 → 新：新的面是不是旧的面按原顺序去掉一些。少 = 旧有新没有；多 = 新有旧没有（含改了的）；少的不贴 = 少掉的面里不贴着 贴 里任何一格的
 *  贴[at] = 1 的格下标同 格子.cm。面的位置以核心格为单位 × 64（网格.ts 的 posScale），核心第 0 列是窗口第 1 列 */
export const 比面 = (旧: SectionMesh, 新: SectionMesh, nz: number, 贴: Uint8Array): 面差 => {
  const 出 = { 少: 0, 多: 0, 少的不贴: 0 };
  const 在贴 = (x: number, y: number, z: number) => {
    const cx = Math.floor(x) + 1, cy = Math.floor(y) + 1, cz = Math.floor(z);
    return cx >= 0 && cy >= 0 && cz >= 0 && cx < 边 && cy < 边 && cz < nz && 贴[(cy * 边 + cx) * nz + cz] === 1;
  };
  for (const m of 材质) {
    const a = 旧[m], b = 新[m];
    for (let 组 = 0; 组 < 11; 组++) {
      let i = a.段[组]!;
      const 少了 = (q: number) => {
        出.少++;
        let lo = [Infinity, Infinity, Infinity], 心 = [0, 0, 0];
        for (let v = 0; v < 4; v++) for (let t = 0; t < 3; t++) { const p = a.pos[q * 12 + v * 3 + t]! / 64; lo[t] = Math.min(lo[t]!, p); 心[t]! += p / 4; }
        const 向 = 组 >= 7 ? 组 - 7 : 组, e = 1 / 128;
        // 面心在被填格里：被填格自己的面（封在腔里的花草、半砖；花草按位置挪过，角可能出格，心不会）
        let 贴着 = 在贴(心[0]!, 心[1]!, 心[2]!);
        if (!贴着 && 向 < 6) {
          // 取面的最小角往面内挪一点，再往面的前、后各挪一点：前面是它朝着的格，后面是它自己那格
          const 轴 = 向 >> 1, 正 = 向 & 1 ? -e : e, p = lo.map((v, t) => (t === 轴 ? v : v + e));
          const 前 = p.slice(), 后 = p.slice();
          前[轴]! += 正; 后[轴]! -= 正;
          贴着 = 在贴(前[0]!, 前[1]!, 前[2]!) || 在贴(后[0]!, 后[1]!, 后[2]!);
        }
        // 被填格自己的面出格一点的（花草按位置挪过，墙上的红石火把斜着伸出去）：面心往六个方向各挪 0.26 格再看。
        // 挪不到斜对角的格；被填格正对着的六个邻格 封闭 已经核过不是整格不透明就是同被填，所以放宽了也不会把露天格的面算进来
        if (!贴着) for (let t = 0; t < 3 && !贴着; t++) for (const d of [-0.26, 0.26]) { const q = 心.slice(); q[t]! += d; if (在贴(q[0]!, q[1]!, q[2]!)) { 贴着 = true; break; } }
        if (!贴着) 出.少的不贴++;
      };
      for (let j = b.段[组]!; j < b.段[组 + 1]!; j++) {
        let k = i;
        while (k < a.段[组 + 1]! && !面同(a, k, b, j)) k++;
        if (k === a.段[组 + 1]!) { 出.多++; continue; } // 旧的里找不到：不往前挪，后面的面照旧从 i 起找
        for (; i < k; i++) 少了(i);
        i = k + 1;
      }
      for (; i < a.段[组 + 1]!; i++) 少了(i);
    }
  }
  return 出;
};

/** 独立复核填掉的格确实封闭：每个被填格的六个邻格，原来不是整格不透明的也都在被填之列；被填格不在最上一层、不在核心的边和相邻那圈。
 *  和 变换.ts 的找法（从露天往里漫）不是一条路：这里只看被填的格和它的邻格。返回不满足的格数 */
export const 封闭 = (原: 格子, 填: Int32Array): number => {
  const { nz, cm, 满 } = 原, 行 = 边 * nz, 在 = new Uint8Array(cm.length);
  for (const at of 填) 在[at] = 1;
  let 坏 = 0;
  for (const at of 填) {
    const c = Math.floor(at / nz), k = at - c * nz, x = c % 边, y = (c - x) / 边;
    const 实 = (n: number) => 满[cm[n]!] === 1 || 在[n] === 1;
    if (满[cm[at]!] || k === nz - 1 || x < 2 || y < 2 || x > 边 - 3 || y > 边 - 3) { 坏++; continue; }
    if (!(k === 0 || 实(at - 1)) || !实(at + 1) || !实(at - nz) || !实(at + nz) || !实(at - 行) || !实(at + 行)) 坏++;
  }
  return 坏;
};

/** 不透明性有没有变（变换 1 不许变）：返回整格不透明 ↔ 非整格 翻了的格数 */
export const 不透明性变了 = (a: 格子, b: 格子): number => {
  let n = 0;
  for (let at = 0; at < a.cm.length; at++) if (a.满[a.cm[at]!] !== b.满[b.cm[at]!]) n++;
  return n;
};
