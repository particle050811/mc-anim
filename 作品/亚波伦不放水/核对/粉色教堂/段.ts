// 粉色教堂核对：粉色婚礼教堂的网格（作品/亚波伦不放水/地点/粉色教堂.tsx）摆几个机位看导出对不对、比例够不够，一秒一个视图。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, views } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length, width: aspect.width, height: aspect.height, terrain: [] });
