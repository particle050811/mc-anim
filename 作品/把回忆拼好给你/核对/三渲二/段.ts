// 三渲二核对：平涂、正交像素机位、透视机位、描边、整片后期、色板，在隐世之境一楼和魔法酒狐上一秒一个视图地比（engine/三渲二/）。
import { checkSeg } from '@engine/段/核对段.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default checkSeg({ sec: views.length, aspect });
