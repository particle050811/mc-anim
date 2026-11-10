// 「地面上长出来」那类法术共用的小函数（纯）：水平方向、游戏偏航、绕目标摆位。场景坐标 Z 朝上；游戏坐标 x 东、y 上、z 南（= 场景 −y）。
import type { 点 } from '../接口.ts';

/** 游戏里 Mth.atan2(目标.z − 施法者.z, 目标.x − 施法者.x)：从施法者指向目标的水平角（弧度，游戏坐标） */
export const 游戏水平角 = (从: 点, 到: 点) => Math.atan2(-(到[1] - 从[1]), 到[0] - 从[0]);
/** 游戏水平角 f、距离 d → 场景里的水平偏移（游戏的 x += cos f × d、z += sin f × d） */
export const 沿角 = (f: number, d: number): readonly [number, number] => [Math.cos(f) * d, -Math.sin(f) * d];
/** 落到目标所在的地面上：x、y 给定，z 取目标脚底 */
export const 贴地 = (x: number, y: number, 地: 点): 点 => [x, y, 地[2]];
/** 实体朝施法者 → 目标方向时的 yRot（度）：Entity.setYRot(f × 180/π) 那种写法直接传 f；这里是 lookAt 式的（−atan2(dx, dz) 的游戏偏航） */
export const 游戏偏航度 = (从: 点, 到: 点) => (Math.atan2(-(到[0] - 从[0]), -(到[1] - 从[1])) * 180) / Math.PI;
