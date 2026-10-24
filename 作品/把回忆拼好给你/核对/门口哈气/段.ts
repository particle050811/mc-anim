// 门口哈气核对：第 8 句 27.80 那一帧（她挡在你身后冲苦力怕哈气），一帧一个视图（视图.ts），比描边开关、整片后期开关。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
