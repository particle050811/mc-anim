// 6-2-5、6-2-6 和第 3 场（边城、下坠）共用的主世界地形：正式主世界 主世界-116 导入的地形为主、导入范围外用远景兜底（lib/体素/主世界地形.ts），
// 城址整平、竖井和古城的范围挖掉（模型/场景/边城地基.ts）。
// 各段用同一份改动（同一个缓存键）：竖井那一块在砸穿以前盖在城的石半砖地面下面，看不见，不必分砸没砸穿。
// 挖掉、平整 在模块加载时算一次（导入地形要各帧同一个数组）；竖井中心是 6-3 物理轨迹的撞击点所在那一格。
import { useOverworldTerrain } from '../../../../engine/voxel/主世界地形.ts';
import { borderTownFlatten, shaftCutouts } from '../../边城地基.ts';
import { overworldPackName, gameToScene } from '../../主世界116.ts';
import { shaftCellCenter, shaftHalfWidth } from './编排.ts';

const shaftCutout = shaftCutouts(shaftCellCenter(), shaftHalfWidth - 0.5);
const townFlatten = borderTownFlatten();

export const useFallTerrain = () => {
  const t = useOverworldTerrain(overworldPackName, `${overworldPackName}-远景`, shaftCutout, townFlatten, '边城整平');
  if (!t) return null;
  // 编排按 主世界116.ts 写死的包原点算航线和城址，导入包换了原点要一起改
  const importOrigin = t.位置([0, 0, 0]);
  const sceneOrigin = gameToScene([0, 0, 0]);
  if (importOrigin.some((v, i) => v !== sceneOrigin[i])) throw new Error(`下坠地形：导入包 ${overworldPackName} 的原点和 主世界116.ts 的 主世界原点 对不上`);
  return t;
};
