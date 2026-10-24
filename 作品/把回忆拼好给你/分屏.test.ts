import { describe, expect, it } from 'vitest';
import { 正片事件 } from './分镜.ts';
import { 分屏门在, 半屏取景, 默认天弧 } from './场/2-门口/参数.ts';
import { 分屏态, 分屏版式, 右取景, 左镜, 左镜z, 手到于, 撕帧数, 落帧们, 落了几页, 每帧刻, 亮格于 } from './场/2-门口/分屏参数.ts';
import { 天体位置 } from './地点/天体.ts';
import { 像素N, 正交顶面 } from './画风.ts';
import { 撕页本尺寸, 撕页本角, 算撕页态 } from './现实/撕页.ts';
import { 摆放, 课表框 } from './现实/课桌布局.ts';

const 静帧 = 正片事件.分屏静帧.帧;

describe('第 13 句分屏', () => {
  it('分屏静帧：31 刚落、下一页还没开始撕，树长到第 3 截，右屏褪色一半、没往夜里插', () => {
    const 态 = 分屏态(静帧);
    expect(态.翻页).toBe(2);
    expect(算撕页态(态.翻页)).toEqual({ 顶: 31, 飞: [] });
    expect(态.落了几页).toBe(3);
    expect(态.树进度).toBeCloseTo(3 / 5, 9);
    expect(态.褪色).toBeCloseTo(0.5, 9);
    expect(态.夜).toBe(0);
  });

  it('撕页窗口不重叠，静帧那一帧下一页的撕页还没开始', () => {
    for (let k = 1; k < 落帧们.length; k++) expect(落帧们[k]! - 撕帧数).toBeGreaterThanOrEqual(落帧们[k - 1]!);
    expect(落帧们[3]! - 撕帧数).toBeGreaterThanOrEqual(静帧);
  });

  it('每落一页长一截、换一个姿势：五页落完是整棵树', () => {
    expect(落帧们.map(落了几页)).toEqual([1, 2, 3, 4, 5]);
    expect(分屏态(落帧们[0]! - 1).树进度).toBe(0);
    expect(分屏态(落帧们[4]!).树进度).toBe(1);
  });

  it('太阳一拍转两天；静帧里太阳在右屏的天上，不在树和屋顶后面', () => {
    expect((每帧刻 * 0.42611 * 24) / 24000).toBeCloseTo(2, 6);
    const 取 = 半屏取景(分屏版式.右宽 * 2, 分屏门在);
    const 弧 = 默认天弧(取, 分屏版式.右宽, 720);
    const 日 = 天体位置(分屏态(静帧).刻, 弧).太阳;
    expect(日.高).toBeGreaterThan(0.5);
    // 第 3 截树顶 5 格（斜投影里多三分之一格）、屋脊 6.5 格；太阳本体 2 格见方
    expect(日.z - 1).toBeGreaterThan(7);
    const 半宽 = 分屏版式.右宽 / 取.每格;
    expect(Math.abs(日.x - 取.中心[0]) + 1).toBeLessThan(半宽);
  });

  // 成片像素：左屏画布 0～1280、右屏 1280～2560；一格 16N 个像素
  const 每格 = 16 * 像素N;
  const 斜 = 正交顶面 / 像素N;
  const 左屏x = (x: number) => 分屏版式.左宽 + (x - 左镜.x) * 每格;
  const 右屏x = (x: number) => 分屏版式.左宽 * 2 + 分屏版式.右宽 + (x - 右取景.中心[0]) * 每格;
  const 屏y = (z: number, y: number, 中心z: number) => 720 - (z + 斜 * y - 中心z) * 每格;

  it('左右两屏的贴图像素连成同一张网格（像素一样大，边落在同一组成片列上），分屏线那条边正好是 x = 0', () => {
    expect(右取景.每格).toBe(每格);
    const 相位 = (v: number) => ((Math.round(v) % 像素N) + 像素N) % 像素N;
    for (const m of [-200, -77, -1, 0]) expect(相位(左屏x(m / 16))).toBe(相位(右屏x(0)));
    for (const m of [3, 50, 100]) expect(相位(右屏x(m / 16))).toBe(相位(右屏x(0)));
    expect(左屏x(0)).toBe(分屏版式.左宽 * 2);
  });

  it('左屏镜头：头两拍看课表（整个框在画里），课表亮二之后沉下去，撕页100 落下时停在桌面，桌子前沿和右屏地面线是同一条横线', () => {
    for (const e of [正片事件.分屏起, 正片事件.课表亮一, 正片事件.课表亮二]) expect(左镜z(e.帧)).toBe(左镜.课表z);
    const 框底 = 屏y(摆放.课表.z / 16, 摆放.课表.y / 16, 左镜.课表z);
    const 框顶 = 屏y((摆放.课表.z + 课表框.高) / 16, 摆放.课表.y / 16, 左镜.课表z);
    expect(框顶).toBeGreaterThanOrEqual(0);
    expect(框底).toBeLessThanOrEqual(1440);
    expect(左镜.沉止).toBeLessThan(正片事件.撕页100.帧);
    expect(左镜z(正片事件.撕页100.帧)).toBe(左镜.桌面z);
    expect(左镜z(静帧)).toBe(右取景.中心[1]);
    // 沉的过程中每帧都吸在整贴图像素上
    for (let f = 左镜.沉起; f <= 左镜.沉止; f++) expect(Math.abs(左镜z(f) * 16 - Math.round(左镜z(f) * 16))).toBeLessThan(1e-9);
  });

  it('课表亮格：41.87 亮第 1 节、42.29 亮第 2 节，之后一直亮着', () => {
    expect(亮格于(正片事件.课表亮一.帧 - 1)).toEqual([]);
    expect(亮格于(正片事件.课表亮一.帧 + 1).map((g) => g.节)).toEqual(['第1节']);
    expect(亮格于(静帧)).toEqual([
      { 周: '周一', 节: '第1节', 亮: 1 },
      { 周: '周一', 节: '第2节', 亮: 1 },
    ]);
  });

  it('手：整个在桌沿外面（不插进桌子），画面上顶在最上面那页的右下角附近，不在页面中间', () => {
    for (let k = 0; k < 落帧们.length; k++) {
      const 手 = 手到于(k);
      expect(手[1]).toBeLessThan(0);
      const 角 = 撕页本角(算撕页态(k).顶);
      const 角x = 摆放.撕页本.x + 角[0];
      const 角屏 = 屏y((摆放.撕页本.z + 角[2]) / 16, (摆放.撕页本.y + 角[1]) / 16, 左镜.桌面z);
      const 手屏 = 屏y(手[2] / 16, 手[1] / 16, 左镜.桌面z);
      expect(手[0]).toBeGreaterThanOrEqual(角x);
      expect(Math.abs(手屏 - 角屏)).toBeLessThan(撕页本尺寸.翻角 * 像素N);
    }
  });
});

