// 正式主世界 主世界-116（种子 116，史诗地形 + 生成时修整）上 6-2-5、6-2-6、第 3 场共用的地点：航线、边城城址。
// 坐标两套：游戏坐标（x 朝东、z 朝南、y 朝上）；场景坐标是导入包 主世界-116 的（lib/体素/导入地形.ts 的 `位置`：X = x − ox，Y = oz − z，Z = y − oy），北 = +Y。
// 包原点在这里写死（编排是纯函数、模块加载时就要算航线），`useImportedTerrain` 取到包以后会核对，对不上就报错。
import type { V3 } from '@engine/model/parts.tsx';

export const overworldPackName = '主世界-116';
// 导入包的原点（航线中段），主世界 oy = 64：和 工具/游戏取材/主世界范围.py 的 PACK_ORIGIN 是同一个数，npm run 导入:主世界116 的 ORIGIN 从那里取
export const overworldOrigin: V3 = [24576, 64, -4096];
export const gameToScene = (g: number[]): V3 => [g[0] - overworldOrigin[0], overworldOrigin[2] - g[2], g[1] - overworldOrigin[1]];

// 航线（用户 10-05 定，游戏坐标 x、z）：从基地小岛出发，过转弯点，到边城中心。起点取基地（岛东南部，6-2-4 从这里的工坊起飞），不取岛中心：首帧扫帚正在基地上空往上窜。
export const routeGameXz = {
  base: [39740, -1130] as [number, number],
  turnPoint: [20438, -8567] as [number, number],
  borderTown: [8960, -5376] as [number, number],
};
export const gameXzToScene = (g: [number, number]): [number, number] => [g[0] - overworldOrigin[0], overworldOrigin[2] - g[1]];

// 边城城址：城中心 (8960, -5376)，城门朝北（北 = 游戏 −z），朝向不转。
// 地面高度按城址实测（读 主世界-116 列段，城墙外沿 490×410 格里每列最高的地面方块，不算草、花、树、积雪层、水）：中位数 y 73，整平到 y 73（顶面 y 74）挖填最少。
// 顶面 y 74 就是场景 z 10，第 3 场编排里的高度（悬停 2100、竖井、古城的深度）按城的地面 z 10 算。
export const borderTownGroundY = 73; // 整平以后地面最上一格方块的 y
export const borderTownPos: V3 = [...gameXzToScene(routeGameXz.borderTown), borderTownGroundY + 1 - overworldOrigin[1]] as V3; // 城的局部原点：城中心、地面顶面
