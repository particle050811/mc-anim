// 魔法酒狐新动作核对：一秒一个视图，看新表情（认出你、哈气）、新姿势（站、坐门口、蹲、抱膝坐、张望、哈气）、手里的月铃兰。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
