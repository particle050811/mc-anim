// 7-起疑 的地形视图：书房室内，画面里没有体素世界（段.ts 声明了主世界，加载计划是空的）
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import seg from './段.ts';

export default defineTerrainView({ width: seg.width, height: seg.height, at: () => [] });
