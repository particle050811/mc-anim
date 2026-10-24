// 三渲二核对：平涂、正交像素机位、透视机位、描边、整片后期、色板，在隐世之境一楼和魔法酒狐上一帧一个视图地比（engine/三渲二/）。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
