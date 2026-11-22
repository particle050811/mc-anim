// 封面草稿的地形视图（engine/voxel/地形视图.ts）：只有远景方案（八稿扫）挂真下界，机位照 机位.ts 的 coverPose（画面.tsx 读同一份）
import { checkViewAt } from '@engine/段/核对段.ts';
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { coverPose, coverTerrain } from './机位.ts';
import { aspect, plans } from './视图.ts';

export default defineTerrainView({
  ...aspect,
  at: (sec) => {
    const v = checkViewAt(plans, sec);
    return coverTerrain(v, coverPose(v, aspect.width / aspect.height).cameraRig);
  },
});
