// 基岩动画核对：手抄版魔法酒狐（库/角色/魔法酒狐.tsx）和播放器版（定义生物 + jar 里原版动画文件）并排，一秒一个视图；
// 后面几帧是两种动画控制器（控制器示例.ts）并排。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
