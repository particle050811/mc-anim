// 头像核对：娘化亚波伦的方形大头照，几种背景和机位，一秒一个方案（视图.ts）。只出静帧给粉丝当头像，不进成片。
import { checkSeg } from '@engine/段/核对段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { aspect, plans } from './视图.ts';

export default checkSeg({ sec: plans.length, aspect, terrain: [realNetherPack] });
