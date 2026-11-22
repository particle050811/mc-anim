// 7-回城报告 的地形视图：段内秒就是 7-4-3 的秒（报告.tsx）
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { reportTerrainView } from '../../场/7-收场/7-4-3/地形视图.ts';
import seg from './段.ts';

export default defineTerrainView({ width: seg.width, height: seg.height, at: reportTerrainView });
