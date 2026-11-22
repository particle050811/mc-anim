// 6-追进竖井 的地形视图（engine/voxel/地形视图.ts）：段内秒经 toSec 换成编排秒，同 追进竖井.tsx 的 PursuerSegment
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { pursuerTerrainView } from '../../地点/边城/6-3-8/地形视图.ts';
import { toSec } from '../../地点/边城/6-3-8/编排.ts';
import seg from './段.ts';

export default defineTerrainView({ width: seg.width, height: seg.height, at: (sec) => pursuerTerrainView(toSec('6-3-10', sec)) });
