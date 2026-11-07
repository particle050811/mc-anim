// 远处地标的预生成小块：/mcai landmarks 列出来的地标（暮色自己的选地标规则 + 结构自己的 generate，FarLandmarks.java）里，
// 外包框不全在导入范围里、离镜头飞的框不超过 视距 的，按外包框外扩 1 个区块排成区块表，给另一个新存档预生成、烘成补充包
// （用户 11-06「补的时候不要把超远景里面的地标建筑漏了」）。终焉城堡的外包框有一边拉到 3 km 外（结构件的框，不是看得见的城堡），按中心 ±256 米截。
import type { 世界声明 } from '../声明.ts';
import { 导入矩形 } from './任务.ts';

export type 地标项 = { 结构: string; 地标: string; x: number; z: number; 区块x: number; 区块z: number; 群系: string; 生成: boolean; 范围?: [number, number, number, number, number, number] };
type 矩形 = [number, number, number, number];
const 截半宽 = 256;
const 外扩区块 = 1;

export const 远地标们 = (w: 世界声明, 列: 地标项[], 镜头框: 矩形, 视距: number) => {
  const rs = 导入矩形(w);
  const 在导入里 = (x: number, z: number) => rs.some((r) => r[0] <= x && x <= r[2] && r[1] <= z && z <= r[3]);
  const 离框 = (x: number, z: number) => Math.hypot(Math.max(镜头框[0] - x, x - 镜头框[2], 0), Math.max(镜头框[1] - z, z - 镜头框[3], 0));
  const 选中 = 列
    .filter((o) => o.生成 && o.范围)
    .map((o) => {
      const [x0, , z0, x1, , z1] = o.范围!;
      const 框: 矩形 = [Math.max(x0, o.x - 截半宽), Math.max(z0, o.z - 截半宽), Math.min(x1, o.x + 截半宽), Math.min(z1, o.z + 截半宽)];
      return { ...o, 框, 离: Math.round(离框(o.x, o.z)) };
    })
    .filter((o) => !(在导入里(o.框[0], o.框[1]) && 在导入里(o.框[2], o.框[1]) && 在导入里(o.框[0], o.框[3]) && 在导入里(o.框[2], o.框[3])))
    .filter((o) => o.离 <= 视距)
    .sort((a, b) => a.离 - b.离);
  const 区块 = new Map<string, [number, number]>();
  for (const o of 选中)
    for (let cx = (o.框[0] >> 4) - 外扩区块; cx <= (o.框[2] >> 4) + 外扩区块; cx++)
      for (let cz = (o.框[1] >> 4) - 外扩区块; cz <= (o.框[3] >> 4) + 外扩区块; cz++) 区块.set(`${cx},${cz}`, [cx, cz]);
  // Chunky 的 csv 图案按列表顺序生成，按 z、x 排，相邻的区块挨着生成
  const 列表 = [...区块.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { 地标: 选中, 区块: 列表 };
};
