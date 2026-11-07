// 远景取样的任务（给 mcai 的 `/mcai far`、`/mcai landmarks`，格式见 sourcing/mod/src/main/java/mcai/FarTerrain.java、FarLandmarks.java）：
// 范围 = 预生成的矩形块（导入的范围）外包框外扩 远景.外扩 米，对齐到 2048（用户 11-06 定暮色超远景「现导入范围外扩 10 km」）；
// 粗层 32 米一点铺满范围；中层 16 米、细带 8 米只铺交界外 远景.中宽、远景.细宽 米以内的块（整块落在一个导入矩形里的不铺，那里用导入的地形）。
// 按 z 切成几份（--分），一份一个服务端命令，中途停了只重跑没完的那份。
import type { 世界声明 } from '../声明.ts';

type 矩形 = [number, number, number, number]; // 方块 [x0, z0, x1, z1]
export type 远景层任务 = { 名: '粗' | '中' | '细'; step: number; 块边: number; 块: [number, number][] };
export type 远景任务 = { 维度: string; 线程: number; 出: string; 层: 远景层任务[] };
export const 粗块边 = 2048;

export const 导入矩形 = (w: 世界声明): 矩形[] =>
  w.预生成.块
    .filter((k) => k.形状 === '矩形')
    .map((k) => (k.两角 ? k.两角 : [k.中心![0] - k.半边![0], k.中心![1] - k.半边![1], k.中心![0] + k.半边![0], k.中心![1] + k.半边![1]]));

export const 远景范围 = (w: 世界声明): 矩形 => {
  if (!w.远景) throw new Error(`世界 ${w.名称} 没写 [远景]`);
  const rs = 导入矩形(w);
  const 外 = w.远景.外扩;
  const 齐下 = (v: number) => Math.floor(v / 粗块边) * 粗块边, 齐上 = (v: number) => Math.ceil(v / 粗块边) * 粗块边;
  return [齐下(Math.min(...rs.map((r) => r[0])) - 外), 齐下(Math.min(...rs.map((r) => r[1])) - 外), 齐上(Math.max(...rs.map((r) => r[2])) + 外), 齐上(Math.max(...rs.map((r) => r[3])) + 外)];
};

const 到矩形距离 = (x0: number, z0: number, x1: number, z1: number, r: 矩形) => Math.hypot(Math.max(r[0] - x1, x0 - r[2], 0), Math.max(r[1] - z1, z0 - r[3], 0));

export const 远景层们 = (w: 世界声明): 远景层任务[] => {
  const [X0, Z0, X1, Z1] = 远景范围(w);
  const rs = 导入矩形(w);
  const 铺 = (边: number, 宽: number) => {
    const out: [number, number][] = [];
    for (let z = Z0; z < Z1; z += 边)
      for (let x = X0; x < X1; x += 边) {
        const d = Math.min(...rs.map((r) => 到矩形距离(x, z, x + 边, z + 边, r)));
        const 在里面 = rs.some((r) => r[0] <= x && x + 边 <= r[2] && r[1] <= z && z + 边 <= r[3]);
        if (宽 === Infinity || (d <= 宽 && !在里面)) out.push([x, z]);
      }
    return out;
  };
  return [
    { 名: '粗', step: 32, 块边: 粗块边, 块: 铺(粗块边, Infinity) },
    { 名: '中', step: 16, 块边: 512, 块: 铺(512, w.远景!.中宽) },
    { 名: '细', step: 8, 块边: 256, 块: 铺(256, w.远景!.细宽) },
  ];
};

/** 一层要生成的区块（点所在的区块，去重） */
export const 区块数 = (层们: 远景层任务[]) => {
  const s = new Set<number>();
  for (const l of 层们) {
    const n = l.块边 / l.step + 1;
    for (const [x0, z0] of l.块) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s.add((((x0 + i * l.step) >> 4) + 32768) * 65536 + (((z0 + j * l.step) >> 4) + 32768));
  }
  return s.size;
};

/** 按块的 z 切成 份 份（各层同一条线切），出前缀 <出>.<编号> */
export const 切任务 = (w: 世界声明, 出: string, 份: number, 线程 = 8): 远景任务[] => {
  const [, Z0, , Z1] = 远景范围(w);
  const 层们 = 远景层们(w);
  const 线 = Array.from({ length: 份 + 1 }, (_, k) => Z0 + Math.round(((Z1 - Z0) / 粗块边) * (k / 份)) * 粗块边);
  return Array.from({ length: 份 }, (_, k) => ({
    维度: w.维度,
    线程,
    出: 份 === 1 ? 出 : `${出}.${k + 1}`,
    层: 层们.map((l) => ({ ...l, 块: l.块.filter(([, z]) => z >= 线[k] && z < 线[k + 1]) })),
  }));
};
