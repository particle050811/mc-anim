// 照片底片核对：全片六张照片（照片墙夏天四张、第 11 句合照、15 尾新合照）的干净帧，一帧一张（视图.ts）。assets/tools/照片底片.py 渲它、裁正方形、登记成资产。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { filmViews } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: filmViews.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
