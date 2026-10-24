// 方块拼搭：在代码里一格一格声明原版方块（方块状态字符串 + 格坐标），照 voxel/真实方块表.ts 的面表、真实方块图集.ts 的贴图拼成网格。
// 不用开游戏导网格：小场景（侧剖面的小屋、坑）直接写方块。表里查不到的方块实体（箱子、告示牌）照旧手搭。
// 格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]，再加 原点；场景坐标 Z 朝上（x 东、y 北、z 上），和面表一样。
// 明暗不烤进网格，交给灯（材质受光）；顶点色只放群系染色 × 亮（亮按 sRGB 数值乘，游戏里光照也是直接乘贴图的 sRGB 值）。
// 面剔除：贴着整格不透明方块的面不画（树叶之间照游戏「高品质」不剔）。草方块侧面的草边是叠加贴图，另画一层镂空面。
// 正面花草：十字模型（树苗、草、花）换成一张朝南的正面片，正交侧视时贴图像素和方块一样大、不被斜着压窄（侧剖面用；透视镜头别开）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from './parts.tsx';
import { blockAtlas } from '../voxel/真实方块图集.ts';
import { blockProps, blockTint, faceStride, faceTable, voxelFromState } from '../voxel/真实方块表.ts';

export type 格 = readonly [number, number, number];
/** 状态：方块 id 或方块状态（"minecraft:oak_stairs[facing=east,half=bottom,shape=straight]"）；亮：这一格乘的亮度（sRGB 数值，默认 1）；群系：染色用，不给按 拼搭选项.群系 */
export type 方块 = { 状态: string; 位: 格; 亮?: number; 群系?: string };
export type 拼搭选项 = { 原点?: V3; 群系?: string; 正面花草?: boolean };

/** 自己发光的方块：游戏里亮度拉满，这里画成不受光 */
export const 发光方块 = new Set(['minecraft:torch', 'minecraft:wall_torch', 'minecraft:soul_torch', 'minecraft:soul_wall_torch', 'minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:glowstone']);

type 类 = '实心' | '镂空' | '半透明' | '发光';
type 缓冲 = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
const ATLAS_COLS = 16;
/** sRGB 数值 → 线性（three 0.186 不再导出 SRGBToLinear） */
export const sRGB转线性 = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const 线性 = sRGB转线性;
const 键 = (i: number, j: number, k: number) => `${i},${j},${k}`;
const 邻 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const 查方块 = (状态: string) => {
  const v = voxelFromState(状态);
  if (!v) throw new Error(`方块表里没有「${状态}」（箱子、告示牌这类方块实体要手搭）`);
  return v;
};

// 整个模型都是贴满一格高的竖直十字面（树苗、草、花）才算
const 是十字 = (faces: Float32Array) => {
  const n = faces.length / faceStride;
  if (!n) return false;
  for (let f = 0; f < n; f++) {
    const o = f * faceStride;
    if (faces[o] !== 6) return false;
    for (let c = 0; c < 4; c++) {
      const z = faces[o + 8 + c * 3]!;
      if (z !== 0 && z !== 1) return false;
    }
  }
  return true;
};

/** 方块们 → 各类面的缓冲。纯计算，不建 three 对象 */
export const 拼搭缓冲 = (方块们: readonly 方块[], 选项: 拼搭选项 = {}) => {
  const [ox, oy, oz] = 选项.原点 ?? [0, 0, 0];
  const 占 = new Map<string, number>();
  for (const b of 方块们) {
    const k = 键(...b.位);
    if (占.has(k)) throw new Error(`格 ${k} 放了两个方块`);
    占.set(k, 查方块(b.状态));
  }
  const rows = blockAtlas().rows;
  const 缓冲们: Record<类, 缓冲> = { 实心: 空(), 镂空: 空(), 半透明: 空(), 发光: 空() };
  const 推面 = (buf: 缓冲, 角: number[], uv: number[], tex: number, n: number[], 色: number[]) => {
    const base = buf.pos.length / 3;
    const cx = tex % ATLAS_COLS, cy = Math.floor(tex / ATLAS_COLS);
    for (let c = 0; c < 4; c++) {
      buf.pos.push(角[c * 3]!, 角[c * 3 + 1]!, 角[c * 3 + 2]!);
      buf.nor.push(n[0]!, n[1]!, n[2]!);
      buf.uv.push((cx + uv[c * 2]!) / ATLAS_COLS, (cy + uv[c * 2 + 1]!) / rows);
      buf.col.push(色[0]!, 色[1]!, 色[2]!);
    }
    // 面表的四个角从外面看是顺时针（左上 右上 右下 左下），three 的正面要逆时针
    buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const b of 方块们) {
    const v = 占.get(键(...b.位))!;
    const [i, j, k] = b.位;
    const faces = faceTable[v]!;
    const n = faces.length / faceStride;
    const id = b.状态.split('[')[0]!;
    const 层 = blockProps.layer[v]!;
    const 本类: 类 = 发光方块.has(id) ? '发光' : 层 === 2 || 层 === 3 ? '半透明' : 层 === 1 ? '镂空' : '实心';
    const 亮 = 线性(b.亮 ?? 1);
    const 染 = new THREE.Color(blockTint(v, b.群系 ?? 选项.群系 ?? 'minecraft:plains', i, -j));
    const 白色 = [亮, 亮, 亮];
    const 染色 = [染.r * 亮, 染.g * 亮, 染.b * 亮];
    const x0 = i + ox, y0 = j + oy, z0 = k + oz;
    if (选项.正面花草 && 是十字(faces)) {
      const tex = faces[2]!;
      const 色 = faces[4] ? 染色 : 白色;
      const y = y0 + 0.5;
      推面(缓冲们.镂空, [x0, y, z0 + 1, x0 + 1, y, z0 + 1, x0 + 1, y, z0, x0, y, z0], [0, 0, 1, 0, 1, 1, 0, 1], tex, [0, -1, 0], 色);
      continue;
    }
    for (let f = 0; f < n; f++) {
      const o = f * faceStride;
      const cull = faces[o + 1]!;
      if (cull < 6) {
        const [dx, dy, dz] = 邻[cull]!;
        const nb = 占.get(键(i + dx!, j + dy!, k + dz!));
        if (nb && blockProps.full[nb]) continue;
      }
      const 角: number[] = [];
      for (let c = 0; c < 4; c++) 角.push(x0 + faces[o + 6 + c * 3]!, y0 + faces[o + 7 + c * 3]!, z0 + faces[o + 8 + c * 3]!);
      const uv = Array.from(faces.subarray(o + 18, o + 26));
      const nrm = [faces[o + 26]!, faces[o + 27]!, faces[o + 28]!];
      推面(缓冲们[本类], 角, uv, faces[o + 2]!, nrm, faces[o + 4] ? 染色 : 白色);
      const 叠 = faces[o + 3]!;
      if (叠 >= 0) {
        // 叠加层（草边）贴着底面往外挪一点点，镂空、乘染色
        const e = 1 / 1024;
        const 外 = 角.map((p, q) => p + nrm[q % 3]! * e);
        推面(缓冲们.镂空, 外, uv, 叠, nrm, 染色);
      }
    }
  }
  return 缓冲们;
};

const 空 = (): 缓冲 => ({ pos: [], nor: [], uv: [], col: [], idx: [] });

const 材质 = (c: 类) => {
  const map = blockAtlas().original;
  if (c === '发光') return new THREE.MeshBasicMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const common = { map, vertexColors: true, roughness: 1, metalness: 0 };
  if (c === '镂空') return new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide });
  if (c === '半透明') return new THREE.MeshStandardMaterial({ ...common, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.MeshStandardMaterial(common);
};

/** 方块们 → 网格（每类一个）。几何每次新建，调用的地方按方块表不变就别重建（useMemo） */
export const 拼搭网格 = (方块们: readonly 方块[], 选项: 拼搭选项 = {}): THREE.Mesh[] => {
  const 缓冲们 = 拼搭缓冲(方块们, 选项);
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空', '发光', '半透明'] as const) {
    const b = 缓冲们[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, 材质(c));
    mesh.name = `方块拼搭-${c}`;
    if (c === '半透明') mesh.renderOrder = 5;
    out.push(mesh);
  }
  return out;
};

/** 方块们要各帧同一个数组（或按内容 useMemo），换了就重建网格 */
export const 方块拼搭: React.FC<{ 方块们: readonly 方块[] } & 拼搭选项> = ({ 方块们, 原点, 群系, 正面花草 }) => {
  const meshes = useMemo(() => 拼搭网格(方块们, { 原点, 群系, 正面花草 }), [方块们, 原点?.[0], 原点?.[1], 原点?.[2], 群系, 正面花草]);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

