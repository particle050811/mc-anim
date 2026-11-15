// 核对-亚波伦表演：亚波伦的施法姿势（角色/动作/亚波伦演出.ts）和战斗界面（界面/战斗界面.tsx），一秒一个视图（视图.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
