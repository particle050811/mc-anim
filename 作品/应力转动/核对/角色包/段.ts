// 角色包核对：李樱、九胡（库/角色/）和旧项目同姿势、同机位逐像素比，一秒一个视图（视图.ts）。
import { checkSeg } from '@engine/段/核对段.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default checkSeg({ sec: views.length, aspect: { width: pageWidth, height: pageHeight } });
