// 第 6、7 句画面的颜色：雷雨的天（闪电那两刻往亮里混）、两个镜头的调子。纯模块。
import * as 参 from './参数.ts';

const 拆色 = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
/** 两个 #rrggbb 在 sRGB 数值上线性混（k = 0 是 a） */
export const 混色 = (a: string, b: string, k: number) => {
  const [x, y] = [拆色(a), 拆色(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, '0')).join('');
};

/** 剖面镜头的天：平时 雷雨天色；闪的那一帧地平、顶都往 闪电.天色 混 闪电.天混 */
export const 坑景天色 = (闪: boolean) => {
  const k = 闪 ? 参.闪电.天混 : 0;
  return { 地平: 混色(参.雷雨天色.地平, 参.闪电.天色, k), 顶: 混色(参.雷雨天色.顶, 参.闪电.天色, k), 渐变高: 参.雷雨天色.渐变高 };
};
