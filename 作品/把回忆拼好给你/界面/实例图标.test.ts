import { describe, expect, it } from 'vitest';
import { 加白边, 取图标, 图标白边, 图标边, 褪色蒙灰 } from './实例图标.ts';

/** w×h 的纯色图，左半红右半蓝（看取正中的正方形取对了没有） */
const 图 = (w: number, h: number) => {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) px.set(x < w / 2 ? [200, 40, 40, 255] : [40, 40, 200, 255], (y * w + x) * 4);
  return { w, h, px };
};

describe('实例图标', () => {
  it('取正中的正方形、按面积平均缩成 64×64，左右各一半', () => {
    const px = 取图标(图(300, 100));
    expect(px.length).toBe(图标边 * 图标边 * 4);
    expect([...px.subarray(0, 4)]).toEqual([200, 40, 40, 255]);
    const 右 = (图标边 - 1) * 4;
    expect([...px.subarray(右, 右 + 4)]).toEqual([40, 40, 200, 255]);
  });

  it('白边只涂外圈，里面不动', () => {
    const px = 加白边(取图标(图(64, 64)));
    expect([...px.subarray(0, 3)]).toEqual([0xfb, 0xfa, 0xf6]);
    const 里 = (图标白边 * 图标边 + 图标白边) * 4;
    expect([...px.subarray(里, 里 + 3)]).toEqual([200, 40, 40]);
  });

  it('褪色蒙灰定死（同样的输入每次一样）、饱和降下来，程度 0 原样', () => {
    const 源 = 取图标(图(64, 64));
    const a = 褪色蒙灰(源), b = 褪色蒙灰(源);
    expect(a).toEqual(b);
    expect(褪色蒙灰(源, 图标边, 0)).toEqual(源);
    const o = (32 * 图标边 + 10) * 4;
    const 饱和 = (p: Uint8Array) => Math.max(p[o]!, p[o + 1]!, p[o + 2]!) - Math.min(p[o]!, p[o + 1]!, p[o + 2]!);
    expect(饱和(a)).toBeLessThan(饱和(源) * 0.5);
  });
});
