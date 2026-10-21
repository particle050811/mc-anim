// 第 7 章第 2 场「李樱撤离」两段（7-2-1 五万血、7-2-2至3 开到了传送）共用的地理。纯数据。
// 在放大 4 倍的新城（../古城4x布局.ts）：坐标只从布局文件取，这里只做换算和朝向。场景 (x, y, z) = (游戏 x + 720, 240 − 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y。
//
// 李樱在哪：6-4-5 他从 #210 往东南跳出兵营、出画，绕到「场子」西边一座房子的屋顶 V 上（`wool645`.V，开裂深板岩砖，离地 8 格），不演。
//   - 远望：V 上的羊毛（`lookoutFeet`，脚底 y −41），往东北偏东看 64 米外场子里的监守者（`wideShotCenter` = 监守者钻出），核对.py 核过眼睛到它头、胸的视线不挡。
//   - 战利品箱：V 西北偏西 20 米、地面上的 #240（`chest722`，游戏 (−953, −50, 228)，锁扣朝向从存档读）。他从 V 一跳落到箱子东边一格垫的羊毛 X 上（`wool722`.X，和箱子一样高，箱子在脚边），面朝西开箱。
//     这一跳 19.7 米、落差 8 格（强者跳：最高点比 V 高 3 格，再高头会碰到洞顶；1.26 秒，核过身子不撞）。
//   - 振动：#240 周围 8 格内三个感测体都收得到（X 不在连线上，核过），再传给尖啸体；离监守者 80 米（> 24 格），尖啸体照叫。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import { yawTo } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { cellCenter, blockBottomCenter, chest722, wideShotCenter as 布局远景中心, lookoutFeet, feetOnWool, wool722, sensors722, shriekers722, type BlockPos } from '../../../../world/地点/古城4x/布局.ts';

// ---------- 站的地方 ----------
export const roofFeet: V3 = lookoutFeet; // V 上的羊毛
export const chestFrontFeet: V3 = feetOnWool(wool722.X);
export const newWool = { X: wool722.X } as const;

// ---------- 箱子 ----------
export const chest = { id: chest722.号, block: chest722.block };
export const chestCenter: V3 = cellCenter(chest722.block);

// ---------- 感测体、尖啸体（游戏方块坐标，布局文件核过） ----------
export const sensors: BlockPos[] = sensors722;
export const shriekers: BlockPos[] = shriekers722;
export { cellCenter as 方块中心, blockBottomCenter as 方块底心 };

// ---------- 朝向（骨架 yaw，度：默认面朝 +Y、正 = 往左转） ----------
export const wideShotCenter: V3 = 布局远景中心;
export const lookoutYaw = yawTo(wideShotCenter[0] - roofFeet[0], wideShotCenter[1] - roofFeet[1]); // ≈ −71°（东北偏东）
export const leapToChestYaw = yawTo(chestFrontFeet[0] - roofFeet[0], chestFrontFeet[1] - roofFeet[1]); // ≈ 120°（西北偏西）
export const openChestYaw = yawTo(chestCenter[0] - chestFrontFeet[0], chestCenter[1] - chestFrontFeet[1]); // 90 = 面朝西（箱子在他正西）

// 火把方块 → TorchBlock 的 cell（场景坐标，那一格的最小角）
export const torchCellOf = ([x, y, z]: number[]): V3 => [x + 720, 239 - z, y + 50];
export const groundAt = (x: number, z: number): V3 => G4(x, -51, z);
