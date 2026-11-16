// 门口核对：一秒一个视图（视图.ts），看门口机位的构图、樱花树五截、箱子和门开合、太阳月亮、分屏右边的取景。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
