// 6-落地后 的地形视图：一镜到底画面那块画布（不开超远景），机位、航线照 机位.ts
import { defineTerrainView } from '@engine/voxel/地形视图.ts';
import { onerTerrainView } from '../../场/6-暮色森林/一镜到底/地形视图.ts';
import { afterLandingShot } from './机位.ts';
import seg from './段.ts';

const aspect = seg.width / seg.height;
export default defineTerrainView({ width: seg.width, height: seg.height, at: (sec, clock) => onerTerrainView({ ...afterLandingShot(sec), aspect, clock }) });
