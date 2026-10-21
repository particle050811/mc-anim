// 6-4-3 挡箭三段的编排：输入全局帧 g（时间线.ts），输出这一帧的人、箭、风、碎块和机位。纯函数。站位、箭的路线、剧情时刻在 几何.ts。
// 机位都对着片场存档的方块核对过（机位那一格和周围 0.3 格是空气、视线不被挡；逐帧核对见 工具/挡箭/机位.ts）。
// - 6-4-3a 风矢：A1 南边看李樱弯腰翻箱子（用户 10-12：箭射出后他才发现）；A2 黄叛右前方推近，弓前风扇虚影转起来、风道炸开；
//   A3 黄叛左边 6 米垂直箭路，慢放 1/120，箭穿风扇、在风道里加速飞出画面。
// - 6-4-3b 挡箭：一个镜头到底（用户 10-10），跟拍箭从传送门沿大道往西扎，弹开点前 7 米起时钟按对数慢下来，镜头让到弹开点正南 9 米，
//   看李樱拔刀把箭往上挑飞，镜头不跟（「箭矢被弹飞 不用给特写」）；挥刀破空声化成振动飞向周围的幽匿感测体。
// - 6-4-3c 挑飞：镜头留在李樱和黄叛这边（用户 10-10 删了追箭仰拍洞顶那镜）。C1 李樱右侧身，C2 黄叛愣住，C3 李樱身后看东边，末帧接 6-4-5。
// 各部分在 编排/ 下：公用、李樱、追兵（黄叛、刘心忠）、风、箭、碎块、幽匿、机位；本文件转出它们，另给场上已垫的羊毛。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { placedWoolThrough } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { allWool, woolBlockAt } from '../../../../world/地点/古城4x/布局.ts';
import { soundChain } from './编排/幽匿.ts';

export { storySecAt } from './编排/公用.ts';
// 6-4-1、6-4-2 一路垫到 C 的羊毛
export const WOOL_NAMES = placedWoolThrough('C');
// 同一批羊毛的方块底面中心（场景坐标；6-4-4、6-4-5 用）
export const WOOL: V3[] = WOOL_NAMES.map((n) => woolBlockAt(allWool[n]));

export { openChest, rummageFacing, swingTurnDeg, liying, makeLiying, type 李樱演法 } from './编排/李樱.ts';
export { huangpan, liuxinzhong } from './编排/追兵.ts';
export { fanFadeSec, fanStopSec, fanRpm, fanVisibility, fanState, airflow } from './编排/风.ts';
export { arrowAt, critParticles } from './编排/箭.ts';
export { DEBRIS_HIDE, holeWalls, rockLandSec, debrisBursts } from './编排/碎块.ts';
export { sensors, vibrations, sensorStates, HIDE } from './编排/幽匿.ts';
// shriek 要在本文件声明成 const：经 export { } from 转出的话，别处 `if (choreo.shriek)` 收窄不掉 null
export const shriek = soundChain.shriek;
export { bowCloseupCams, camera } from './编排/机位.ts';
