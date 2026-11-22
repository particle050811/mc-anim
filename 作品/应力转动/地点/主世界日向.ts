// 主世界太阳方向：纯模块，地形视图（加载计划）不用拉进 主世界光照.tsx 的大气组件
// 正西、仰角 20°（用户 10-15 定）：6-2-5 航线一路往西，太阳在前方、画面上方，逆光，影子朝镜头拉长
export const SUN_OW: [number, number, number] = [-0.94, 0, 0.342];
// 太阳投影用的光向（单位向量，体素地形的投影网格和日光要同一个，见 lib/飞行镜头.tsx 的 `OverworldSunLight`）
const sunLen = Math.hypot(...SUN_OW);
export const SUN_OW_DIR: [number, number, number] = [SUN_OW[0] / sunLen, SUN_OW[1] / sunLen, SUN_OW[2] / sunLen];
