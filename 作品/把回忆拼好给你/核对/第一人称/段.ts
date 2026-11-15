// 第一人称核对：一秒一个视图，看蛋糕拿着、挥手、换手和李樱的空手（库/角色/第一人称.tsx、库/角色/李樱第一人称.tsx）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
