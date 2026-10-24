import { describe, expect, it } from 'vitest';
import { 取图标, 图标边, 褪色参数, 褪色蒙灰 } from './实例图标.ts';

/** w×h 的纯色图，左半红右半蓝（看取正中的正方形取对了没有） */
const 图 = (w: number, h: number) => {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) px.set(x < w / 2 ? [200, 40, 40, 255] : [40, 40, 200, 255], (y * w + x) * 4);
  return { w, h, px };
};

describe('实例图标', () => {
  it('不给裁框取正中的正方形、按面积平均缩成 64×64，左右各一半', () => {
    const px = 取图标(图(300, 100));
    expect(px.length).toBe(图标边 * 图标边 * 4);
    expect([...px.subarray(0, 4)]).toEqual([200, 40, 40, 255]);
    const 右 = (图标边 - 1) * 4;
    expect([...px.subarray(右, 右 + 4)]).toEqual([40, 40, 200, 255]);
  });

  it('给了裁框就取那一块（第 11 句下线图标裁的不是正中）', () => {
    const px = 取图标(图(300, 100), { x: 0, y: 0, 边: 100 });
    const 右 = (图标边 - 1) * 4;
    expect([...px.subarray(右, 右 + 4)]).toEqual([200, 40, 40, 255]);
    expect(() => 取图标(图(300, 100), { x: 250, y: 0, 边: 100 })).toThrow();
  });

  it('褪色蒙灰同第 11 句：CSS saturate(0.25) 再盖 35% 的 150 灰；定死、程度 0 原样', () => {
    const 源 = 取图标(图(64, 64));
    const a = 褪色蒙灰(源);
    expect(a).toEqual(褪色蒙灰(源));
    expect(褪色蒙灰(源, 图标边, 0)).toEqual(源);
    // 红 (200, 40, 40)：saturate(0.25) 得 (0.36675×200 + 0.53625×40 + 0.054×40, …)，再往 150 拉 35%
    const s = 褪色参数.饱和;
    const r = (0.213 + 0.787 * s) * 200 + (0.715 - 0.715 * s) * 40 + (0.072 - 0.072 * s) * 40;
    const g = (0.213 - 0.213 * s) * 200 + (0.715 + 0.285 * s) * 40 + (0.072 - 0.072 * s) * 40;
    expect(a[0]).toBe(Math.round(r + (150 - r) * 0.35));
    expect(a[1]).toBe(Math.round(g + (150 - g) * 0.35));
    expect(a[3]).toBe(255);
  });
});
