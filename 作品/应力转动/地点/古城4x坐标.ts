// 古城4x 的坐标换算（G4、toGame4）和不靠网格量的几处定点（结构范围、传送门、落点、穹顶）：纯数，不带网格资产、react、three。
// 坐标约定、原点出处见 古城4x.tsx 文件头。编排、布局要坐标就从这里引，不用把 古城4x.tsx（四十几块网格的头、顶点、图集）拖进闭包；古城4x.tsx 原样转出。
// 从网格头里量出来的（箱子、尖啸体、感测体的位置，各块范围）还在 古城4x.tsx。
import type { V3 } from '@engine/core/坐标.ts';

/** 场景原点 = 游戏 (-720, -50, 240) */
export const ORIGIN: V3 = [-720, -50, 240];
// 游戏坐标 → 场景坐标（和 古城.tsx 的 G 一样）。照 engine/voxel/方块网格.tsx 的 fromGame 原样写 −(z − oz)，
// 不用 坐标.ts 的 gameToScene（它是 oz − z，z 正好在原点上时差一个负零，会改到下游 atan2 一类的结果）
export const G4 = (x: number, y: number, z: number): V3 => [x - ORIGIN[0], -(z - ORIGIN[2]), y - ORIGIN[1]];
// 场景坐标 → 游戏坐标
export const toGame4 = ([x, y, z]: number[]): V3 => [x + ORIGIN[0], z + ORIGIN[1], ORIGIN[2] - y];

/** 古城4x.tsx 的 `GUCHENG4X` 里不靠网格量的那几项 */
export const GUCHENG4X_LANDMARKS = {
  // 结构的件（不含地形适配外扩的 12 格，游戏坐标）
  structureBox: { from: [-1162, -52, -200], to: [-294, -22, 676] },
  // 传送门、落点、穹顶：城心和老城同一位置（古城.tsx 的 `GUCHENG`）。新世界城心那列洞顶低一格（y -6），落点净空 44 格
  portal: { x: 0.5, y: [-11.5, 10.5], z: [15, 23] },
  landingPos: G4(-709.5, -50, 240.5),
  dome: G4(-709.5, -6, 240.5),
};
