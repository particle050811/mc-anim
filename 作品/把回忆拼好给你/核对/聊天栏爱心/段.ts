// 聊天栏和驯服爱心的核对：按视图表一秒一个视图出静帧，看两行的顺序、颜色、淡出，和爱心的大小、高度。
import { defineSeg } from '@engine/段/段定义.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: pageWidth, height: pageHeight, terrain: [] });
