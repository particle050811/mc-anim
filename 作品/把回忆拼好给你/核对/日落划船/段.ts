// 日落划船核对：第 4 句（场/2-海上）几帧静帧，第 0 帧是第 8 句第二张照片（日落划船）要的干净帧。按视图表一秒一个视图，不带声音、歌词。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
