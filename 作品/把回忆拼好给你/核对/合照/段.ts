// 合照核对：15 尾（场/2-隐世之境/合照.tsx）几帧静帧，第 0 帧是片尾新世界图标要的新合照（干净帧）。按视图表一秒一个视图，不带声音、歌词。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
