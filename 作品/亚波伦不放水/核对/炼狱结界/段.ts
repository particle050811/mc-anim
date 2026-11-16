// 炼狱结界核对：原版线框（正面、几个转角、淡入中途）和本片的演法（飞出、罩住史蒂夫、收缩焚烧），一秒一个视图（视图.ts）。没有声音。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
