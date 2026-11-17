// 隐世之境一楼核对：网格从游戏截图的同一机位画出来，和截图并排、叠加，核方块、贴图、灯笼蜡烛的位置；按视图表一秒一个视图。
import { checkSeg } from '@engine/段/核对段.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default checkSeg({ sec: views.length, aspect: { width: pageWidth, height: pageHeight } });
