// 聊天栏和驯服爱心的核对：按视图表一秒一个视图出静帧，看两行的顺序、颜色、淡出，和爱心的大小、高度。
import { checkSeg } from '@engine/段/核对段.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default checkSeg({ sec: views.length, aspect: { width: pageWidth, height: pageHeight } });
