// 边城地面和古城的高度（竖井从城的地面打到古城洞顶，再落到古城地面）。
import { borderTownPos } from '../../../主世界116.ts';
import { shaftLayout as 竖井4x } from '../../../古城4x/布局.ts';

// ---------- 地面、古城 ----------
export const groundZ = borderTownPos[2] + 0.5; // 边城地面（石半砖）的顶面
// 古城接口：竖井打在古城中心往东 10 格的一列，场景里竖井中心对准撞击点，古城深度按城的地面量；竖井和古城相对城的位置不变（用户 10-05）。
// 数和由来见 ../../古城4x布局.ts 的 `shaftLayout`；坑和竖井网格是 ../竖井4x.网格.*（工具/游戏取材/挖竖井.py 世界=4x）
export const ancientCity = {
  shaftColumn: 竖井4x.列, // 片场存档的游戏 x, z（这一格的中心是 -709.5, 240.5）
  caveCeilingDepth: 竖井4x.洞顶深, // 洞顶最下面那层方块（被打穿）的底面在城的地面顶面下多深
  groundDepth: 竖井4x.地面深, // 古城地面（站人的那个面）在城的地面顶面下多深
};
export const caveCeilingZ = borderTownPos[2] - ancientCity.caveCeilingDepth; // 穹顶的底面（场景 z）
export const ancientCityFloorZ = borderTownPos[2] - ancientCity.groundDepth;
