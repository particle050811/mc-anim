import { describe, expect, it } from 'vitest';
import { 桨姿, 划船行程, 船数 } from '@库/物品/船原版.ts';
import { 正片事件, 段时钟, 第几句, fps } from '../../分镜.ts';
import {
  事,
  叠化,
  太阳屏幕,
  太阳仰角,
  她位,
  你位,
  开划秒,
  拉远,
  桨声秒们,
  每格像素,
  浪进,
  海平线y,
  海机位,
  海描边宽,
  游戏刻,
  照片帧,
  眼起机位,
  眼机位,
  眼珠,
  窗,
  船态,
  投影点,
  视线,
  投影方向,
  仰角方位差,
} from './编排.ts';
import { 太阳高, 眼起脸宽 } from './参数.ts';
import { 地平色, 天色在 } from './天色.ts';

// 第 4 句 2 行歌词在 2560×1440 上占 y 77～329（界面/符文排版.ts，字点 7），换成页面像素
const 歌词底 = 329 / 2;
const 海上帧们 = Array.from({ length: 窗.止帧 - 事.海平线.帧 }, (_, i) => 事.海平线.帧 + i);

describe('第 4 句的窗口和事件', () => {
  it('窗口是第 4 句起到第 5 句起，事件都在窗口里、按顺序', () => {
    expect(窗.起帧).toBe(Math.round(第几句(4).起 * fps));
    expect(窗.止帧).toBe(Math.round(第几句(5).起 * fps));
    expect(段时钟('2-日落划船').帧数).toBe(窗.止帧 - 窗.起帧);
    const 序 = [事.第4句开口, 事.眼化日, 事.海平线, 事.桨入水, 事.拉远到位, 事['照片-日落划船'], 事.浪起].map((e) => e.帧);
    for (let i = 1; i < 序.length; i++) expect(序[i]!).toBeGreaterThan(序[i - 1]!);
    expect(序[0]).toBeGreaterThanOrEqual(窗.起帧);
    expect(序.at(-1)!).toBeLessThan(窗.止帧);
    expect(照片帧).toBe(正片事件['照片-日落划船'].帧);
  });
  it('干净的镜头都不短于 0.5 秒：眼睛特写、海；浪从起到盖满至少 0.5 秒', () => {
    expect((事.眼化日.帧 - 窗.起帧) / fps).toBeGreaterThan(0.5);
    expect((事.浪起.帧 - 事.海平线.帧) / fps).toBeGreaterThan(0.5);
    expect((窗.止帧 - 事.浪起.帧) / fps).toBeGreaterThan(0.5);
  });
  it('叠化、浪：起止对', () => {
    expect(叠化(事.眼化日.帧)).toBe(0);
    expect(叠化(事.海平线.帧)).toBe(1);
    expect(浪进(事.浪起.帧)).toBe(0);
    expect(浪进(窗.止帧 - 1)).toBeLessThan(1);
    expect(浪进(窗.止帧)).toBe(1);
    expect(拉远(事.拉远到位.帧)).toBe(1);
    expect(拉远(照片帧)).toBe(1);
  });
});

describe('原版木船', () => {
  it('开划后速度照原版涨（每刻 ×0.9 + 0.04），最快 0.4 格/刻', () => {
    let v = 0;
    let 路 = 0;
    for (let n = 1; n <= 30; n++) {
      v = v * 0.9 + 0.04;
      路 += v;
      expect(划船行程(n).速度).toBeCloseTo(v, 9);
      expect(划船行程(n).路).toBeCloseTo(路, 9);
    }
    expect(划船行程(1e4).速度).toBeCloseTo(船数.最快, 6);
  });
  it('桨不划时是原版静止的角度，划的时候在原版夹的范围里', () => {
    const 静 = 桨姿(null);
    expect(静.left_paddle!.rot![0]).toBeCloseTo(-Math.PI / 3 + (Math.PI / 3 - 0.2617994) / 2, 6);
    for (let f = 0; f < 7; f += 0.3) {
      const p = 桨姿(f).left_paddle!.rot!;
      expect(p[0]).toBeGreaterThanOrEqual(-Math.PI / 3 - 1e-9);
      expect(p[0]).toBeLessThanOrEqual(-0.2617994 + 1e-9);
    }
  });
  it('第二桨的水声落在「桨入水」，海上镜头里的桨声都在海平线和浪起之间、隔 0.8 秒', () => {
    const 声 = 桨声秒们();
    expect(声.length).toBeGreaterThanOrEqual(2);
    expect(声[0]).toBeCloseTo(正片事件.桨入水.秒, 6);
    for (let i = 1; i < 声.length; i++) expect(声[i]! - 声[i - 1]!).toBeCloseTo(0.8, 6);
    expect(开划秒 + 2 / 20 + 0.8).toBeCloseTo(正片事件.桨入水.秒, 6);
  });
  it('海平线那一刻船在原点、往西走；你在前、她在后，她侧坐朝南', () => {
    expect(船态(事.海平线.帧).loc[0]).toBeCloseTo(0, 9);
    expect(船态(事.拉远到位.帧).loc[0]).toBeLessThan(0);
    const g = 照片帧;
    expect(你位(g).loc[0]).toBeLessThan(她位(g).loc[0]);
    expect(她位(g).yaw).toBe(180);
    expect(你位(g).yaw).toBe(90);
  });
});

describe('海上的镜头', () => {
  it('海平线那一刻太阳中心高 太阳高 度，往下落（原版速度）', () => {
    expect(太阳仰角(游戏刻(事.海平线.帧))).toBeCloseTo(太阳高, 6);
    expect(太阳仰角(游戏刻(窗.止帧))).toBeLessThan(太阳高);
    expect(太阳仰角(游戏刻(窗.止帧))).toBeGreaterThan(太阳高 - 1);
  });
  it('投影和视线互逆', () => {
    const 机 = 海机位(照片帧);
    for (const [x, y] of [[100, 50], [640, 360], [1200, 700]] as const) {
      const p = 投影方向(机, 视线(机, x, y))!;
      expect(p[0]).toBeCloseTo(x, 6);
      expect(p[1]).toBeCloseTo(y, 6);
    }
    const 西 = 仰角方位差([-1, 0, 0]);
    expect(西.仰).toBeCloseTo(0, 9);
    expect(西.差).toBeCloseTo(0, 9);
    expect(Math.abs(仰角方位差([1, 0, 0]).差)).toBeCloseTo(180, 9);
  });
  it('海上每一帧太阳（连两圈光圈）都在歌词下面、在画里、在海平线上', () => {
    for (const g of 海上帧们) {
      const 机 = 海机位(g);
      const 日 = 太阳屏幕(机, 游戏刻(g))!;
      const 圈 = (日.边 / 8) * 2;
      expect(日.y - 日.边 / 2 - 圈, `歌曲帧 ${g}`).toBeGreaterThan(歌词底 + 8);
      expect(日.x - 日.边 / 2 - 圈).toBeGreaterThan(0);
      expect(日.y + 日.边 / 2).toBeLessThan(海平线y(机));
    }
  });
  it('拉远到位以后船和你们俩在画里、在太阳右边', () => {
    const 机 = 海机位(照片帧);
    const 日 = 太阳屏幕(机, 游戏刻(照片帧))!;
    const 船 = 投影点(机, 船态(照片帧).loc)!;
    const 她 = 投影点(机, 她位(照片帧).loc)!;
    expect(船[0]).toBeGreaterThan(日.x + 日.边);
    expect(船[0]).toBeLessThan(1280);
    expect(船[1]).toBeLessThan(720);
    expect(她[1]).toBeGreaterThan(海平线y(机) - 40);
  });
  it('描边是偶数、至少 2', () => {
    for (const g of 海上帧们) {
      const w = 海描边宽(g);
      expect(w % 2).toBe(0);
      expect(w).toBeGreaterThanOrEqual(2);
    }
    expect(每格像素(海机位(照片帧), 船态(照片帧).loc)).toBeGreaterThan(0);
  });
});

describe('匹配剪辑', () => {
  it('眼化日那一刻右眼眼珠落在太阳上、一样高', () => {
    const g = 事.眼化日.帧;
    const 机 = 眼机位(g);
    const 日 = 太阳屏幕(海机位(g), 游戏刻(g))!;
    const 珠 = 投影点(机, 眼珠.右)!;
    expect(珠[0]).toBeCloseTo(日.x, 3);
    expect(珠[1]).toBeCloseTo(日.y, 3);
    const 上 = 投影点(机, [眼珠.右[0], 眼珠.右[1], 眼珠.右[2] + 眼珠.高 / 2])!;
    const 下 = 投影点(机, [眼珠.右[0], 眼珠.右[1], 眼珠.右[2] - 眼珠.高 / 2])!;
    expect(下[1] - 上[1]).toBeCloseTo(日.边, 1);
  });
  it('眼睛特写一路往里推（眼珠越来越大）', () => {
  it('推镜起点正对右眼、脸宽是画面的 眼起脸宽 倍（右眼的特写，不是整张脸）', () => {
    const 机 = 眼起机位();
    expect(机).toEqual(眼机位(窗.起帧));
    const 珠 = 投影点(机, 眼珠.右)!;
    expect(珠[0]).toBeCloseTo(640, 3);
    expect(珠[1]).toBeCloseTo(360, 3);
    const 左 = 投影点(机, [眼珠.右[0] - 眼珠.脸宽 / 2, 眼珠.右[1], 眼珠.右[2]])!;
    const 右 = 投影点(机, [眼珠.右[0] + 眼珠.脸宽 / 2, 眼珠.右[1], 眼珠.右[2]])!;
    expect(Math.abs(右[0] - 左[0]) / 1280).toBeCloseTo(眼起脸宽, 3);
    expect(眼起脸宽).toBeGreaterThanOrEqual(1);
  });
    let 前 = 0;
    for (let g = 窗.起帧; g <= 事.眼化日.帧; g++) {
      const 机 = 眼机位(g);
      const 上 = 投影点(机, [眼珠.右[0], 眼珠.右[1], 眼珠.右[2] + 眼珠.高 / 2])!;
      const 下 = 投影点(机, [眼珠.右[0], 眼珠.右[1], 眼珠.右[2] - 眼珠.高 / 2])!;
      expect(下[1] - 上[1]).toBeGreaterThanOrEqual(前 - 1e-9);
      前 = 下[1] - 上[1];
    }
  });
});

describe('天色', () => {
  it('地平线以下和地平线上同色（海的最远一档雾接得上），朝太阳那边比背着太阳红', () => {
    expect(天色在(-3, 20)).toEqual(地平色(20));
    expect(天色在(0, 20)).toEqual(地平色(20));
    expect(地平色(0)[0]).toBeGreaterThan(地平色(150)[0]);
    expect(地平色(0)[2]).toBeLessThan(地平色(150)[2]);
  });
});
