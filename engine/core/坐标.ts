// 坐标换算的正本（10-30 整体优化方案 0.6）：新代码一律从这里 import。旧代码里的 toThree、fromGame 一类副本原样不动，登记在 docs/副本表.tsv。
//
// 三套坐标，单位都是格（1 格 = 1 米）：
// - 游戏：Minecraft 世界坐标，x 东、y 上、z 南（右手系）。方块 (x, y, z) 占 [x, x+1) × [y, y+1) × [z, z+1)。朝向 yaw 0 = 朝南，90 = 朝西；pitch 正 = 低头。
// - 场景：段、场、地点里写的坐标，Z 朝上右手系：x 东、y 北、z 上（同 Blender）。和游戏差一个原点 (ox, oy, oz)：
//     场景 = (游戏x − ox, oz − 游戏z, 游戏y − oy)；原点由地形包（包.json 的 原点）或地点定，engine/voxel/区段包.ts 文件头有同一套写法。
// - three：three.js 的世界坐标，Y 朝上右手系：three = (场景x, 场景z, −场景y)。不带原点时 three 坐标和游戏坐标是同一套轴。
//   场景内容也可以整组放进 rotation [−π/2, 0, 0] 的 group，组里直接写场景坐标（engine/三渲二/机位.tsx 文件头）。
//
// 副本差别：toThree 的 16 份都是 (x, z, −y)，参数有 V3 和 number[] 两种；engine/voxel/方块网格.tsx 的 fromGame、6-3-2 的 toScene/toGame 不带原点，
// 带原点的（gameToScene、cityFromGame、toGame…）把原点写死在各自文件里。
//
// 纯模块（只有类型 import）：段.ts、时间线.ts、末态.ts 和它们引的编排也能用（那些文件的闭包里不许有 three）。
// 要 three 对象的（toThree 的正本 场景到three，给 Vector3）在 three换算.ts；要 three 轴的数组用不带原点的 场景到游戏（库/界面/投影.ts 的 Z朝上转three）。
import type { V3 } from '../model/parts.tsx';

/** 游戏或场景的原点：游戏坐标 (ox, oy, oz) 落在场景 (0, 0, 0) */
export type 原点 = readonly [number, number, number];
const 零: 原点 = [0, 0, 0];

/** three → 场景（three 的 Vector3 或任何带 x、y、z 的对象） */
export const three到场景 = (v: { x: number; y: number; z: number }): V3 => [v.x, -v.z, v.y];

/** 游戏 → 场景（连续坐标；fromGame 带原点的版本） */
export const 游戏到场景 = (g: readonly number[], o: 原点 = 零): V3 => [g[0]! - o[0], o[2] - g[2]!, g[1]! - o[1]];

/** 场景 → 游戏 */
export const 场景到游戏 = (s: readonly number[], o: 原点 = 零): V3 => [s[0]! + o[0], s[2]! + o[1], o[2] - s[1]!];

/** 游戏方块 → 它占的那一格在场景里的最小角（整数格号；同 区段包 的约定：场景 y 朝北，所以是 oz − 1 − z） */
export const 方块到场景格 = ([x, y, z]: readonly number[], o: 原点 = 零): V3 => [x! - o[0], o[2] - 1 - z!, y! - o[1]];

/** 场景格号 → 游戏方块 */
export const 场景格到方块 = ([i, j, k]: readonly number[], o: 原点 = 零): V3 => [i! + o[0], k! + o[1], o[2] - 1 - j!];

/** 游戏方块的中心在场景里的位置 */
export const 方块中心 = (b: readonly number[], o: 原点 = 零): V3 => {
  const [i, j, k] = 方块到场景格(b, o);
  return [i + 0.5, j + 0.5, k + 0.5];
};

/**
 * 游戏的视线方向（yaw、pitch，度）→ 场景里的单位向量。原版 Entity.calculateViewVector：
 * 游戏向量 = (−sin yaw · cos pitch, −sin pitch, cos yaw · cos pitch)，再按上面的轴换到场景。
 */
export const 游戏朝向到场景 = (yaw: number, pitch: number): V3 => {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const g = [-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
  return [g[0]!, -g[2]!, g[1]!];
};

/** 场景里的方向 → 游戏 yaw、pitch（度，yaw 在 (−180, 180]）。方向不用是单位向量；竖直朝上、朝下时 yaw 给 0 */
export const 场景到游戏朝向 = (d: readonly number[]): { yaw: number; pitch: number } => {
  const [gx, gy, gz] = [d[0]!, d[2]!, -d[1]!];
  const 水平 = Math.hypot(gx, gz);
  const pitch = (-Math.atan2(gy, 水平) * 180) / Math.PI;
  const yaw = 水平 < 1e-12 ? 0 : (Math.atan2(-gx, gz) * 180) / Math.PI;
  return { yaw: yaw === -180 ? 180 : yaw, pitch };
};
