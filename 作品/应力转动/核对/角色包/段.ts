// 角色包核对：李樱、九胡（库/角色/）和旧项目同姿势、同机位逐像素比，一秒一个视图（视图.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { views, pageWidth, pageHeight } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: pageWidth, 高: pageHeight, 地形: [] });
