// 古城4x 6-4-3 射箭（射3′）的箱子、感测体、尖啸体、三人站位，以及幽匿重长后在片场补放的剧情方块。
import { feetOnWool, footOf, type BlockPos } from './换算.ts';
// 射3 不成立，改「射3′」（黄叛还在城心传送门上，李樱换成 #210）。
// 6-4-2 第一次警告是李樱开箱的振动、6-4-3 第二次是挥刀的振动（../6-4-2/编排.ts、../6-4-3/编排.ts 的振动链），所以开的箱子 8 格内要有感测体、感测体 8 格内要有尖啸体。
// 00-说明.md 的三条都不满足；全城 401 只箱子里 180 只满足振动链，对这 180 只从城心传送门一带打箭路（0.5 格粗、五条线），只有 #210 通：
// 黄叛站传送门框底梁上（脚底格 (−720, −34, 235)，强化深板岩，比城地面高 16 格），李樱在西头兵营 #210 北边（羊毛垫在 (−1087, −47, 194)，z 小一格 = 北），箭路 370 米顺东西大道，从场子北墙头上方 12 米掠过。
// 羊毛垫在箱子西边会挡箱子到感测体的振动，所以垫北边；挥刀点到感测体 6.2 米。叙事：二人从竖井落进城心内院，跳上门框瞭望，一眼望到西头开箱的李樱。

// ---------- 剧情补块（10-13，城底下铺成深暗之域以后）----------
// ---------- 射箭 ----------
export const archery = {
  chest: [-1087, -47, 195] as BlockPos, // #210（量测.json 的箱子号），兵营（structures/barracks）里贴东墙，头顶净空 33 格
  liYingWool: [-1087, -47, 194] as BlockPos, // 箱子北边一格（z 小一格 = 北；垫在西边会挡住箱子→感测体的振动，核过）；箱子在他脚边、和羊毛一样高（同老 C）
  sculkSensor: [-1092, -47, 191] as BlockPos, // 离箱子 6.4 米、离挥刀点 6.2 米：6-4-2 开箱、6-4-3 挥刀都是它收
  sculkShrieker: [-1091, -47, 191] as BlockPos, // 紧挨感测体（1 刻）：第一、二次警告都是它叫
  shriekerWest: [-1098, -47, 189] as BlockPos, // （G3 加）感测体西边 6.3 米的另一个尖啸体：6-4-3 挥刀那次 6 刻后也收到，已在警告冷却里，不叫
  huangPanFootCell: [-720, -34, 235] as BlockPos, // 传送门框底梁（强化深板岩 y −35）上，框里是空的；比古城地面高 16 格、比李樱高 12 格
  aimHeight: 1.3, // 瞄李樱脚底以上 1.3 格（老 6-4-3 是 1.0：这里瞄低了会擦到他身后兵营东墙的台阶，1.3～1.5 都通）
  liuXinzhongFootCell: [-727, -41, 234] as BlockPos, // 传送门西边那一阶高台，6-4-3 刘心忠在这里看
};
export const chestArchery = { chestId: 210, block: archery.chest }; // 射箭.箱子 的箱子号：6-4-2 李樱开的那只
export const liYingDeflectFeet = feetOnWool(archery.liYingWool);
export const huangPanArcheryFeet = footOf(archery.huangPanFootCell);
export const liuXinzhongArcheryFeet = footOf(archery.liuXinzhongFootCell);
// 李樱开箱时面朝南（箱子在他南边一格；#210 锁扣朝西，存档读的，见 6-4-1/古城画面.tsx 的 chests4x），箭从他左手边（东偏南 6°）来
