// 方块碎块的面（纯模块，不引 react、three）：网格碎块.py 导出的格子数据、六个方向的面、一张面怎么写进顶点缓冲、缺面怎么补、染色怎么取。
// 方块飞溅.tsx、灾变震地.tsx 拿这里的缓冲建 three 几何（`toGeo`）。
import type { V3 } from '../../engine/core/坐标.ts';

export type DebrisFace = number[]; // [u0, v0, u1, v1, r, g, b]
// cells：盒子里的格子是碎块；ring 的是盒子外扩一圈、留在原地的完整方块（洞壁）。hide：场景网格里要藏掉的范围（每个盒子一个，外扩以后的）。
// lining：旧格式的洞壁面片（只补一张面），新导出的数据没有（整块六面都画，见 工具/游戏取材/网格碎块.py）
export type DebrisData = {
  atlas: number[];
  cells: { box: number; p: number[]; faces: Record<string, DebrisFace>; ring?: boolean; size?: number[]; off?: number[] }[];
  hide?: number[][];
  lining?: { p: number[]; d: string; f: DebrisFace }[];
};

const LIN = (v: number) => Math.pow(v / 255, 2.2);
export const DIRS: Record<string, { n: V3; u: V3; v: V3 }> = {
  // 每个方向的面：法线、贴图 u 方向、贴图 v 方向（v 朝下）
  '+x': { n: [1, 0, 0], u: [0, -1, 0], v: [0, 0, -1] },
  '-x': { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
  '+y': { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  '-y': { n: [0, -1, 0], u: [-1, 0, 0], v: [0, 0, -1] },
  '+z': { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  '-z': { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
};
const OPP: Record<string, string> = { '+x': '-x', '-x': '+x', '+y': '-y', '-y': '+y', '+z': '-z', '-z': '+z' };

export type FaceBuffer = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
export const newBuf = (): FaceBuffer => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
// 一张面：中心 c、半边长 h、方向 d、贴图 f。
// 绕向：±z 这两面按 `DIRS` 的 u、v 排出来是顺时针，材质两面都画，从外面看是「背面」，three 把法线翻过来算光，顶面被照成底面那么暗、底面反之。`fix` 时这两面倒过来排。
// 第 1 场几段的画面是按原来的样子定的，不给 `fix` 就照旧；6-4-3 在暗处仰拍底面，发亮很扎眼，传 `fix`
export const face = (buf: FaceBuffer, center: number[], half: number, dir: string, faceData: DebrisFace, fix = false) => {
  const { n: normal, u: uAxis, v: vAxis } = DIRS[dir];
  const base = buf.pos.length / 3;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const [u0, v0, u1, v1] = faceData;
  for (const [cornerU, bb] of corners) {
    buf.pos.push(center[0] + normal[0] * half + uAxis[0] * half * cornerU + vAxis[0] * half * bb, center[1] + normal[1] * half + uAxis[1] * half * cornerU + vAxis[1] * half * bb, center[2] + normal[2] * half + uAxis[2] * half * cornerU + vAxis[2] * half * bb);
    buf.nor.push(...normal);
    buf.uv.push(cornerU < 0 ? u0 : u1, bb < 0 ? v0 : v1);
    buf.col.push(LIN(faceData[4]), LIN(faceData[5]), LIN(faceData[6]));
  }
  if (fix && (dir === '+z' || dir === '-z')) buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
};
// 一格方块的六个面都要有贴图，缺的面用这一格已有的面补：侧面缺了用别的侧面（先对面），顶 / 底缺了用顶 / 底，再不行用侧面。
// 颜色按游戏的面朝向亮度重算（上 1.0、南北 0.8、东西 0.6、下 0.5）：导出的顶点色带环境光遮蔽，整块拿出来当碎块、洞壁会发黑（用户 10-02 指出雪怪洞窟撞穿洞顶时有深色方块）。
// 染色按贴图（uv 区域）在整份碎块数据里取：这张贴图所有面的颜色 ÷ 朝向亮度，取最亮的（只在一格里取不够：推出来的实心里层六面抄的都是洞顶朝下那面）
const SIDES = ['+x', '-x', '+y', '-y'];
const SHADE: Record<string, number> = { '+z': 1, '-z': 0.5, '+y': 0.8, '-y': 0.8, '+x': 0.6, '-x': 0.6 };
export const texKey = (f: DebrisFace) => f.slice(0, 4).join(',');
const tintCache = new WeakMap<DebrisData, Map<string, number[]>>();
export const tintsOf = (data: DebrisData) => {
  let tint = tintCache.get(data);
  if (!tint) {
    tint = new Map();
    for (const cell of data.cells)
      for (const [dir, faceData] of Object.entries(cell.faces)) {
        const t = [faceData[4], faceData[5], faceData[6]].map((v) => Math.min(255, v / SHADE[dir]));
        const old = tint.get(texKey(faceData));
        if (!old || t[0] + t[1] + t[2] > old[0] + old[1] + old[2]) tint.set(texKey(faceData), t);
      }
    tintCache.set(data, tint);
  }
  return tint;
};
export const fullFaces = (faces: Record<string, DebrisFace>, tint: Map<string, number[]>) => {
  const any = Object.values(faces)[0];
  const side = SIDES.map((d) => faces[d]).find(Boolean);
  const cap = faces['+z'] ?? faces['-z'];
  const pick = Object.fromEntries(
    Object.keys(DIRS).map((d) => [d, faces[d] ?? (d === '+z' || d === '-z' ? faces[OPP[d]] ?? side : faces[OPP[d]] ?? side ?? cap) ?? any]),
  ) as Record<string, DebrisFace>;
  return Object.fromEntries(
    Object.entries(pick).map(([dir, faceData]) => {
      const t = tint.get(texKey(faceData)) ?? [faceData[4], faceData[5], faceData[6]];
      return [dir, [faceData[0], faceData[1], faceData[2], faceData[3], ...t.map((v) => Math.min(255, v * SHADE[dir]))]];
    }),
  ) as Record<string, DebrisFace>;
};
