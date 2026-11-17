// 合照核对：15 尾（场/2-隐世之境/合照.tsx）几帧静帧，第 0 帧是片尾新世界图标要的新合照（干净帧）。按视图表一秒一个视图，不带声音、歌词。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
