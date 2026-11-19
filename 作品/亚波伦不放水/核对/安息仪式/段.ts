// 安息仪式核对：仪式结构、4 件祭品、仪式过程和召唤过渡的几个时刻（两个时长方案），一秒一个视图（视图.ts）。没有声音。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
