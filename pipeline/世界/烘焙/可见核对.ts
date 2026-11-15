// 可见变换（可见.ts）的核对，转码时逐区段跑（转码工人.ts 的 比）：
// - 格：改了的格只许是 整格 → 填充（改完还六面被埋）、封死的非整格 → 填充（封闭 另走一条路复核）、邻圈挡面掩码 0 的 → 空气；
// - 网格：原样和改后各走一遍渲染那条路（导入区段.ts 换体素块 → 网格.ts 建网格，树叶画法照渲染：第 0 级镂空、粗级实心）。
//   前七组（六个朝向和不沿轴）：没填腔的逐字节相同；填了的「只少不改」：新的面按原顺序都逐字节在旧的里，少掉的面都贴着被填的格。
//   裙边四组：没换核心边的逐字节相同；换了的只许贴图变，盖住的格一格不差。
// 不靠 变换 本身的写法：变换 写错了，这里应当报出来。网格模块要方块表、群系色 JSON，同 体素库.ts 先注册资产钩子再动态 import。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SectionData, 包信息 } from '../../../engine/voxel/区段包.ts';
import type * as 网格模块 from '../../../engine/voxel/网格.ts';
import type * as 导入区段模块 from '../../../engine/voxel/导入区段.ts';
import type { FaceGroup, SectionMesh } from '../../../engine/voxel/网格.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 注册资产钩子, type 体素库 } from '../体素库.ts';
import { 窗边, type 格子, type 变换记 } from './可见.ts';
import { 到列优先 } from './区段编码.ts';

const 材质 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 字节 = (a: ArrayBufferView, 起 = 0, 长 = a.byteLength) => Buffer.from(a.buffer, a.byteOffset + 起, 长);

export const 载入网格 = async (库: 体素库, info: 包信息) => {
  注册资产钩子();
  const 载 = <T>(名: string) => import(pathToFileURL(path.join(代码根(), 'engine', 'voxel', 名)).href) as Promise<T>;
  const [网格, 导入区段] = await Promise.all([载<typeof 网格模块>('网格.ts'), 载<typeof 导入区段模块>('导入区段.ts')]);
  const ctx = { info, tables: 库.区段包.buildPackTables(info), variesByPos: info.群系.map(库.群系色.variesByPos), cutBoxes: [], flattenAreas: [] };
  return (d: SectionData): SectionMesh => 网格.buildSectionMesh(导入区段.importedSectionVoxels(d, ctx), d.L >= 1);
};

const 面同 = (a: FaceGroup, i: number, b: FaceGroup, j: number) => {
  for (let t = 0; t < 12; t++) if (a.pos[i * 12 + t] !== b.pos[j * 12 + t]) return false;
  for (let t = 0; t < 8; t++) if (a.uv[i * 8 + t] !== b.uv[j * 8 + t]) return false;
  for (let t = 0; t < 16; t++) if (a.tex[i * 16 + t] !== b.tex[j * 16 + t] || a.col[i * 16 + t] !== b.col[j * 16 + t]) return false;
  return true;
};
const 组同 = (a: FaceGroup, b: FaceGroup, g0: number, g1: number) => {
  const x0 = a.段[g0]!, x1 = a.段[g1]!, y0 = b.段[g0]!, y1 = b.段[g1]!;
  if (x1 - x0 !== y1 - y0) return false;
  const n = x1 - x0;
  return !字节(a.pos, x0 * 24, n * 24).compare(字节(b.pos, y0 * 24, n * 24)) && !字节(a.uv, x0 * 16, n * 16).compare(字节(b.uv, y0 * 16, n * 16)) && !字节(a.tex, x0 * 32, n * 32).compare(字节(b.tex, y0 * 32, n * 32)) && !字节(a.col, x0 * 16, n * 16).compare(字节(b.col, y0 * 16, n * 16));
};

/** 前七组：旧 → 新是不是去掉一些面。少的不贴 = 少掉的面里不贴着任何被填格的；多 = 新有旧没有的（含改了的）。
 *  面的位置以格为单位 × 64（网格.ts 的 posScale），核心第 0 列是窗口第 1 列 */
const 比面 = (旧: SectionMesh, 新: SectionMesh, nz: number, 贴: Uint8Array) => {
  const 出 = { 少: 0, 多: 0, 少的不贴: 0 };
  const 在贴 = (x: number, y: number, z: number) => {
    const cx = Math.floor(x) + 1, cy = Math.floor(y) + 1, cz = Math.floor(z);
    return cx >= 0 && cy >= 0 && cz >= 0 && cx < 窗边 && cy < 窗边 && cz < nz && 贴[(cy * 窗边 + cx) * nz + cz] === 1;
  };
  for (const m of 材质) {
    const a = 旧[m], b = 新[m];
    for (let 组 = 0; 组 < 7; 组++) {
      let i = a.段[组]!;
      const 少了 = (q: number) => {
        出.少++;
        const lo = [Infinity, Infinity, Infinity], 心 = [0, 0, 0];
        for (let v = 0; v < 4; v++) for (let t = 0; t < 3; t++) { const p = a.pos[q * 12 + v * 3 + t]! / 64; lo[t] = Math.min(lo[t]!, p); 心[t]! += p / 4; }
        // 面心在被填格里：被填格自己的面（封在腔里的花草、半砖）
        let 贴着 = 在贴(心[0]!, 心[1]!, 心[2]!);
        if (!贴着 && 组 < 6) {
          // 最小角往面内挪一点，再往面的前、后各挪一点：前面是它朝着的格，后面是它自己那格
          const e = 1 / 128, 轴 = 组 >> 1, 正 = 组 & 1 ? -e : e, p = lo.map((v, t) => (t === 轴 ? v : v + e));
          const 前 = p.slice(), 后 = p.slice();
          前[轴]! += 正; 后[轴]! -= 正;
          贴着 = 在贴(前[0]!, 前[1]!, 前[2]!) || 在贴(后[0]!, 后[1]!, 后[2]!);
        }
        // 被填格自己的面出格一点的（花草按位置挪过、墙上的火把斜着伸出去）：面心往六个方向各挪 0.26 格。被填格正对着的六个邻格 封闭 核过不是整格就是同被填
        if (!贴着) for (let t = 0; t < 3 && !贴着; t++) for (const d of [-0.26, 0.26]) { const q = 心.slice(); q[t]! += d; if (在贴(q[0]!, q[1]!, q[2]!)) { 贴着 = true; break; } }
        if (!贴着) 出.少的不贴++;
      };
      for (let j = b.段[组]!; j < b.段[组 + 1]!; j++) {
        let k = i;
        while (k < a.段[组 + 1]! && !面同(a, k, b, j)) k++;
        if (k === a.段[组 + 1]!) { 出.多++; continue; }
        for (; i < k; i++) 少了(i);
        i = k + 1;
      }
      for (; i < a.段[组 + 1]!; i++) 少了(i);
    }
  }
  return 出;
};

/** 四组裙边各盖住哪些格（墙面上每格被几个面盖着） */
const 裙边盖 = (m: SectionMesh, nz: number) => {
  const 盖 = new Uint8Array(4 * 32 * nz);
  for (const k of 材质) for (let d = 0; d < 4; d++) for (let q = m[k].段[7 + d]!; q < m[k].段[8 + d]!; q++) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let v = 0; v < 4; v++) { const u = m[k].pos[q * 12 + v * 3 + (d < 2 ? 1 : 0)]! / 64, z = m[k].pos[q * 12 + v * 3 + 2]! / 64; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, z); v1 = Math.max(v1, z); }
    for (let u = Math.floor(u0); u < Math.ceil(u1); u++) for (let z = Math.floor(v0); z < Math.ceil(v1); z++) 盖[(d * 32 + u) * nz + z]!++;
  }
  return 盖;
};

/** 网格核对，过了返回 null，不过返回说明 */
export const 核网格 = (旧: SectionMesh, 新: SectionMesh, nz: number, 记: 变换记): string | null => {
  if (!记.填.length) {
    for (const m of 材质) if (!组同(旧[m], 新[m], 0, 7)) return `${m} 前七组变了（没填腔应当逐字节相同）`;
  } else {
    const 贴 = new Uint8Array(窗边 * 窗边 * nz);
    for (const at of 记.填) 贴[at] = 1;
    const 差 = 比面(旧, 新, nz, 贴);
    if (差.多 || 差.少的不贴) return `填腔后前七组不是「只少不改」：多 ${差.多} 个面、少的面里 ${差.少的不贴} 个不贴着被填的格`;
  }
  if (!记.核心边.length) {
    for (const m of 材质) if (!组同(旧[m], 新[m], 7, 11)) return `${m} 裙边变了（没换核心边应当逐字节相同）`;
  } else if (Buffer.compare(裙边盖(旧, nz), 裙边盖(新, nz))) return '换核心边后裙边盖住的格变了';
  return null;
};

/** 格的核对（不看 变换 怎么找的）：返回不合规矩的格数和第一处的说明。旧 是原样的格子（色板可能多一项没用到的填充方块），新 是改后的区段 */
export const 核格 = (旧: 格子, 新: SectionData, 罩: Uint8Array, 记: 变换记): { 坏: number; 说: string } => {
  const { nz, cm, 满, 石, 色板 } = 旧, 行 = 窗边 * nz, cx = 到列优先(新);
  if (新.kBottom !== 旧.kBottom || 新.nz !== nz) return { 坏: 1, 说: '区段头变了' };
  const 新态满 = Uint8Array.from({ length: 新.palette.length / 2 }, (_, p) => (p ? 罩[新.palette[2 * p]!]! & 1 : 0));
  const 实 = (n: number) => 新态满[cx[n]!] === 1;
  const 填 = new Uint8Array(cm.length);
  for (const at of 记.填) 填[at] = 1;
  let 坏 = 0, 说 = '';
  const 记坏 = (at: number, 何: string) => { if (!坏++) 说 = `第 ${at} 格：${何}`; };
  for (let at = 0; at < cm.length; at++) {
    const p = cm[at]!, q = cx[at]!, 原态 = 色板[2 * p]!, 新态 = 新.palette[2 * q]!;
    if (原态 === 新态 && 色板[2 * p + 1] === 新.palette[2 * q + 1]) continue;
    const c = Math.floor(at / nz), k = at - c * nz, x = c % 窗边, y = (c - x) / 窗边, 邻圈 = x === 0 || y === 0 || x === 窗边 - 1 || y === 窗边 - 1;
    if (!q) { if (!邻圈 || 满[p] || 罩[原态]! & 7) 记坏(at, '换成空气的不是邻圈里挡面掩码为 0 的格'); continue; }
    if (新态 !== 色板[2 * 石] || 新.palette[2 * q + 1] !== 65535) { 记坏(at, '换进去的不是填充方块'); continue; }
    if (!满[p]) { if (!填[at]) 记坏(at, '非整格换成了填充方块，却不在被填之列'); continue; }
    // 整格 → 填充：改完还六面被埋（窗口外当整格，最下一层下面当实心，最上一层上面是空气）
    if (k === nz - 1 || (k > 0 && !实(at - 1)) || !实(at + 1) || (x > 0 && !实(at - nz)) || (x < 窗边 - 1 && !实(at + nz)) || (y > 0 && !实(at - 行)) || (y < 窗边 - 1 && !实(at + 行))) 记坏(at, '换掉的整格没有六面被埋');
    else if (!邻圈 && 旧.id.L !== 0 && (x === 1 || y === 1 || x === 窗边 - 2 || y === 窗边 - 2)) 记坏(at, '粗级的核心边被换了');
  }
  const 不封 = 封闭(旧, 记.填);
  if (不封 && !坏) 说 = '被填的格不是封死的';
  return { 坏: 坏 + 不封, 说 };
};

/** 独立复核被填的格确实封闭：六个邻格原来不是整格的也都在被填之列；被填格不在最上一层、不在核心的边和邻圈。返回不满足的格数 */
export const 封闭 = (原: 格子, 填: Int32Array): number => {
  const { nz, cm, 满 } = 原, 行 = 窗边 * nz, 在 = new Uint8Array(cm.length);
  for (const at of 填) 在[at] = 1;
  let 坏 = 0;
  for (const at of 填) {
    const c = Math.floor(at / nz), k = at - c * nz, x = c % 窗边, y = (c - x) / 窗边;
    const 实 = (n: number) => 满[cm[n]!] === 1 || 在[n] === 1;
    if (满[cm[at]!] || k === nz - 1 || x < 2 || y < 2 || x > 窗边 - 3 || y > 窗边 - 3) { 坏++; continue; }
    if (!(k === 0 || 实(at - 1)) || !实(at + 1) || !实(at - nz) || !实(at + nz) || !实(at - 行) || !实(at + 行)) 坏++;
  }
  return 坏;
};
