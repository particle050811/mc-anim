// 方块拼搭：在代码里一格一格声明原版方块（方块状态字符串 + 格坐标），照 voxel/真实方块表.ts 的面表、真实方块图集.ts 的贴图拼成网格。
// 不用开游戏导网格：小场景（侧剖面的小屋、坑）直接写方块。表里查不到的方块实体（箱子、告示牌）照旧手搭。
// 格 (i, j, k) 占 [i, i+1]×[j, j+1]×[k, k+1]，再加 原点；场景坐标 Z 朝上（x 东、y 北、z 上），和面表一样。
//   想让格 i 的中心落在 x = i（格 i 占 [i − 0.5, i + 0.5]），传 原点 [−0.5, 0, 0]。
// 明暗不烤进网格，交给灯（材质受光）或三渲二的平涂（按面朝向乘）；顶点色只放群系染色 × 亮（亮按 sRGB 数值乘，游戏里光照也是直接乘贴图的 sRGB 值）。
// 面剔除：贴着整格不透明方块的面不画（树叶之间照游戏「高品质」不剔）。草方块侧面的草边是叠加贴图，另画一层镂空面。
// 正面花草：十字模型（树苗、草、花）换成一张朝南的正面片，正交侧视时贴图像素和方块一样大、不被斜着压窄（侧剖面用；透视镜头别开）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from './parts.tsx';
import { blockAtlas } from '../voxel/真实方块图集.ts';
import { blockProps, blockTint, faceStride, faceTable, voxelFromState } from '../voxel/真实方块表.ts';

export type CellPos = readonly [number, number, number];
/** 状态：方块 id 或方块状态（"minecraft:oak_stairs[facing=east,half=bottom,shape=straight]"）；亮：这一格乘的亮度（sRGB 数值，默认 1）；群系：染色用，不给按 拼搭选项.群系 */
export type PlacedBlock = { state: string; 位: CellPos; brightness?: number; biome?: string };
export type AssemblyOptions = { origin?: V3; biome?: string; frontPlants?: boolean };

/** 自己发光的方块：游戏里亮度拉满，这里画成不受光 */
export const glowBlocks = new Set(['minecraft:torch', 'minecraft:wall_torch', 'minecraft:soul_torch', 'minecraft:soul_wall_torch', 'minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:glowstone']);

type PassKind = '实心' | '镂空' | '半透明' | '发光';
type MeshBuffer = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
/** sRGB 数值 → 线性（three 0.186 不再导出 SRGBToLinear） */
export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toLinear = srgbToLinear;
const posKey = (i: number, j: number, k: number) => `${i},${j},${k}`;
const neighbors = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const lookupBlock = (blockState: string) => {
  const v = voxelFromState(blockState);
  if (!v) throw new Error(`方块表里没有「${blockState}」（箱子、告示牌这类方块实体要手搭）`);
  return v;
};

// 整个模型都是贴满一格高的竖直十字面（树苗、草、花）才算
const isCross = (faces: Float32Array) => {
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
export const assembleBuffers = (blocks: readonly PlacedBlock[], options: AssemblyOptions = {}) => {
  const [ox, oy, oz] = options.origin ?? [0, 0, 0];
  const occupied = new Map<string, number>();
  for (const b of blocks) {
    const k = posKey(...b.位);
    if (occupied.has(k)) throw new Error(`格 ${k} 放了两个方块`);
    occupied.set(k, lookupBlock(b.state));
  }
  const { rows, cols } = blockAtlas(); // 列数：高倍材质包图集会多于 16 列（真实方块图集.ts）
  const buffers: Record<PassKind, MeshBuffer> = { 实心: emptyBuffer(), 镂空: emptyBuffer(), 半透明: emptyBuffer(), 发光: emptyBuffer() };
  const pushFace = (buf: MeshBuffer, corners: number[], uv: number[], tex: number, n: number[], color: number[]) => {
    const base = buf.pos.length / 3;
    const cx = tex % cols, cy = Math.floor(tex / cols);
    for (let c = 0; c < 4; c++) {
      buf.pos.push(corners[c * 3]!, corners[c * 3 + 1]!, corners[c * 3 + 2]!);
      buf.nor.push(n[0]!, n[1]!, n[2]!);
      buf.uv.push((cx + uv[c * 2]!) / cols, (cy + uv[c * 2 + 1]!) / rows);
      buf.col.push(color[0]!, color[1]!, color[2]!);
    }
    // 面表的四个角从外面看是顺时针（左上 右上 右下 左下），three 的正面要逆时针
    buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const b of blocks) {
    const v = occupied.get(posKey(...b.位))!;
    const [i, j, k] = b.位;
    const faces = faceTable[v]!;
    const n = faces.length / faceStride;
    const id = b.state.split('[')[0]!;
    const renderLayer = blockProps.layer[v]!;
    const blockClass: PassKind = glowBlocks.has(id) ? '发光' : renderLayer === 2 || renderLayer === 3 ? '半透明' : renderLayer === 1 ? '镂空' : '实心';
    const brightness = toLinear(b.brightness ?? 1);
    const tint = new THREE.Color(blockTint(v, b.biome ?? options.biome ?? 'minecraft:plains', i, -j));
    const whiteColor = [brightness, brightness, brightness];
    const shadedTint = [tint.r * brightness, tint.g * brightness, tint.b * brightness];
    const x0 = i + ox, y0 = j + oy, z0 = k + oz;
    if (options.frontPlants && isCross(faces)) {
      const tex = faces[2]!;
      const color = faces[4] ? shadedTint : whiteColor;
      const y = y0 + 0.5;
      pushFace(buffers.镂空, [x0, y, z0 + 1, x0 + 1, y, z0 + 1, x0 + 1, y, z0, x0, y, z0], [0, 0, 1, 0, 1, 1, 0, 1], tex, [0, -1, 0], color);
      continue;
    }
    for (let f = 0; f < n; f++) {
      const o = f * faceStride;
      const cull = faces[o + 1]!;
      if (cull < 6) {
        const [dx, dy, dz] = neighbors[cull]!;
        const nb = occupied.get(posKey(i + dx!, j + dy!, k + dz!));
        if (nb && blockProps.full[nb]) continue;
      }
      const corners: number[] = [];
      for (let c = 0; c < 4; c++) corners.push(x0 + faces[o + 6 + c * 3]!, y0 + faces[o + 7 + c * 3]!, z0 + faces[o + 8 + c * 3]!);
      const uv = Array.from(faces.subarray(o + 18, o + 26));
      const nrm = [faces[o + 26]!, faces[o + 27]!, faces[o + 28]!];
      pushFace(buffers[blockClass], corners, uv, faces[o + 2]!, nrm, faces[o + 4] ? shadedTint : whiteColor);
      const overlayTex = faces[o + 3]!;
      if (overlayTex >= 0) {
        // 叠加层（草边）贴着底面往外挪一点点，镂空、乘染色
        const e = 1 / 1024;
        const outerCorners = corners.map((p, q) => p + nrm[q % 3]! * e);
        pushFace(buffers.镂空, outerCorners, uv, overlayTex, nrm, shadedTint);
      }
    }
  }
  return buffers;
};

const emptyBuffer = (): MeshBuffer => ({ pos: [], nor: [], uv: [], col: [], idx: [] });

// 材质各类一份、全模块共用（贴图是同一张图集），不随网格释放
const materials = new Map<PassKind, THREE.Material>();
const makeMaterial = (c: PassKind) => {
  let m = materials.get(c);
  if (m) return m;
  const map = blockAtlas().original;
  const common = { map, vertexColors: true, roughness: 1, metalness: 0 };
  if (c === '发光') m = new THREE.MeshBasicMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  else if (c === '镂空') m = new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide });
  else if (c === '半透明') m = new THREE.MeshStandardMaterial({ ...common, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  else m = new THREE.MeshStandardMaterial(common);
  materials.set(c, m);
  return m;
};

/** 方块们 → 网格（每类一个）。几何每次新建，用完要 geometry.dispose()（材质是共用的，别释放）；组件 方块拼搭 自己管 */
export const assemblyMeshes = (blocks: readonly PlacedBlock[], options: AssemblyOptions = {}): THREE.Mesh[] => {
  const buffers = assembleBuffers(blocks, options);
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空', '发光', '半透明'] as const) {
    const b = buffers[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, makeMaterial(c));
    mesh.name = `方块拼搭-${c}`;
    if (c === '半透明') mesh.renderOrder = 5;
    out.push(mesh);
  }
  return out;
};

/** 方块们要各帧同一个数组（或按内容 useMemo），换了就重建网格（旧几何随即释放，R3F 不替 primitive 释放） */
export const BlockAssembly: React.FC<{ blocks: readonly PlacedBlock[] } & AssemblyOptions> = ({ blocks, origin: origin, biome: biome, frontPlants }) => {
  const meshes = useMemo(() => assemblyMeshes(blocks, { origin: origin, biome: biome, frontPlants }), [blocks, origin?.[0], origin?.[1], origin?.[2], biome, frontPlants]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

