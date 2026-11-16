// 方块网格 .json 说明的形状：方块网格.tsx 读它画、方块网格补面.ts 按它补面，单放一处，两边不互相引（方块网格.tsx 原样转出）。
export type BlockMeshInfo = {
  dim: string;
  from: number[];
  to: number[];
  origin: number[];
  vertexBytes: number;
  atlas: number[];
  // name：solid 实心 / cutout 镂空（树叶、玻璃）/ translucent 半透明（水、冰）/ plants 没有碰撞体积的方块（花草、蘑菇、火把，按镂空画）
  // doubleSide：两面都画（实体模型里不剔除背面的部分）
  layers: { name: string; doubleSide?: boolean; quads: number; byteOffset: number }[];
  // 方块 id → 方块底面中心的位置（游戏坐标减 origin）
  markers: Record<string, number[][]>;
  // 合并出来的大面用的贴图：[u0, v0, 宽, 高]（图集里 0~1）。顶点的贴图号 n>0 指第 n-1 张，这时 u v 是平铺的格数
  rects?: number[][];
  // 图集里每张贴图的名字和位置（rect 同 rects 的格式）；独立贴图（实体）多一个 crop：从贴图文件上抠下的像素 [x, y, 宽, 高]。较早导出的网格没有
  sprites?: { name: string; atlas?: string; crop?: number[]; rect: number[] }[];
  // 导出来源：实例、存档、维度、mesh 参数、模组版本、资源包。较早导出的网格没有
  取材?: Record<string, unknown>;
};
