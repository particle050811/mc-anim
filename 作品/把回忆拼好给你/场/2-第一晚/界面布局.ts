// 原版界面的几何（界面像素，纯函数，死亡画面和段的编排、测试都用）：界面尺寸 = ceil(成片宽高 / 界面缩放)（Window 向上取整），
// 死亡画面的两个按钮 200 × 20 在 (宽/2 − 100, 高/4 + 72 + 24i)（DeathScreen.init，1.20.1），指着 = 光标落在按钮的 [x, x + 宽) × [y, y + 高) 里（AbstractWidget.isMouseOver）。
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 界面缩放 } from './参数.ts';

export const 界面宽 = (页宽 = 1280) => Math.ceil((页宽 * 成片倍数) / 界面缩放);
export const 界面高 = (页高 = 720) => Math.ceil((页高 * 成片倍数) / 界面缩放);

/** 死亡画面的按钮：0 重生、1 标题屏幕 */
export const 按钮框 = (i: 0 | 1, 页宽 = 1280, 页高 = 720) => ({
  x: Math.trunc(界面宽(页宽) / 2) - 100,
  y: Math.trunc(界面高(页高) / 4) + 72 + 24 * i,
  w: 200,
  h: 20,
});

export const 在按钮上 = (i: 0 | 1, x: number, y: number, 页宽 = 1280, 页高 = 720) => {
  const b = 按钮框(i, 页宽, 页高);
  return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
};
