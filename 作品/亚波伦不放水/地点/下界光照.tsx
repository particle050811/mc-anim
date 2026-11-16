// 下界的发光方块照亮周围（原型，只在试看 {"下界光": {...}} 时开，不进指纹、不改默认画面；用户 11-16 要「更真实的光影」，做法待用户挑）。
// 两种：
// - 光体（mode = "volume"，默认）：开头把镜头四周的第 1 级区段（2 米一格）读成一块 3D 格子，从发光方块往空气里一格格传光（每格乘 decay，取各通道最大，
//   同 Photon 彩色光的 floodfill，被整格方块挡住），存成 3D 贴图；体素材质在片元里按 位置 + 法线半格 取一下，贴图原色 × 光 × strength 加进自发光。
//   照得到拐角后面、照不穿墙，只在开头建一次（一个镜头内光不动）。
// - 点光（mode = "points"）：同一块格子里的发光方块按 16 米分堆，取离镜头最近、最亮的 N 堆各放一盏 three 点光（不投影，会穿墙）。
// 参数：radius（米，镜头水平四周，默认 200）、decay（光体每 2 米乘多少，默认 0.8）、strength（默认 2）、count（点光盏数，默认 8）。
// 发光方块自己的面不再加光体（乘 vCol.a，发光面是 0），不然熔岩、火被自己的光照成粉白。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { trialParams } from '@engine/core/试看.ts';
import { voxelMaterial } from '@engine/voxel/材质.ts';
import type { ImportedTerrain } from '@engine/voxel/导入地形.ts';
import { sectionCells, type SectionId } from '@engine/voxel/区段.ts';
import { blockNames, blockProps } from '@engine/voxel/真实方块表.ts';

export type NetherLightTrial = { mode?: 'volume' | 'points'; radius?: number; decay?: number; strength?: number; count?: number };
export const netherLightTrial = () => trialParams<NetherLightTrial>('下界光');

const level = 1;
const cellM = 2 ** level;
const sectionM = sectionCells * cellM;

// 光色（线性，乘发光强度）：熔岩、岩浆偏橙红，火、灯偏橙黄，灵魂火偏青，萤石偏暖白
const glowColor = (voxel: number): [number, number, number] => {
  const name = blockNames[voxel - 1] ?? '';
  if (name.includes('soul')) return [0.35, 0.8, 1];
  if (name.includes('lava') || name.includes('magma')) return [1, 0.42, 0.12];
  if (name.includes('glowstone') || name.includes('froglight') || name.includes('sea_lantern')) return [1, 0.82, 0.5];
  if (name.includes('shroomlight')) return [1, 0.6, 0.3];
  return [1, 0.62, 0.28];
};

type LightGrid = { W: number; H: number; D: number; min: [number, number, number]; opaque: Uint8Array; emit: Float32Array };

// 镜头四周的第 1 级区段读成一块格子：整格不透明的记挡光，发光的记光色 × 强度
const readGrid = async (t: ImportedTerrain, center: readonly number[], radius: number, zTop: number): Promise<LightGrid> => {
  const i0 = Math.floor((center[0]! - radius) / sectionM), i1 = Math.floor((center[0]! + radius) / sectionM);
  const j0 = Math.floor((center[1]! - radius) / sectionM), j1 = Math.floor((center[1]! + radius) / sectionM);
  const qs: SectionId[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) qs.push({ L: level, i, j });
  await t.source.prefetch?.(qs, true);
  const W = (i1 - i0 + 1) * sectionCells, H = (j1 - j0 + 1) * sectionCells, D = Math.ceil(zTop / cellM);
  const min: [number, number, number] = [i0 * sectionM, j0 * sectionM, 0];
  const opaque = new Uint8Array(W * H * D);
  const emit = new Float32Array(W * H * D * 3);
  for (const q of qs) {
    const g = t.source.sections(q);
    if (!g) continue;
    const pal = g.palette.map((p) => p.v);
    for (let gz = 0; gz < g.nz; gz++) {
      const vz = Math.floor((g.origin[2] + gz * g.cell - min[2]) / cellM);
      if (vz < 0 || vz >= D) continue;
      for (let gy = 1; gy < g.ny - 1; gy++) {
        const vy = (g.origin[1] + (gy - 1) * g.cell - min[1]) / cellM;
        for (let gx = 1; gx < g.nx - 1; gx++) {
          const pi = g.vox[(gz * g.ny + gy) * g.nx + gx]!;
          if (!pi) continue;
          const v = pal[pi]!;
          const vx = (g.origin[0] + (gx - 1) * g.cell - min[0]) / cellM;
          const idx = (vz * H + vy) * W + vx;
          if (blockProps.opaque[v]! >= 15) opaque[idx] = 1;
          const glow = blockProps.glow[v]! / 255;
          if (glow) {
            const c = glowColor(v);
            for (let k = 0; k < 3; k++) emit[idx * 3 + k] = c[k]! * glow;
          }
        }
      }
    }
  }
  return { W, H, D, min, opaque, emit };
};

// 光体：从发光格往不挡光的格传，每格乘 衰减，各通道取最大；传完挡光格取六邻里最亮的（贴图线性插值时墙面不被墙里的 0 拉暗）
const floodFill = (grid: LightGrid, decay: number) => {
  const { W, H, D, opaque, emit } = grid;
  const N = W * H * D;
  const light = Float32Array.from(emit);
  const queue = new Int32Array(N);
  const queued = new Uint8Array(N);
  let head = 0, size = 0;
  const push = (i: number) => {
    if (queued[i]) return;
    queued[i] = 1;
    queue[(head + size++) % N] = i;
  };
  for (let i = 0; i < N; i++) if (emit[i * 3]! + emit[i * 3 + 1]! + emit[i * 3 + 2]! > 0) push(i);
  const eps = 1 / 255;
  const steps = [1, -1, W, -W, W * H, -W * H];
  while (size) {
    const i = queue[head]!;
    head = (head + 1) % N;
    size--;
    queued[i] = 0;
    const x = i % W, y = Math.floor(i / W) % H, z = Math.floor(i / (W * H));
    const r = light[i * 3]! * decay, g = light[i * 3 + 1]! * decay, b = light[i * 3 + 2]! * decay;
    if (r < eps && g < eps && b < eps) continue;
    for (let s = 0; s < 6; s++) {
      if ((s === 0 && x === W - 1) || (s === 1 && x === 0) || (s === 2 && y === H - 1) || (s === 3 && y === 0) || (s === 4 && z === D - 1) || (s === 5 && z === 0)) continue;
      const n = i + steps[s]!;
      if (opaque[n]) continue;
      const o = n * 3;
      if (r > light[o]! + eps || g > light[o + 1]! + eps || b > light[o + 2]! + eps) {
        light[o] = Math.max(light[o]!, r);
        light[o + 1] = Math.max(light[o + 1]!, g);
        light[o + 2] = Math.max(light[o + 2]!, b);
        push(n);
      }
    }
  }
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    let r = light[i * 3]!, g = light[i * 3 + 1]!, b = light[i * 3 + 2]!;
    if (opaque[i] && !(emit[i * 3]! + emit[i * 3 + 1]! + emit[i * 3 + 2]!)) {
      const x = i % W, y = Math.floor(i / W) % H, z = Math.floor(i / (W * H));
      for (let s = 0; s < 6; s++) {
        if ((s === 0 && x === W - 1) || (s === 1 && x === 0) || (s === 2 && y === H - 1) || (s === 3 && y === 0) || (s === 4 && z === D - 1) || (s === 5 && z === 0)) continue;
        const n = i + steps[s]!;
        if (opaque[n]) continue;
        r = Math.max(r, light[n * 3]!);
        g = Math.max(g, light[n * 3 + 1]!);
        b = Math.max(b, light[n * 3 + 2]!);
      }
    }
    out[i * 4] = Math.min(255, Math.round(r * 255));
    out[i * 4 + 1] = Math.min(255, Math.round(g * 255));
    out[i * 4 + 2] = Math.min(255, Math.round(b * 255));
    out[i * 4 + 3] = 255;
  }
  return out;
};

// 点光：发光格按 16 米分堆（亮度加总、位置按亮度加权），按 堆亮 / (1 + 距离/32)² 取前 N 堆
const pickPointLights = (grid: LightGrid, center: readonly number[], count: number) => {
  const { W, H, D, min, emit } = grid;
  const bucketM = 16;
  const piles = new Map<string, { sum: number; x: number; y: number; z: number; c: [number, number, number] }>();
  for (let z = 0; z < D; z++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (z * H + y) * W + x;
        const s = emit[i * 3]! + emit[i * 3 + 1]! + emit[i * 3 + 2]!;
        if (!s) continue;
        const px = min[0] + (x + 0.5) * cellM, py = min[1] + (y + 0.5) * cellM, pz = min[2] + (z + 0.5) * cellM;
        const k = `${Math.floor(px / bucketM)}|${Math.floor(py / bucketM)}|${Math.floor(pz / bucketM)}`;
        const p = piles.get(k) ?? { sum: 0, x: 0, y: 0, z: 0, c: [0, 0, 0] };
        p.sum += s;
        p.x += px * s;
        p.y += py * s;
        p.z += pz * s;
        for (let c = 0; c < 3; c++) p.c[c] += emit[i * 3 + c]!;
        piles.set(k, p);
      }
  const all = [...piles.values()].map((p) => {
    const pos: [number, number, number] = [p.x / p.sum, p.y / p.sum, p.z / p.sum];
    const d = Math.hypot(pos[0] - center[0]!, pos[1] - center[1]!, pos[2] - center[2]!);
    const peak = Math.max(...p.c);
    return { pos, color: p.c.map((v) => v / peak) as [number, number, number], score: p.sum / (1 + d / 32) ** 2 };
  });
  return all.sort((a, b) => b.score - a.score).slice(0, count);
};

// 体素材质打补丁：片元在算光之前取光体加进自发光。只在开了试看、mode = volume 时打一次
const uniforms = {
  lightVol: { value: null as THREE.Data3DTexture | null },
  lightVolView: { value: new THREE.Matrix4() },
  lightVolMin: { value: new THREE.Vector3() },
  lightVolSize: { value: new THREE.Vector3(1, 1, 1) },
  lightVolK: { value: 0 },
};
const fragHead = 'uniform highp sampler3D lightVol;\nuniform mat4 lightVolView;\nuniform vec3 lightVolMin;\nuniform vec3 lightVolSize;\nuniform float lightVolK;';
const fragLight = `{
  vec3 lvP = (lightVolView * vec4(-vViewPosition, 1.0)).xyz;
  vec3 lvN = normalize(mat3(lightVolView) * normal);
  vec3 lvUvw = (lvP + lvN * ${(cellM / 2).toFixed(1)} - lightVolMin) / lightVolSize;
  vec3 lvEdge = min(lvUvw, 1.0 - lvUvw);
  if (lightVolK > 0.0 && min(lvEdge.x, min(lvEdge.y, lvEdge.z)) > 0.0)
    totalEmissiveRadiance += diffuseColor.rgb * texture(lightVol, lvUvw).rgb * lightVolK * vCol.a * smoothstep(0.0, 0.08, min(lvEdge.x, lvEdge.y));
}
#include <lights_fragment_begin>`;
let patched = false;
const patchVoxelMaterials = () => {
  if (patched) return;
  patched = true;
  for (const kind of ['实心', '镂空', '实心树叶', '水', '花草'] as const) {
    const m = voxelMaterial(kind);
    const orig = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      orig.call(m, sh, r);
      Object.assign(sh.uniforms, uniforms);
      const before = sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${fragHead}`).replace('#include <lights_fragment_begin>', fragLight);
      if (sh.fragmentShader === before || !sh.fragmentShader.includes('lightVolView *')) throw new Error('下界光照：体素材质接不上光体');
    };
    const key = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = () => `${key()}-光体`;
    m.needsUpdate = true;
  }
};

/** 开了试看 下界光 时：建光体或点光。放在 真下界 的组里（组的局部坐标 = 区段的场景坐标） */
export const NetherLightTrial: React.FC<{ t: ImportedTerrain | null; cameraPos: readonly number[]; zTop: number; groupRef: React.RefObject<THREE.Group | null> }> = ({ t, cameraPos, zTop, groupRef }) => {
  const p = useMemo(() => netherLightTrial() ?? {}, []);
  const mode = p.mode ?? 'volume';
  if (mode === 'volume') patchVoxelMaterials();
  const camera = useThree((s) => s.camera);
  const [handle] = useState(() => delayRender('下界光照：建光'));
  const [points, setPoints] = useState<ReturnType<typeof pickPointLights>>([]);
  const [center] = useState(() => [...cameraPos]);
  useEffect(() => {
    if (!t) return;
    readGrid(t, center, p.radius ?? 200, zTop)
      .then((grid) => {
        if (mode === 'points') setPoints(pickPointLights(grid, center, p.count ?? 8));
        else {
          const tex = new THREE.Data3DTexture(floodFill(grid, p.decay ?? 0.8), grid.W, grid.H, grid.D);
          tex.format = THREE.RGBAFormat;
          tex.type = THREE.UnsignedByteType;
          tex.minFilter = tex.magFilter = THREE.LinearFilter;
          tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
          tex.unpackAlignment = 1;
          tex.needsUpdate = true;
          uniforms.lightVol.value = tex;
          uniforms.lightVolMin.value.set(...grid.min);
          uniforms.lightVolSize.value.set(grid.W * cellM, grid.H * cellM, grid.D * cellM);
          uniforms.lightVolK.value = p.strength ?? 2;
        }
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [t, center, mode, p, zTop, handle]);
  useFrame(() => {
    const group = groupRef.current;
    if (!group || mode !== 'volume') return;
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    uniforms.lightVolView.value.copy(group.matrixWorld).invert().multiply(camera.matrixWorld);
  });
  if (mode !== 'points') return null;
  // 衰减按物理平方（8 米处照度 ≈ strength × 100 / 64 / π ≈ 1，和底光同量级），48 米外截掉
  return (
    <>
      {points.map((l, i) => (
        <pointLight key={i} position={l.pos} color={new THREE.Color(...l.color)} intensity={(p.strength ?? 2) * 100} distance={48} decay={2} />
      ))}
    </>
  );
};
