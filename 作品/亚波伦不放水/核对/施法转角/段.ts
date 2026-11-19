import { checkSeg } from '@engine/段/核对段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { reviewDuration } from './选角.ts';

export default checkSeg({ sec: reviewDuration, terrain: [realNetherPack] });
