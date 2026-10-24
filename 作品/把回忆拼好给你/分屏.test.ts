import { describe, expect, it } from 'vitest';
import { 正片事件 } from './分镜.ts';
import { 默认天弧 } from './场/2-门口/参数.ts';
import {
  分屏N,
  分屏态,
  分屏手偏,
  分屏树方块,
  分屏版式,
  分屏课表z,
  天体残影,
  她倍,
  手到于,
  撕帧数,
  服务器取景,
  现实镜,
  现实镜于,
  第3截形状,
  落帧们,
  落了几页,
  每帧刻,
  亮格于,
} from './场/2-门口/分屏参数.ts';
import { 天体位置 } from './地点/天体.ts';
import { 樱花树方块 } from './地点/樱花树.ts';
import { 正交顶面 } from './画风.ts';
import { 撕页本尺寸, 撕页本角, 算撕页态 } from './现实/撕页.ts';
import { 笔筒尺寸 } from './现实/笔筒.tsx';
import { 摆放, 课表框 } from './现实/课桌布局.ts';

const 静帧 = 正片事件.分屏静帧.帧;
const 树根 = [-5, 1, 0] as const; // 地点/门口小木屋.tsx 门口.树苗 那一格（那边是 tsx，测试不引）

// 成片像素：服务器画布 0～1280、现实画布 1280～2560；一格 16N 个像素，往里一格画面上升 斜 格
const 每格 = 16 * 分屏N;
const 斜 = 正交顶面 / 分屏N;
const 服务器x = (x: number) => 分屏版式.服务器宽 + (x - 服务器取景.中心[0]) * 每格;
const 现实x = (x: number, 中心x: number) => 分屏版式.服务器宽 * 2 + 分屏版式.现实宽 + (x - 中心x) * 每格;
/** 剖面上 (z, 深 y) 那一点在画面上离顶边几像素 */
const 屏y = (z: number, y: number, 中心z: number) => 720 - (z + 斜 * y - 中心z) * 每格;

describe('第 13 句分屏', () => {
  it('分屏静帧：31 刚落、下一页还没开始撕，树长到第 3 截，服务器那半只褪一点、没往夜里插', () => {
    const 态 = 分屏态(静帧);
    expect(态.翻页).toBe(2);
    expect(算撕页态(态.翻页)).toEqual({ 顶: 31, 飞: [] });
    expect(态.落了几页).toBe(3);
    expect(态.树进度).toBeCloseTo(3 / 5, 9);
    expect(态.褪色).toBeCloseTo(0.1, 9);
    expect(态.夜).toBe(0);
    expect(态.现实镜).toEqual(现实镜.桌面);
  });

  it('撕页窗口不重叠，静帧那一帧下一页的撕页还没开始', () => {
    for (let k = 1; k < 落帧们.length; k++) expect(落帧们[k]! - 撕帧数).toBeGreaterThanOrEqual(落帧们[k - 1]!);
    expect(落帧们[3]! - 撕帧数).toBeGreaterThanOrEqual(静帧);
  });

  it('每落一页长一截：第 3 截是 3 格宽的小冠（不是满树冠），其余照樱花树.ts，五页落完是整棵', () => {
    expect(落帧们.map(落了几页)).toEqual([1, 2, 3, 4, 5]);
    expect(分屏态(落帧们[0]! - 1).树进度).toBe(0);
    expect(分屏态(落帧们[4]!).树进度).toBe(1);
    const 宽 = (bs: { 位: readonly number[] }[]) => {
      const xs = bs.map((b) => b.位[0]!);
      return Math.max(...xs) - Math.min(...xs) + 1;
    };
    const 顶 = (bs: { 位: readonly number[] }[]) => Math.max(...bs.map((b) => b.位[2]! + 1));
    const 三 = 分屏树方块(3 / 5, 树根);
    expect(宽(三)).toBe(3);
    expect(顶(三)).toBe(第3截形状.length);
    expect(宽(三)).toBeLessThan(宽(樱花树方块(3, 树根)));
    // 一截比一截高
    const 顶们 = [1, 2, 3, 4, 5].map((k) => 顶(分屏树方块(k / 5, 树根)));
    for (let k = 1; k < 顶们.length; k++) expect(顶们[k]!).toBeGreaterThan(顶们[k - 1]!);
    for (const k of [0, 1, 2, 4, 5]) expect(分屏树方块(k / 5, 树根)).toEqual(樱花树方块(k, 树根));
  });

  it('服务器那半：门贴着分屏线，长成的樱花树冠（x −9.5～−1.5）和树顶整个在画里', () => {
    expect(服务器x(0.5)).toBe(分屏版式.服务器宽 * 2);
    expect(服务器x(-9.5)).toBeGreaterThanOrEqual(0);
    const 树 = 樱花树方块(5, 树根);
    const 左 = Math.min(...树.map((b) => b.位[0]!)) - 0.5;
    expect(服务器x(左)).toBeGreaterThanOrEqual(0);
    // 树冠顶面后边（最高的那条线）还在画面上沿以下
    expect(Math.min(...树.map((b) => 屏y(b.位[2]! + 1, b.位[1]! + 1, 服务器取景.中心[1])))).toBeGreaterThanOrEqual(0);
  });

  it('两半像素一样大、网格连成一张：分屏线那条边在两半都是贴图像素的边', () => {
    expect(服务器取景.每格).toBe(每格);
    const 相位 = (v: number) => ((Math.round(v * 1e6) / 1e6) % 分屏N + 分屏N) % 分屏N;
    for (const 中心 of [现实镜.课表, 现实镜.桌面]) {
      // 现实那半左沿（成片 x = 1280）对着的剖面 x 是整贴图像素
      const 左沿 = 中心[0] - 分屏版式.现实宽 / 每格;
      expect(Math.abs(左沿 * 16 - Math.round(左沿 * 16))).toBeLessThan(1e-9);
      for (const m of [-200, -77, -1, 0, 5]) expect(相位(现实x(m / 16, 中心[0]))).toBe(相位(服务器x(0.5)));
    }
    for (const m of [-120, -33, 3]) expect(相位(服务器x(m / 16))).toBe(相位(服务器x(0.5)));
  });

  it('现实那半的镜头：头两拍看课表（左上角、表头和第 1、2 节在画里），课表亮二之后斜着沉到桌面，停处桌子前沿和服务器地面线是同一条横线', () => {
    for (const e of [正片事件.分屏起, 正片事件.课表亮一, 正片事件.课表亮二]) expect(现实镜于(e.帧)).toEqual(现实镜.课表);
    const [cx, cz] = 现实镜.课表;
    expect(现实x(摆放.课表.x / 16, cx)).toBeGreaterThanOrEqual(分屏版式.服务器宽 * 2);
    expect(屏y((分屏课表z + 课表框.高) / 16, 摆放.课表.y / 16, cz)).toBeGreaterThanOrEqual(0);
    // 表头和第 1、2 节（框顶往下约 40 个贴图像素）在画里
    expect(屏y((分屏课表z + 课表框.高 - 40) / 16, 摆放.课表.y / 16, cz)).toBeLessThan(1440);
    expect(现实镜.沉止).toBeLessThan(正片事件.撕页100.帧);
    expect(现实镜于(正片事件.撕页100.帧)).toEqual(现实镜.桌面);
    expect(现实镜.桌面[1]).toBe(服务器取景.中心[1]);
    for (let f = 现实镜.沉起; f <= 现实镜.沉止; f++) for (const v of 现实镜于(f)) expect(Math.abs(v * 16 - Math.round(v * 16))).toBeLessThan(1e-9);
  });

  it('看桌面时撕页本、笔筒整个在画里，课表整个在画面上沿外面', () => {
    const [cx, cz] = 现实镜.桌面;
    expect(现实x(摆放.撕页本.x / 16, cx)).toBeGreaterThan(分屏版式.服务器宽 * 2);
    expect(现实x((摆放.笔筒.x + 笔筒尺寸.宽) / 16, cx)).toBeLessThan(2560);
    expect(屏y(撕页本尺寸.高 / 16, 摆放.撕页本.y / 16, cz)).toBeGreaterThan(0);
    expect(屏y(分屏课表z / 16, 摆放.课表.y / 16, cz)).toBeLessThan(0);
  });

  it('课表亮格：41.87 亮第 1 节、42.29 亮第 2 节，之后一直亮着', () => {
    expect(亮格于(正片事件.课表亮一.帧 - 1)).toEqual([]);
    expect(亮格于(正片事件.课表亮一.帧 + 1).map((g) => g.节)).toEqual(['第1节']);
    expect(亮格于(静帧)).toEqual([
      { 周: '周一', 节: '第1节', 亮: 1 },
      { 周: '周一', 节: '第2节', 亮: 1 },
    ]);
  });

  it('手：整个在桌沿外面（不插进桌子），画面上顶在最上面那页的右下角附近', () => {
    const cz = 现实镜.桌面[1];
    for (let k = 0; k < 落帧们.length; k++) {
      const 手 = 手到于(k, 分屏手偏, 斜);
      expect(手[1]).toBeLessThan(0);
      const 角 = 撕页本角(算撕页态(k).顶);
      const 角x = 摆放.撕页本.x + 角[0];
      const 角屏 = 屏y((摆放.撕页本.z + 角[2]) / 16, (摆放.撕页本.y + 角[1]) / 16, cz);
      const 手屏 = 屏y(手[2] / 16, 手[1] / 16, cz);
      expect(手[0]).toBeGreaterThanOrEqual(角x);
      expect(Math.abs(手屏 - 角屏)).toBeLessThan(撕页本尺寸.翻角 * 分屏N);
    }
  });

  it('太阳一拍转两天；静帧里太阳在服务器那半的天上、高过第 3 截树；轨迹上四个图标互相分开', () => {
    expect((每帧刻 * 0.42611 * 24) / 24000).toBeCloseTo(2, 6);
    const 弧 = 默认天弧(服务器取景, 分屏版式.服务器宽, 720);
    const 刻 = 分屏态(静帧).刻;
    const 日 = 天体位置(刻, 弧).太阳;
    expect(日.高).toBeGreaterThan(0.5);
    expect(日.z - 1).toBeGreaterThan(第3截形状.length + 1);
    const 半宽 = 分屏版式.服务器宽 / 每格;
    expect(Math.abs(日.x - 服务器取景.中心[0]) + 1).toBeLessThan(半宽);
    const 位们 = Array.from({ length: 天体残影.张 + 1 }, (_, i) => 天体位置(刻 - i * 天体残影.刻差, 弧).太阳);
    for (let i = 1; i < 位们.length; i++) expect(Math.hypot(位们[i]!.x - 位们[i - 1]!.x, 位们[i]!.z - 位们[i - 1]!.z)).toBeGreaterThan(1.25);
  });

  it('她放大以后站着也不比门高出一截（帽尖到门顶 2 格上下）', () => {
    const 站高 = 1.79; // 魔法酒狐戴帽站着的实测高（格，场/2-门口/参数.ts 注释）
    expect(站高 * 她倍).toBeLessThan(2.3);
  });
});
