// 封面帧核对：第 15 句 49.96 你站在门口、她回头认出你这一刻的封面（场/2-隐世之境/对视.tsx：成片画幅、B 站封面、抖音竖版封面）和片里这一帧的对照，按视图表一秒一个视图。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
