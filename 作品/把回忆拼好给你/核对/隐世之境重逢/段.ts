// 隐世之境重逢核对：第 15 句 49.96 你站在门口往屋里看（封面帧）的布景、她的站位、门光，按视图表一秒一个视图。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
