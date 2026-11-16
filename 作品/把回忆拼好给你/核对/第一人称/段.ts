// 第一人称核对：一秒一个视图，看蛋糕拿着、挥手、换手和李樱的空手（库/角色/第一人称.tsx、库/角色/李樱第一人称.tsx）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
