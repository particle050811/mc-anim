// 远景取样的任务（给 mcai 的 `/mcai far`、`/mcai landmarks`，格式见 sourcing/mod/src/main/java/mcai/FarTerrain.java、FarLandmarks.java）：
// 范围 = 预生成的矩形块（导入的范围）外包框外扩 远景.外扩 米，对齐到 2048（用户 11-06 定暮色超远景「现导入范围外扩 10 km」）；
// 粗层 32 米一点铺满范围；中层 16 米、细带 8 米只铺交界外 远景.中宽、远景.细宽 米以内的块（整块落在一个导入矩形里的不铺，那里用导入的地形）。
// 按 z 切成几份（--parts），一份一个服务端命令，中途停了只重跑没完的那份。
import type { WorldDecl } from '../声明.ts';

type Rect = [number, number, number, number]; // 方块 [x0, z0, x1, z1]
export type DistantLayerTask = { 名: '粗' | '中' | '细'; step: number; 块边: number; 块: [number, number][] };
export type DistantTask = { 维度: string; threads: number; 出: string; 层: DistantLayerTask[] };
export const coarseTileEdge = 2048;

export const importRects = (w: WorldDecl): Rect[] =>
  w.预生成.块
    .filter((k) => k.形状 === '矩形')
    .map((k) => (k.两角 ? k.两角 : [k.中心![0] - k.半边![0], k.中心![1] - k.半边![1], k.中心![0] + k.半边![0], k.中心![1] + k.半边![1]]));

export const distantRange = (w: WorldDecl): Rect => {
  if (!w.远景) throw new Error(`世界 ${w.名称} 没写 [远景]`);
  const rs = importRects(w);
  const outerExpand = w.远景.外扩;
  const alignDown = (v: number) => Math.floor(v / coarseTileEdge) * coarseTileEdge, alignUp = (v: number) => Math.ceil(v / coarseTileEdge) * coarseTileEdge;
  return [alignDown(Math.min(...rs.map((r) => r[0])) - outerExpand), alignDown(Math.min(...rs.map((r) => r[1])) - outerExpand), alignUp(Math.max(...rs.map((r) => r[2])) + outerExpand), alignUp(Math.max(...rs.map((r) => r[3])) + outerExpand)];
};

const distToRect = (x0: number, z0: number, x1: number, z1: number, r: Rect) => Math.hypot(Math.max(r[0] - x1, x0 - r[2], 0), Math.max(r[1] - z1, z0 - r[3], 0));

export const distantLayers = (w: WorldDecl): DistantLayerTask[] => {
  const [X0, Z0, X1, Z1] = distantRange(w);
  const rs = importRects(w);
  const tiles = (step: number, width: number) => {
    const out: [number, number][] = [];
    for (let z = Z0; z < Z1; z += step)
      for (let x = X0; x < X1; x += step) {
        const d = Math.min(...rs.map((r) => distToRect(x, z, x + step, z + step, r)));
        const inside = rs.some((r) => r[0] <= x && x + step <= r[2] && r[1] <= z && z + step <= r[3]);
        if (width === Infinity || (d <= width && !inside)) out.push([x, z]);
      }
    return out;
  };
  return [
    { 名: '粗', step: 32, 块边: coarseTileEdge, 块: tiles(coarseTileEdge, Infinity) },
    { 名: '中', step: 16, 块边: 512, 块: tiles(512, w.远景!.中宽) },
    { 名: '细', step: 8, 块边: 256, 块: tiles(256, w.远景!.细宽) },
  ];
};

/** 一层要生成的区块（点所在的区块，去重） */
export const countChunks = (layers: DistantLayerTask[]) => {
  const s = new Set<number>();
  for (const l of layers) {
    const n = l.块边 / l.step + 1;
    for (const [x0, z0] of l.块) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s.add((((x0 + i * l.step) >> 4) + 32768) * 65536 + (((z0 + j * l.step) >> 4) + 32768));
  }
  return s.size;
};

/** 按块的 z 切成 份 份（各层同一条线切），出前缀 <出>.<编号> */
export const splitTasks = (w: WorldDecl, outBase: string, parts: number, threads = 8): DistantTask[] => {
  const [, Z0, , Z1] = distantRange(w);
  const layers = distantLayers(w);
  const zCuts = Array.from({ length: parts + 1 }, (_, k) => Z0 + Math.round(((Z1 - Z0) / coarseTileEdge) * (k / parts)) * coarseTileEdge);
  return Array.from({ length: parts }, (_, k) => ({
    维度: w.维度,
    threads,
    出: parts === 1 ? outBase : `${outBase}.${k + 1}`,
    层: layers.map((l) => ({ ...l, 块: l.块.filter(([, z]) => z >= zCuts[k] && z < zCuts[k + 1]) })),
  }));
};
