// 古城4x 6-4-6～6-4-8：场子的范围和墙，追兵两路强者跳，第三、四次尖啸，二人站位，监守者钻出点。
import { G4 } from '../../古城4x.tsx';
import type { BlockPos } from './换算.ts';
import { archery } from './射箭.ts';
export const arena = {
  范围: [-907, 214, -842, 246] as [number, number, number, number], // 游戏 x0, z0, x1, z1：四面羊毛墙里面那块
  floorFeetY: -51, // 幽匿块铺的地面（脚下方块 y −52）
  centerPlatform: [-882, 222, -870, 237] as [number, number, number, number], // 场子中间一座高台（#244 在台顶 y −44），7-1 绕着它跑、黄叛跳上去射
  northWall: { z: [207, 213] as [number, number], woolLaneZ: [[208, 209], [211, 212]] as [number, number][], wallTopFeetY: -45, woolSpanX: [-904, -864] as [number, number], gateX: [-876, -874] as [number, number] },
  westWallX: [-914, -909] as [number, number],
  eastWallX: [-839, -834] as [number, number],
};
// 追兵从传送门一路强者跳过来（不垫羊毛，落地发振动）；落进场子那一跳的振动 → 感测体 (−850, −51, 226) → 尖啸体 (−855, −51, 227)：第三次
//   （幽匿重长后是自然长的新一对，黄叛落地 2 刻到感测体、再 5 刻到尖啸体）
export const pursuerPath: BlockPos[] = [
  [-720, -34, 234], // 黄叛从传送门框底梁起跳
  [-756, -36, 225], // 大院西边一座高楼顶
  [-776, -44, 253],
  [-802, -50, 225], // 大道南边的巷子里（6-4-6 第一镜机位西边 16 米）
  [-834, -44, 237], // 场子东墙头
  [-852, -51, 226], // 越过东墙落进场子（第三次尖啸）
];
export const shrieks = {
  第一次: archery.尖啸体, // 6-4-2 开 #210
  第二次: archery.尖啸体, // 6-4-3 挥刀
  第三次: [-855, -51, 227] as BlockPos, // 6-4-6 追兵落进场子；收的是感测体 (−850, −51, 226)
  第三次感测体: [-850, -51, 226] as BlockPos,
  第四次: [-869, -51, 218] as BlockPos, // 6-4-7 刘心忠踩；收的是感测体 (−868, −51, 218)。这一对是 剧情补块
  第四次感测体: [-868, -51, 218] as BlockPos,
};
export const liuXinzhongStompPoint = G4(-864.5, -51, 219.5); // 离感测体 (−868, −51, 218) 3.8 米；踩完往西再走 1.2 米停到 刘心忠站位
// 6-4-8 / 6-4-9 / 7-1-1 开头的站位（场景）
export const wardenEmerge = G4(-873.5, -51, 217.5); // 第四次尖啸体西边 4.5 格（召唤落点 ±5 格内），F1 羊毛东南 6 米
export const liuXinzhongSpot = G4(-866.5, -51, 219.5);
export const huangPanSpot = G4(-864.5, -51, 223.5);
// ---- G4 补的（6-4-5～6-4-7，10-13）：两个追兵各走各的一路、6-4-7 刘心忠那一「踩」 ----
// 追兵路 是黄叛那一路（传送门框底梁起跳）。刘心忠从西边高台 `archery.刘心忠脚底格` 起跳，另走一路：先往南、再往西北，和黄叛在巷子里交叉，在巷子里落在他北边 4 格，
// 再一起蹿上东墙头。用户 10-18 定人跑跳 30 米/秒：一跳 23～40 米；离地取「水平速度 ≥ 28 米/秒里最高的、身子不撞的」（撞了就往下降，见 核对.py「6-4-6」），
// 落进场子那一跳从墙头往下扑、离地 2（跳得短，再低也快不了多少）。落点都不在别的感测体 8 格内（不然路上就叫了）。
export const pursuerApexHeights = [6, 2, 4.75, 2.5, 2]; // 黄叛：追兵路 每一跳
export const liuXinzhongPursuitPath: BlockPos[] = [
  archery.刘心忠脚底格,
  [-732, -46, 257],
  [-762, -51, 231],
  [-802, -50, 229],
  [-834, -44, 235], // 场子东墙头（黄叛落在它南边两格）
  [-853, -51, 224], // 越过东墙落进场子，在黄叛北边 2.2 格；比黄叛晚落地，振动先到的是黄叛那一下（第三次尖啸是黄叛踩出来的）
];
export const liuXinzhongApexHeights = [4.25, 7, 7, 2.5, 2];
export const liuXinzhongStartDelaySec = 0; // 两人同时起跳；他那一路先往南绕，落进场子比黄叛晚 0.3 秒
// 落进场子刹住站定的格（脚底格，平地）：黄叛往前滑 1 格、刘心忠 2 格。站着说话不走动：幽匿块上每步发振动，冷却一过会踩响别的尖啸体（(−860,−51,216) 就在他们和第四次那个之间），所以 6-4-7 刘心忠一跳扑过去、落地那一「踩」踩响第四次
export const pursuerStops = { 黄: [-853, -51, 226] as BlockPos, 刘: [-855, -51, 224] as BlockPos };
// 6-4-7：刘心忠从站定处往西一跳 11.2 米落在 `liuXinzhongStompPoint`（离地 7、1.32 秒），落地振动 3.2 米到第四次感测体；黄叛跟着一跳（10.4 米）落在 `huangPanLanding647`，
// 比刘心忠晚落地、在第四次尖啸之后（警告在冷却里），再往西走 0.6 米接 `handoffs.六四八首`
export const liuXinzhongStompApex = 7; // 黄叛跟的那一跳也是 7
export const huangPanLanding647 = G4(-862.74, -51, 223.5); // 脚底（格 (−863,−51,223) 里），离 衔接.六四八首.黄 0.56 米
