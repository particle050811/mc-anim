// 2-开盘 的地形视图（engine/voxel/地形视图.ts）：台地场总挂真下界，机位照镜头表（机位.ts）
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { terraceTerrainView } from '../../场/1-台地/台地机位.ts';
import { actTwoShotAt } from './机位.ts';
import seg from './段.ts';

export default defineTerrainView({ width: seg.width, height: seg.height, at: (sec) => terraceTerrainView(actTwoShotAt(sec).cameraRig) });
