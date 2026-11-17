// 核对-亚波伦表演：亚波伦的施法姿势（角色/动作/亚波伦演出.ts）和战斗界面（界面/战斗界面.tsx），一秒一个视图（视图.ts）。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect, views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
