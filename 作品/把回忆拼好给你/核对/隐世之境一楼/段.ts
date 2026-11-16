// 隐世之境一楼核对：网格从游戏截图的同一机位画出来，和截图并排、叠加，核方块、贴图、灯笼蜡烛的位置；按视图表一秒一个视图。
import { defineSeg } from '@engine/段/段定义.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: pageWidth, height: pageHeight, terrain: [] });
