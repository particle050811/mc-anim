// 地表采样的结果和接口：体素世界（lib/体素/世界.tsx）按列取地面高度，给 选区段 算镜头到区段的距离。
// 采样(x, y, o)：x、y 是场景坐标（米，Z 朝上、北 = +Y），把结果写进 o（不分配新对象，几十万次调用要快）：
//   z：地面高度（导入的地形是粗高度图里最高那块方块的顶）；crown：地物顶高出 z 多少（导入的地形都给 0）。
export type Surface = { z: number; crown: number };
export type TerrainSampler = (x: number, y: number, out: Surface) => void;
export const newSurface = (): Surface => ({ z: 0, crown: 0 });
