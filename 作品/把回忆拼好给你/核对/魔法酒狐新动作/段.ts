// 魔法酒狐新动作核对：一秒一个视图，看新表情（认出你、哈气）、新姿势（站、坐门口、蹲、抱膝坐、张望、哈气）、手里的月铃兰。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
