// 安息仪式核对：仪式结构、12 件祭品、仪式过程和召唤过渡的几个时刻（两个时长方案），一秒一个视图（视图.ts）。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
