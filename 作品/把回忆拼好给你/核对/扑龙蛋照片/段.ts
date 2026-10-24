// 扑龙蛋照片核对：正片第 5 句 照片-扑龙蛋 那一帧，一帧一个视图（视图.ts）。第 0 帧出第 8 句照片的真帧（见 场/2-末地/镜头.tsx）。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
