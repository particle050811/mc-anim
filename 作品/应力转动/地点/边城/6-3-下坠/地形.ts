// 6-2-5、6-2-6 和第 3 场（边城、下坠）共用的主世界地形：正式主世界 主世界-116 导入的地形为主、导入范围外用远景兜底（lib/体素/主世界地形.ts），
// 城址整平、竖井和古城的范围挖掉（模型/场景/边城地基.ts）。
// 各段用同一份改动（同一个缓存键）：竖井那一块在砸穿以前盖在城的石半砖地面下面，看不见，不必分砸没砸穿。
// 挖掉、平整 在模块加载时算一次（导入地形要各帧同一个数组）；竖井中心是 6-3 物理轨迹的撞击点所在那一格。
import { useOverworldTerrain } from '@engine/voxel/主世界地形.ts';
import { borderTownFlatten, shaftCutouts } from '../../边城地基.ts';
import { overworldPackName, gameToScene } from '../../主世界116.ts';
import { shaftCellCenter, shaftHalfWidth } from './编排.ts';
import { fallTerrainWorld } from './地形世界.ts';

const shaftCutout = shaftCutouts(shaftCellCenter(), shaftHalfWidth - 0.5);
const townFlatten = borderTownFlatten();
// 地形改动.ts 只登记了整平罩（anim check 核它落在主世界-116 的保真范围里，可见变换不碰那些区段），竖井、古城挖框要落在罩的外框里
for (const b of shaftCutout) {
  const f = townFlatten[0]!;
  if (b.from[0] < f.x0 || b.from[2] < f.z0 || b.to[0] >= f.x0 + f.nx || b.to[2] >= f.z0 + f.nz) throw new Error(`下坠地形：挖框 ${JSON.stringify(b)} 出了边城整平罩的外框，挖开会露出可见变换换过的格：要在 地形改动.ts 登记、世界声明加保真、重烘`);
}

export const useFallTerrain = () => {
  const t = useOverworldTerrain(fallTerrainWorld.pack, fallTerrainWorld.distant, shaftCutout, townFlatten, '边城整平');
  if (!t) return null;
  // 编排按 主世界116.ts 写死的包原点算航线和城址，导入包换了原点要一起改
  const importOrigin = t.位置([0, 0, 0]);
  const sceneOrigin = gameToScene([0, 0, 0]);
  if (importOrigin.some((v, i) => v !== sceneOrigin[i])) throw new Error(`下坠地形：导入包 ${overworldPackName} 的原点和 主世界116.ts 的 主世界原点 对不上`);
  return t;
};
