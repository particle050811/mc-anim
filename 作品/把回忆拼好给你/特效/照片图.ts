// 照片的内容：一张像素画（照片画.ts，现在的占位），或一张现成的图（以后第 3、4、5、7 句渲出来的真帧）。照片.tsx 按它做贴图。
// 现成的图（主会话 10-24：照片组件要能直接吃一张图，按白边和比例贴上去）：16:9、宽是 64 的倍数的 8 位 RGBA PNG，
// 登记成资产后 import 'asset:…' 拿到 data URI，用 engine/model/贴图.ts 的 png() 解成像素：{ 名: '递蛋糕', 图: png(uri) }。
// 渲出来的帧先藏起界面、不带歌词，再按面积平均缩小：第 8 句举着看时画面 1.25 格宽（N = 16 是成片 320 像素），缩成 320×180 一个图像素正好一个成片像素。
// 白边和像素画一样按 相纸 的比例（64 宽的画面三边 2、下边 8），图宽 64k 时三边 2k、下边 8k；照片在场景里的大小只看 缩放，和图有多少像素无关。
// 纯模块（不 import react、three），测试能直接引。
import type { Png } from '@engine/model/贴图.ts';
import { 照片像素, 照片尺寸, 相纸, type 像素画 } from './照片画.ts';

export type 照片图 = { 名: string; 图: Png };
export type 照片源 = 像素画 | 照片图;

/** 像素画的画面宽（照片画.ts 的四张都是 64）：现成的图按它的倍数算白边 */
const 画面宽 = 64;
const 画面高 = 36;

const 倍数 = (源: 照片图) => {
  const k = 源.图.w / 画面宽;
  if (!Number.isInteger(k) || 源.图.h !== 画面高 * k) throw new Error(`照片「${源.名}」的图 ${源.图.w}×${源.图.h} 不是 16:9、宽 64 的倍数`);
  return k;
};

export const 是现成图 = (源: 照片源): 源 is 照片图 => '图' in 源;

/** 照片连白边多少像素，和其中一个像素占缩放 1 时的几分之一格（像素画 1/64，现成的图 1/(64k)） */
export const 源尺寸 = (源: 照片源): { 宽: number; 高: number; 每格像素: number } => {
  if (!是现成图(源)) return { ...照片尺寸(源), 每格像素: 画面宽 };
  const k = 倍数(源);
  return { 宽: 源.图.w + 2 * 相纸.边 * k, 高: 源.图.h + (相纸.边 + 相纸.下边) * k, 每格像素: 画面宽 * k };
};

/** 照片连白边的 RGBA 像素（从上往下一行行排） */
export const 源像素 = (源: 照片源): Uint8Array => {
  if (!是现成图(源)) return 照片像素(源);
  const k = 倍数(源);
  const { 宽, 高 } = 源尺寸(源);
  const out = new Uint8Array(宽 * 高 * 4);
  const 纸 = [1, 3, 5].map((i) => parseInt(相纸.色.slice(i, i + 2), 16));
  for (let p = 0; p < 宽 * 高; p++) out.set([纸[0]!, 纸[1]!, 纸[2]!, 255], p * 4);
  const 边 = 相纸.边 * k;
  for (let y = 0; y < 源.图.h; y++) {
    const 行 = 源.图.px.subarray(y * 源.图.w * 4, (y + 1) * 源.图.w * 4);
    out.set(行, ((y + 边) * 宽 + 边) * 4);
  }
  // 图里透明的像素按不透明画（截图本来就没有透明）
  for (let p = 3; p < out.length; p += 4) out[p] = 255;
  return out;
};
