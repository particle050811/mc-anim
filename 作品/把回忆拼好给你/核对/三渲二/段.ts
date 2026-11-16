// 三渲二核对：平涂、正交像素机位、透视机位、描边、整片后期、色板，在隐世之境一楼和魔法酒狐上一秒一个视图地比（engine/三渲二/）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
