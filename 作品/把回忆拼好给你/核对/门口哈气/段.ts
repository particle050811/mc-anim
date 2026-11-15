// 门口哈气核对：第 8 句 27.80 那一帧（她跨进门洞、挡在你和苦力怕中间冲它哈气），一秒一个视图（视图.ts），比整片后期开关、远景开关和几项要定的对照。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
