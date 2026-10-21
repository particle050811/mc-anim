// 砸出的坑和竖井的摆放：井心取整到格心，城的地面挖掉竖井网格那一块。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import shaftMesh资产 from 'asset:网格/竖井4x/头';
import { groundZ } from './地面.ts';
import { liYingShaft } from './李樱.ts';
const shaftMesh = shaftMesh资产 as unknown as any; // 迁移：类型待补

// ---------- 坑、竖井的画法参数 ----------
// 井心：撞击点所在那格的格心。坑和竖井网格要和城的石半砖地面、主世界方块对齐，所以取整到格心（锤的落点离井轴不到半格，看不出）
export const shaftCellCenter = (): V3 => {
  const center = liYingShaft().center;
  return [Math.floor(center[0]) + 0.5, Math.floor(center[1]) + 0.5, groundZ];
};
// 城的地面挖掉竖井网格那一块（网格自己带着坑口一圈城的石半砖地面），城的局部坐标
export const shaftHalfWidth = (shaftMesh.to[0] - shaftMesh.from[0] + 1) / 2; // 11.5：导出范围井心 ±11 格
export const crater = () => {
  const center = shaftCellCenter();
  const town = [center[0] - borderTownPos[0], center[1] - borderTownPos[1]];
  return { center: center, holeRect: [town[0] - shaftHalfWidth, town[1] - shaftHalfWidth, town[0] + shaftHalfWidth, town[1] + shaftHalfWidth] };
};
