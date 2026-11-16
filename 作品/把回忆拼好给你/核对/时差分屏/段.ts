// 时差分屏核对：一秒一个视图（视图.ts），看第 13 句分屏那一帧（场/2-门口/时差分屏.tsx）的定稿和对比。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
