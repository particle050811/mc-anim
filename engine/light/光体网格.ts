// 方块网格（engine/voxel/方块网格.tsx）的光体格码：网格只有面，没有方块表，从面反推哪些格挡光、哪些格发光。纯函数。
// 挡光：实心层（solid，不含双面画的实体）里贴在整数格面上的面，盖满的那几格整格算方块（面朝 +轴 在 P 处，方块在 [P − 1, P]）。
// 墙里面没露面的格当空气也没关系：四周都是挡光格，光进不去。楼梯、半砖贴在格面上的那一面也算整格（光体粗一点）；灯笼、蜡烛、玻璃（镂空层）不挡。
// 发光：网格的 markers（方块 id → 方块底面中心，游戏坐标减 origin）里，glow 给出亮度的（不给照方块发光表 engine/voxel/方块发光.ts）。
import { blockGlow } from '../voxel/方块发光.ts';
import type { BlockMeshInfo } from '../voxel/方块网格信息.ts';
import { CODE_OPAQUE, glowColor, type LayerCodes } from './光体.ts';

/** 方块 id、它的 marker（游戏坐标减 origin，方块底面中心）→ 发多亮（0～1，0 不发光） */
export type MeshGlow = (id: string, marker: readonly number[]) => number;

// 窗口往外留的格数：着色器在窗口边上往外渐变到 0（光体组件.tsx 的 blendM），整个网格都要在渐变区里面
const pad = 10;

export const meshLightCodes = (info: BlockMeshInfo, data: Uint8Array, glow: MeshGlow = (id) => blockGlow(id)): LayerCodes => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const stride = info.vertexBytes;
  // 场景坐标（同 方块网格.tsx 的 fromGame：[x, −z, y]）
  const at = (layerOffset: number, v: number, out: number[]) => {
    const o = layerOffset + v * stride;
    out[0] = view.getFloat32(o, true);
    out[1] = -view.getFloat32(o + 8, true);
    out[2] = view.getFloat32(o + 4, true);
  };
  const solid = info.layers.filter((l) => l.name === 'solid' && !l.doubleSide);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (const l of solid)
    for (let v = 0; v < l.quads * 4; v++) {
      at(l.byteOffset, v, p);
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, p[a]!);
        hi[a] = Math.max(hi[a]!, p[a]!);
      }
    }
  if (!Number.isFinite(lo[0])) throw new Error('光体网格：网格里没有实心层的面');
  const x0 = Math.floor(lo[0]!) - pad, y0 = Math.floor(lo[1]!) - pad, z0 = Math.floor(lo[2]!) - 2;
  const W = Math.ceil(hi[0]!) + pad - x0, H = Math.ceil(hi[1]!) + pad - y0, D = Math.ceil(hi[2]!) + 2 - z0;
  const codes = new Uint8Array(W * H * D);
  const mark = (x: number, y: number, z: number, code: number) => {
    const cx = x - x0, cy = y - y0, cz = z - z0;
    if (cx < 0 || cy < 0 || cz < 0 || cx >= W || cy >= H || cz >= D) return;
    codes[(cz * H + cy) * W + cx] = code;
  };
  const q = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const eps = 1e-3;
  for (const l of solid)
    for (let f = 0; f < l.quads; f++) {
      for (let k = 0; k < 4; k++) at(l.byteOffset, f * 4 + k, q[k]!);
      const mn = [0, 1, 2].map((a) => Math.min(...q.map((v) => v[a]!))), mx = [0, 1, 2].map((a) => Math.max(...q.map((v) => v[a]!)));
      const axis = [0, 1, 2].find((a) => mx[a]! - mn[a]! < eps);
      if (axis === undefined) continue;
      const P = Math.round(mn[axis]!);
      if (Math.abs(mn[axis]! - P) > eps) continue;
      // 面法线（同 方块网格.tsx：(v1 − v0) × (v3 − v0)）在这一轴上的正负
      const [a1, a2] = [(axis + 1) % 3, (axis + 2) % 3];
      const u = [q[1]![a1]! - q[0]![a1]!, q[1]![a2]! - q[0]![a2]!], w = [q[3]![a1]! - q[0]![a1]!, q[3]![a2]! - q[0]![a2]!];
      const sign = Math.sign(u[0]! * w[1]! - u[1]! * w[0]!);
      if (!sign) continue;
      const c = sign > 0 ? P - 1 : P;
      for (let i = Math.ceil(mn[a1]! - eps); i + 1 <= mx[a1]! + eps; i++)
        for (let j = Math.ceil(mn[a2]! - eps); j + 1 <= mx[a2]! + eps; j++) {
          const cell = [0, 0, 0];
          cell[axis] = c;
          cell[a1] = i;
          cell[a2] = j;
          mark(cell[0]!, cell[1]!, cell[2]!, CODE_OPAQUE);
        }
    }
  const colors: [number, number, number][] = [];
  const colorIndex = new Map<string, number>();
  for (const [id, markers] of Object.entries(info.markers))
    for (const m of markers) {
      const g = glow(id, m);
      if (!(g > 0)) continue;
      const c = glowColor(id).map((x) => x * g) as [number, number, number];
      const k = c.join(',');
      let idx = colorIndex.get(k);
      if (idx === undefined) colorIndex.set(k, (idx = colors.push(c) - 1));
      // marker 是方块底面中心：场景格 = floor([x, −z, y])
      mark(Math.floor(m[0]!), Math.floor(-m[2]!), Math.floor(m[1]!), idx + 2);
    }
  if (colors.length > 126) throw new Error('光体网格：发光色超过 126 种');
  return { w: { L: 0, x0, y0, z0, W, H, D }, codes, colors };
};
