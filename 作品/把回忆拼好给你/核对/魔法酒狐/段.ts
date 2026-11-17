// 魔法酒狐核对：模型挂上来，按视图表一秒一个视图出静帧，和 jar 里的贴图、游戏截图比。
import { checkSeg } from '@engine/段/核对段.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default checkSeg({ sec: views.length, aspect: { width: pageWidth, height: pageHeight } });
