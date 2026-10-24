// 一张照片：名字和一张现成的图（engine/model/贴图.ts 的 png() 解出来的像素）。照片墙、地图画按它收；纯模块（不 import react、three）。
// 图是登记成资产的真帧（特效/照片画.ts 的四张、特效/合照.ts），import 'asset:…' 拿到 data URI 再 png() 解。地图画居中裁正方形，所以给正方形最省事。
import type { Png } from '@engine/model/贴图.ts';

export type 照片图 = { 名: string; 图: Png };
/** 照片墙一格里放的照片（同 照片图） */
export type 照片源 = 照片图;
