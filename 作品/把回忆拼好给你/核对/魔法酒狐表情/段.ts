// 魔法酒狐表情核对：一秒一个视图，看五种表情、眨眼几个时刻、尾巴一个周期（库/角色/魔法酒狐动作.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
