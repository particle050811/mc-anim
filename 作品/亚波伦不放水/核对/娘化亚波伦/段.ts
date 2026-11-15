// 娘化亚波伦核对：中性底上摆 YSM 版娘化亚波伦（作品/亚波伦不放水/角色/娘化亚波伦.tsx），一秒一个视图，看外形、现成动作、贴图的差别和头发弹簧。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
