// 边城里的两间屋（7-4-3 报告、7-4-4 起疑）：边城是参考模型库自己搭的（边城/布局.ts，殖民地蓝图的房子没有能拍的屋里），
// 所以这两间屋在片场存档副本「片场-第7章室内」主世界高空 y 180 起用原版方块搭，再用 mcai mesh 导出（游戏渲染器实际画出的面）。
// - 城门卫兵室（7-4-3，刘心忠写报告；用户 10-19 定：在城门边、窗外是城门和城墙）：外框游戏 x 40..48、z 0..5、y 180..186（屋里 7×4、4 格高，顶上一层石砖半砖）。
//   石砖墙、云杉木板地板和顶棚（两道去皮云杉原木梁）；东墙 3×2 玻璃板窗（z 1..3）、窗南边一扇云杉门（z 4），南墙一扇 2×2 小窗；
//   窗前两格云杉上半砖书桌（x 46、z 2..3），桌和窗之间朝东的楼梯椅（x 47、z 2：人背对窗、面朝西）；北墙一排展示框（盾三面、剑、弓、斧）、
//   墙下一排云杉栅栏当兵器架，西北角盔甲架（铁剑、盾），西墙箱子、三个木桶；顶棚挂灯笼、桌上一根蜡烛。
//   ./mcai mesh from=40,180,0 to=48,186,5 origin=40,181,0 'skip=*banner*' out=../参考模型库/src/模型/场景/城门卫兵室.网格
//   盔甲架身上的铁甲游戏里没画出来（数据里有），导出的盔甲架只有剑和盾。
// - 城主府书房（7-4-4，乔雷夫读报告）：外框 x 20..30、z 0..8、y 180..187（屋里 9×7、6 格高）。深色橡木墙；北墙 5×4 大玻璃窗；
//   窗前 3×2 深色橡木上半砖书桌（x 24..26、z 1..2），桌后朝北的楼梯椅（x 25、z 3：人面朝窗、背朝镜头）；南墙 x 27 一扇门（镜头背后）。
//   ./mcai mesh from=20,180,0 to=30,187,8 origin=20,181,0 'skip=*banner*' out=../参考模型库/src/模型/场景/城主府书房.网格
// 旗帜 skip 掉了：mesh 导出的旗帜是一整面纯白（染色没接住）。
// 网格本地坐标：导出原点在外框西北角那一列、地板顶面（y 181）：x = 游戏 x − 原点 x（往东）、y = −(游戏 z − 原点 z)（往北为正，屋子在 y ≤ 0）、z = 游戏 y − 181。
// 摆进边城（城局部坐标，原点城中心地面，北 = +Y；地面顶面 z = 0.5），位置查过 边城/布局.ts 搭出的房子、路灯，不穿插：
// - 卫兵室：北城门西门楼（x −20..−12、y 195..205）南边贴着墙根那条空地，外框 x −21..−12、y 189..195，地板和街面平；东窗朝城门大街，
//   东北边是城门拱、对面东门楼和城墙。
// - 城主府书房：中央广场南半边，外框 x −5..6、y −19..−10，地板顶面离地 6 格；北窗朝广场中央的传送石碑和对面的房子。
import React from 'react';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import guardRoomRaw from 'asset:网格/城门卫兵室/头';
import guardRoomBin from 'asset:网格/城门卫兵室/顶点';
import guardRoomAtlas from 'asset:网格/城门卫兵室/图集';
import lordStudyRaw from 'asset:网格/城主府书房/头';
import lordStudyBin from 'asset:网格/城主府书房/顶点';
import lordStudyAtlas from 'asset:网格/城主府书房/图集';

const guardRoomInfo = guardRoomRaw as unknown as BlockMeshInfo;
const lordStudyInfo = lordStudyRaw as unknown as BlockMeshInfo;

// 屋子在城里的摆放：网格原点（外框西北角、地板顶面）在城局部坐标的哪一点
export const guardRoom = {
  原点: [-21, 195, 0.5] as V3,
  // 屋里的东西（网格本地坐标；格 (x, y) 占 [x, x+1]×[y−1, y]，y 往南是负的）
  deskTopZ: 1, // 上半砖书桌的顶面
  desk: [6, -4, 7, -2] as [number, number, number, number], // 书桌 [x0, y0, x1, y1]
  chair: [7.5, -2.5, 0.5] as V3, // 楼梯椅子坐面中心（坐面高 0.5）
  窗: [8, -4, 9, -1] as [number, number, number, number], // 东窗玻璃板所在的那一列（窗高 z 1～3）
  门: [7.5, -4.5, 0] as V3, // 东墙的门口（门洞西边屋里那一格）
  灯笼: [4.5, -2.5, 3.4] as V3,
  candle: [6.5, -3.5, 1.3] as V3,
  屋里: [1, -5, 0, 8, -1, 4] as number[], // 屋里的空间 [x0, y0, z0, x1, y1, z1]
};
export const lordStudy = {
  原点: [-5, -10, 6.5] as V3,
  deskTopZ: 1,
  desk: [4, -3, 7, -1] as [number, number, number, number],
  chair: [5.5, -3.5, 0.5] as V3,
  窗: [3, -1, 8, 0] as [number, number, number, number], // 北窗（窗高 z 1～5）
  lanterns: [[2.5, -4.5, 4.5], [8.5, -4.5, 4.5]] as V3[],
  candle: [6.5, -1.5, 1.3] as V3,
  屋里: [1, -8, 0, 10, -1, 6] as number[],
};
// 网格本地坐标 → 城的局部坐标
export const toTownPoint = (room: { 原点: V3 }, p: number[]): V3 => [room.原点[0] + p[0], room.原点[1] + p[1], room.原点[2] + p[2]];

export const GuardRoomMesh: React.FC = () => <BlockMesh info={guardRoomInfo} bin={guardRoomBin} atlas={guardRoomAtlas} />;
export const LordStudyMesh: React.FC = () => <BlockMesh info={lordStudyInfo} bin={lordStudyBin} atlas={lordStudyAtlas} />;
