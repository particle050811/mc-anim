// 核对-真下界 的地形视图（engine/voxel/地形视图.ts）：每个视图都挂真下界，机位、光照那套照视图表。画面.tsx 读同一份
import { placeEyeCamera } from '@engine/core/three换算.ts';
import { checkViewAt } from '@engine/段/核对段.ts';
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { netherBrighter, netherVanilla, realNetherView } from '../../地点/真下界视图.ts';
import { aspect, views, type View } from './视图.ts';

export const lightTables = { 原版: netherVanilla, 提亮: netherBrighter };
/** CheckCamera 的参数 */
export const viewCamera = (v: View) => ({ eye: v.眼, target: v.看, fov: 70, far: 4096, aspect: aspect.width / aspect.height });

export default defineTerrainView({
  ...aspect,
  at: (sec) => {
    const v = checkViewAt(views, sec);
    return [realNetherView(v.眼, lightTables[v.光], (camera) => placeEyeCamera(camera, viewCamera(v)))];
  },
});
