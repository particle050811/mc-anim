// 核对-施法转角 的地形视图（engine/voxel/地形视图.ts）：台地场总挂真下界，机位照 机位.ts 的 castTurnShot（画面.tsx 读同一份）
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { terraceTerrainView } from '../../场/1-台地/台地机位.ts';
import { castTurnShot } from './机位.ts';
import seg from './段.ts';

export default defineTerrainView({ width: seg.width, height: seg.height, at: (sec) => terraceTerrainView(castTurnShot(sec).rig) });
