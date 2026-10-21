// 古城4x 布局的坐标类型和换算：脚底格、方块、羊毛条目 → 场景坐标。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { G4 } from '../../古城4x.tsx';
export type BlockPos = [number, number, number];
export type PlanePoint = [number, number]; // 游戏 [x, z]

// 脚底格 → 脚底（场景，格的中心）
export const footOf = ([x, y, z]: BlockPos): V3 => G4(x + 0.5, y, z + 0.5);
// 方块 → 底面中心（场景）
export const blockBottomCenter = ([x, y, z]: BlockPos): V3 => G4(x + 0.5, y, z + 0.5);
export const cellCenter = ([x, y, z]: BlockPos): V3 => G4(x + 0.5, y + 0.5, z + 0.5);
// 羊毛条目 [x, 站立面 y, z] → 羊毛方块底面中心（= 古城戏.ts 的 woolAt）；站在它上面的脚底（= onWool）
export const woolBlockAt = ([x, t, z]: BlockPos): V3 => G4(x + 0.5, t, z + 0.5);
export const feetOnWool = (wool: BlockPos): V3 => {
  const blockBase = woolBlockAt(wool);
  return [blockBase[0], blockBase[1], blockBase[2] + 1];
};
