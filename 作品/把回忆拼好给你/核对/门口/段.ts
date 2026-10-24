// 门口核对：一帧一个视图（视图.ts），看门口机位的构图、樱花树五截、箱子和门开合、太阳月亮、分屏右边的取景。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
