// 照片底片核对：全片六张照片（照片墙夏天四张、第 11 句合照、15 尾新合照）的干净帧，一帧一张（视图.ts）。assets/tools/照片底片.py 渲它、裁正方形、登记成资产。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { filmViews } from './视图.ts';

export default checkSeg({ sec: filmViews.length, aspect });
