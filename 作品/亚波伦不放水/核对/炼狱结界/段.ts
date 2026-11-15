// 炼狱结界核对：原版线框（正面、几个转角、淡入中途）和本片的演法（飞出、罩住史蒂夫、收缩焚烧），一秒一个视图（视图.ts）。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
