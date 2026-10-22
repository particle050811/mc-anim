// 魔法酒狐表情核对：一帧一个视图，看五种表情、眨眼几个时刻、尾巴一个周期（库/角色/魔法酒狐动作.ts）。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
