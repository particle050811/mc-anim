// 远处地标的预生成小块：/mcai landmarks 列出来的地标（暮色自己的选地标规则 + 结构自己的 generate，FarLandmarks.java）里，
// 外包框不全在导入范围里、离镜头飞的框不超过 视距 的，按外包框外扩 1 个区块排成区块表，给另一个新存档预生成、烘成补充包
// （用户 11-06「补的时候不要把超远景里面的地标建筑漏了」）。终焉城堡的外包框有一边拉到 3 km 外（结构件的框，不是看得见的城堡），按中心 ±256 米截。
import type { WorldDecl } from '../声明.ts';
import { importRects } from './任务.ts';

export type Landmark = { 结构: string; 地标: string; x: number; z: number; 区块x: number; 区块z: number; 群系: string; 生成: boolean; 范围?: [number, number, number, number, number, number] };
type Rect = [number, number, number, number];
const clipHalfWidth = 256;
const padChunks = 1;

export const distantLandmarks = (w: WorldDecl, colList: Landmark[], shotBox: Rect, viewDistance: number) => {
  const rs = importRects(w);
  const inImported = (x: number, z: number) => rs.some((r) => r[0] <= x && x <= r[2] && r[1] <= z && z <= r[3]);
  const distToBox = (x: number, z: number) => Math.hypot(Math.max(shotBox[0] - x, x - shotBox[2], 0), Math.max(shotBox[1] - z, z - shotBox[3], 0));
  const picked = colList
    .filter((o) => o.生成 && o.范围)
    .map((o) => {
      const [x0, , z0, x1, , z1] = o.范围!;
      const rect: Rect = [Math.max(x0, o.x - clipHalfWidth), Math.max(z0, o.z - clipHalfWidth), Math.min(x1, o.x + clipHalfWidth), Math.min(z1, o.z + clipHalfWidth)];
      return { ...o, 框: rect, 离: Math.round(distToBox(o.x, o.z)) };
    })
    .filter((o) => !(inImported(o.框[0], o.框[1]) && inImported(o.框[2], o.框[1]) && inImported(o.框[0], o.框[3]) && inImported(o.框[2], o.框[3])))
    .filter((o) => o.离 <= viewDistance)
    .sort((a, b) => a.离 - b.离);
  const chunkMap = new Map<string, [number, number]>();
  for (const o of picked)
    for (let cx = (o.框[0] >> 4) - padChunks; cx <= (o.框[2] >> 4) + padChunks; cx++)
      for (let cz = (o.框[1] >> 4) - padChunks; cz <= (o.框[3] >> 4) + padChunks; cz++) chunkMap.set(`${cx},${cz}`, [cx, cz]);
  // Chunky 的 csv 图案按列表顺序生成，按 z、x 排，相邻的区块挨着生成
  const sortedChunks = [...chunkMap.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { 地标: picked, 区块: sortedChunks };
};
