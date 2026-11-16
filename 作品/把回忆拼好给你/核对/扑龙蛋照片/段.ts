// 扑龙蛋照片核对：正片第 5 句 照片-扑龙蛋 那一帧，一秒一个视图（视图.ts）。第 0 帧出第 8 句照片的真帧（见 场/2-末地/镜头.tsx）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
