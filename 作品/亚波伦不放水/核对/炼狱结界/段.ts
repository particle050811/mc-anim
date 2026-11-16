// 炼狱结界核对：原版线框（正面、几个转角、淡入中途）和本片的演法（飞出、罩住史蒂夫、收缩焚烧），一秒一个视图（视图.ts）。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
