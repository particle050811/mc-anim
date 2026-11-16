// 可见变换（可见.ts）的核对，转码时逐区段跑（转码工人.ts 的 比）：
// - 格：改了的格只许是 整格 → 填充（改完还六面被埋）、封死的非整格 → 填充（封闭 另走一条路复核）、邻圈挡面掩码 0 的 → 空气；
// - 网格：原样和改后各走一遍渲染那条路（导入区段.ts 换体素块 → 网格.ts 建网格，树叶画法照渲染：第 0 级镂空、粗级实心）。
//   前八组（六个朝向、不沿轴、两面沿轴）：没填腔的逐字节相同；填了的「只少不改」：新的面按原顺序都逐字节在旧的里，少掉的面都贴着被填的格。
//   裙边四组：没换核心边的逐字节相同；换了的只许贴图变，盖住的格一格不差。
// 不靠 变换 本身的写法：变换 写错了，这里应当报出来。网格模块要方块表、群系色 JSON，同 体素库.ts 先注册资产钩子再动态 import。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SectionData, PackageInfo } from '../../../engine/voxel/区段包.ts';
import type * as meshModule from '../../../engine/voxel/网格.ts';
import type * as importSectionModule from '../../../engine/voxel/导入区段.ts';
import type { FaceGroup, SectionMesh } from '../../../engine/voxel/网格.ts';
import { codeRoot } from '../../环境/路径.ts';
import { registerAssetHook, type VoxelLib } from '../体素库.ts';
import { windowEdge, type CellGrid, type TransformRecord } from './可见.ts';
import { toColumnMajor } from './区段编码.ts';

const materials = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
// 网格.ts 的分组（裙边从第几组起、一共几组）：它要等资产钩子注册后才 import 得了，在 loadMesh 里填
let skirtGroupStart = 0, groupCount = 0;
const bytesOf = (a: ArrayBufferView, start = 0, length = a.byteLength) => Buffer.from(a.buffer, a.byteOffset + start, length);

export const loadMesh = async (voxelLib: VoxelLib, info: PackageInfo) => {
  registerAssetHook();
  const load = <T>(fileName: string) => import(pathToFileURL(path.join(codeRoot(), 'engine', 'voxel', fileName)).href) as Promise<T>;
  const [mesh, importSection] = await Promise.all([load<typeof meshModule>('网格.ts'), load<typeof importSectionModule>('导入区段.ts')]);
  ({ skirtGroupStart, groupCount } = mesh);
  const ctx = { info, tables: voxelLib.sectionPack.buildPackTables(info), variesByPos: info.biome.map(voxelLib.biomeColor.variesByPos), cutBoxes: [], flattenAreas: [] };
  return (d: SectionData): SectionMesh => mesh.buildSectionMesh(importSection.importedSectionVoxels(d, ctx), d.L >= 1);
};

const sameFace = (a: FaceGroup, i: number, b: FaceGroup, j: number) => {
  for (let t = 0; t < 12; t++) if (a.pos[i * 12 + t] !== b.pos[j * 12 + t]) return false;
  for (let t = 0; t < 8; t++) if (a.uv[i * 8 + t] !== b.uv[j * 8 + t]) return false;
  for (let t = 0; t < 16; t++) if (a.tex[i * 16 + t] !== b.tex[j * 16 + t] || a.col[i * 16 + t] !== b.col[j * 16 + t]) return false;
  return true;
};
const sameGroup = (a: FaceGroup, b: FaceGroup, g0: number, g1: number) => {
  const x0 = a.segment[g0]!, x1 = a.segment[g1]!, y0 = b.segment[g0]!, y1 = b.segment[g1]!;
  if (x1 - x0 !== y1 - y0) return false;
  const n = x1 - x0;
  return !bytesOf(a.pos, x0 * 24, n * 24).compare(bytesOf(b.pos, y0 * 24, n * 24)) && !bytesOf(a.uv, x0 * 16, n * 16).compare(bytesOf(b.uv, y0 * 16, n * 16)) && !bytesOf(a.tex, x0 * 32, n * 32).compare(bytesOf(b.tex, y0 * 32, n * 32)) && !bytesOf(a.col, x0 * 16, n * 16).compare(bytesOf(b.col, y0 * 16, n * 16));
};

/** 前八组：旧 → 新是不是去掉一些面。少的不贴 = 少掉的面里不贴着任何被填格的；多 = 新有旧没有的（含改了的）。
 *  面的位置以格为单位 × 64（网格.ts 的 posScale），核心第 0 列是窗口第 1 列 */
const compareFaces = (oldMesh: SectionMesh, newMesh: SectionMesh, nz: number, touchMask: Uint8Array) => {
  const tally = { 少: 0, 多: 0, 少的不贴: 0 };
  const isTouching = (x: number, y: number, z: number) => {
    const cx = Math.floor(x) + 1, cy = Math.floor(y) + 1, cz = Math.floor(z);
    return cx >= 0 && cy >= 0 && cz >= 0 && cx < windowEdge && cy < windowEdge && cz < nz && touchMask[(cy * windowEdge + cx) * nz + cz] === 1;
  };
  for (const m of materials) {
    const a = oldMesh[m], b = newMesh[m];
    for (let group = 0; group < skirtGroupStart; group++) {
      let i = a.segment[group]!;
      const markMissing = (q: number) => {
        tally.少++;
        const lo = [Infinity, Infinity, Infinity], center = [0, 0, 0];
        for (let v = 0; v < 4; v++) for (let t = 0; t < 3; t++) { const p = a.pos[q * 12 + v * 3 + t]! / 64; lo[t] = Math.min(lo[t]!, p); center[t]! += p / 4; }
        // 面心在被填格里：被填格自己的面（封在腔里的花草、半砖）
        let touching = isTouching(center[0]!, center[1]!, center[2]!);
        if (!touching && group < 6) {
          // 最小角往面内挪一点，再往面的前、后各挪一点：前面是它朝着的格，后面是它自己那格
          const e = 1 / 128, axis = group >> 1, sign = group & 1 ? -e : e, p = lo.map((v, t) => (t === axis ? v : v + e));
          const front = p.slice(), back = p.slice();
          front[axis]! += sign; back[axis]! -= sign;
          touching = isTouching(front[0]!, front[1]!, front[2]!) || isTouching(back[0]!, back[1]!, back[2]!);
        }
        // 被填格自己的面出格一点的（花草按位置挪过、墙上的火把斜着伸出去）：面心往六个方向各挪 0.26 格。被填格正对着的六个邻格 封闭 核过不是整格就是同被填
        if (!touching) for (let t = 0; t < 3 && !touching; t++) for (const d of [-0.26, 0.26]) { const q = center.slice(); q[t]! += d; if (isTouching(q[0]!, q[1]!, q[2]!)) { touching = true; break; } }
        if (!touching) tally.少的不贴++;
      };
      for (let j = b.segment[group]!; j < b.segment[group + 1]!; j++) {
        let k = i;
        while (k < a.segment[group + 1]! && !sameFace(a, k, b, j)) k++;
        if (k === a.segment[group + 1]!) { tally.多++; continue; }
        for (; i < k; i++) markMissing(i);
        i = k + 1;
      }
      for (; i < a.segment[group + 1]!; i++) markMissing(i);
    }
  }
  return tally;
};

/** 四组裙边各盖住哪些格（墙面上每格被几个面盖着） */
const skirtCover = (m: SectionMesh, nz: number) => {
  const sectionCells = windowEdge - 2, cover = new Uint8Array(4 * sectionCells * nz);
  for (const k of materials) for (let d = 0; d < 4; d++) for (let q = m[k].segment[skirtGroupStart + d]!; q < m[k].segment[skirtGroupStart + 1 + d]!; q++) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let v = 0; v < 4; v++) { const u = m[k].pos[q * 12 + v * 3 + (d < 2 ? 1 : 0)]! / 64, z = m[k].pos[q * 12 + v * 3 + 2]! / 64; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, z); v1 = Math.max(v1, z); }
    for (let u = Math.floor(u0); u < Math.ceil(u1); u++) for (let z = Math.floor(v0); z < Math.ceil(v1); z++) cover[(d * sectionCells + u) * nz + z]!++;
  }
  return cover;
};

/** 网格核对，过了返回 null，不过返回说明 */
export const checkMesh = (oldMesh: SectionMesh, newMesh: SectionMesh, nz: number, changeRecord: TransformRecord): string | null => {
  if (!changeRecord.filled.length) {
    for (const m of materials) if (!sameGroup(oldMesh[m], newMesh[m], 0, skirtGroupStart)) return `${m} 前八组变了（没填腔应当逐字节相同）`;
  } else {
    const touchMask = new Uint8Array(windowEdge * windowEdge * nz);
    for (const at of changeRecord.filled) touchMask[at] = 1;
    const diff = compareFaces(oldMesh, newMesh, nz, touchMask);
    if (diff.多 || diff.少的不贴) return `填腔后前八组不是「只少不改」：多 ${diff.多} 个面、少的面里 ${diff.少的不贴} 个不贴着被填的格`;
  }
  if (!changeRecord.核心边.length) {
    for (const m of materials) if (!sameGroup(oldMesh[m], newMesh[m], skirtGroupStart, groupCount)) return `${m} 裙边变了（没换核心边应当逐字节相同）`;
  } else if (Buffer.compare(skirtCover(oldMesh, nz), skirtCover(newMesh, nz))) return '换核心边后裙边盖住的格变了';
  return null;
};

/** 格的核对（不看 变换 怎么找的）：返回不合规矩的格数和第一处的说明。旧 是原样的格子（色板可能多一项没用到的填充方块），新 是改后的区段 */
export const checkGrid = (oldGrid: CellGrid, newData: SectionData, occlusion: Uint8Array, changeRecord: TransformRecord): { 坏: number; 说: string } => {
  const { nz, cm, fullMask, stone, palette } = oldGrid, rowStride = windowEdge * nz, cx = toColumnMajor(newData);
  if (newData.kBottom !== oldGrid.kBottom || newData.nz !== nz) return { 坏: 1, 说: '区段头变了' };
  const newFullMask = Uint8Array.from({ length: newData.palette.length / 2 }, (_, p) => (p ? occlusion[newData.palette[2 * p]!]! & 1 : 0));
  const isSolid = (n: number) => newFullMask[cx[n]!] === 1;
  const filledMask = new Uint8Array(cm.length);
  for (const at of changeRecord.filled) filledMask[at] = 1;
  let badCount = 0, message = '';
  const markBad = (at: number, problem: string) => { if (!badCount++) message = `第 ${at} 格：${problem}`; };
  for (let at = 0; at < cm.length; at++) {
    const p = cm[at]!, q = cx[at]!, oldState = palette[2 * p]!, newState = newData.palette[2 * q]!;
    if (oldState === newState && palette[2 * p + 1] === newData.palette[2 * q + 1]) continue;
    const c = Math.floor(at / nz), k = at - c * nz, x = c % windowEdge, y = (c - x) / windowEdge, inNeighborRing = x === 0 || y === 0 || x === windowEdge - 1 || y === windowEdge - 1;
    if (!q) { if (!inNeighborRing || fullMask[p] || occlusion[oldState]! & 7) markBad(at, '换成空气的不是邻圈里挡面掩码为 0 的格'); continue; }
    if (newState !== palette[2 * stone] || newData.palette[2 * q + 1] !== 65535) { markBad(at, '换进去的不是填充方块'); continue; }
    if (!fullMask[p]) { if (!filledMask[at]) markBad(at, '非整格换成了填充方块，却不在被填之列'); continue; }
    // 整格 → 填充：改完还六面被埋（窗口外当整格，最下一层下面当实心，最上一层上面是空气）
    if (k === nz - 1 || (k > 0 && !isSolid(at - 1)) || !isSolid(at + 1) || (x > 0 && !isSolid(at - nz)) || (x < windowEdge - 1 && !isSolid(at + nz)) || (y > 0 && !isSolid(at - rowStride)) || (y < windowEdge - 1 && !isSolid(at + rowStride))) markBad(at, '换掉的整格没有六面被埋');
    else if (!inNeighborRing && oldGrid.id.L !== 0 && (x === 1 || y === 1 || x === windowEdge - 2 || y === windowEdge - 2)) markBad(at, '粗级的核心边被换了');
  }
  const unsealedCount = countUnsealed(oldGrid, changeRecord.filled);
  if (unsealedCount && !badCount) message = '被填的格不是封死的';
  return { 坏: badCount + unsealedCount, 说: message };
};

/** 独立复核被填的格确实封闭：六个邻格原来不是整格的也都在被填之列；被填格不在最上一层、不在核心的边和邻圈。返回不满足的格数 */
export const countUnsealed = (original: CellGrid, filled: Int32Array): number => {
  const { nz, cm, fullMask } = original, rowStride = windowEdge * nz, filledMask = new Uint8Array(cm.length);
  for (const at of filled) filledMask[at] = 1;
  let badCount = 0;
  for (const at of filled) {
    const c = Math.floor(at / nz), k = at - c * nz, x = c % windowEdge, y = (c - x) / windowEdge;
    const isSolid = (n: number) => fullMask[cm[n]!] === 1 || filledMask[n] === 1;
    if (fullMask[cm[at]!] || k === nz - 1 || x < 2 || y < 2 || x > windowEdge - 3 || y > windowEdge - 3) { badCount++; continue; }
    if (!(k === 0 || isSolid(at - 1)) || !isSolid(at + 1) || !isSolid(at - nz) || !isSolid(at + nz) || !isSolid(at - rowStride) || !isSolid(at + rowStride)) badCount++;
  }
  return badCount;
};
