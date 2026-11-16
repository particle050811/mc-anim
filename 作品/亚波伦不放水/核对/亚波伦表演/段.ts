// 核对-亚波伦表演：亚波伦的施法姿势（角色/动作/亚波伦演出.ts）和战斗界面（界面/战斗界面.tsx），一秒一个视图（视图.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
