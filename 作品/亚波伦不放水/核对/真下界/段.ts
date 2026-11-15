// 核对-真下界：导入的真实下界地形（区段包 下界-无结构-1110）用体素世界画出来什么样，给封面挑背景用（用户 11-10 定：不编假地形，导入真实的）。
// 一秒一个视图（视图.ts）：封面空中点和正片场地各几个方向，照原版的光和雾一组、提亮雾放远一组。只出静帧，没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [realNetherPack] });
