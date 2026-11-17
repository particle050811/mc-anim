// 隐世之境重逢核对：第 15 句 49.96 你站在门口往屋里看（封面帧）的布景、她的站位、门光，按视图表一秒一个视图。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
