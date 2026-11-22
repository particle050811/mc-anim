// 头像核对的地形视图（engine/voxel/地形视图.ts）：只有下界的方案挂真下界。机位（她坐标里的眼、看的点搬到场地）和挂不挂地形，画面.tsx 读同一份
import { placeEyeCamera } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { checkViewAt } from '@engine/段/核对段.ts';
import { defineTerrainView, type TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { netherBrighter, netherCameraFar, realNetherView } from '../../地点/真下界视图.ts';
import { realNetherPick, realNetherScene } from '../../地点/真下界位置.ts';
import { aspect, plans, type AvatarPlan } from './视图.ts';

/** 下界方案她站的地方：熔岩海上空（封面远景的选点） */
export const netherVenuePos = realNetherScene(realNetherPick.x, realNetherPick.y, realNetherPick.z);

/** 她坐标里的一点 → 场景：绕 Z 转 (yaw − 180) 度，再挪到场地 */
const toScene = (p: V3, 位: V3, yaw: number): V3 => {
  const a = ((yaw - 180) * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [位[0] + c * p[0] - s * p[1], 位[1] + s * p[0] + c * p[1], 位[2] + p[2]];
};

/** 这个方案的 CheckCamera 参数，位 = 场地 */
export const avatarCamera = (v: AvatarPlan, 位: V3) => {
  const yaw = v.yaw ?? 180;
  return { eye: toScene(v.眼, 位, yaw), target: toScene(v.看, 位, yaw), fov: v.fov, far: v.venue === '下界' ? netherCameraFar(netherBrighter) : 512 };
};

/** 这个方案挂的体素地形：下界挂真下界，别的不挂 */
export const avatarTerrain = (v: AvatarPlan, camera: ReturnType<typeof avatarCamera>): TerrainCanvasView[] =>
  v.venue === '下界' ? [realNetherView(camera.eye, netherBrighter, (c) => placeEyeCamera(c, camera))] : [];

export default defineTerrainView({
  ...aspect,
  at: (sec) => {
    const v = checkViewAt(plans, sec);
    return avatarTerrain(v, avatarCamera(v, netherVenuePos));
  },
});
