// 照片底片核对：全片六张照片（照片墙夏天四张、第 11 句合照、15 尾新合照）的干净帧，一帧一张（视图.ts）。assets/tools/照片底片.py 渲它、裁正方形、登记成资产。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
