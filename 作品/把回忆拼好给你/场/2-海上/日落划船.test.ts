import { describe, expect, it } from 'vitest';
import { 桨姿, 划船行程, 船上, 船数 } from '@库/物品/船原版.ts';
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
  游戏刻,
  照片帧,
  眼机位,
  接帧,
  窗,
  船态,
  投影点,
  视线,
  投影方向,
  仰角方位差,
} from './编排.ts';
import { 光路, 远档, 太阳高 } from './参数.ts';
import { 光路色, 海面图案, 远混 } from './光路.ts';
import { 地平色, 天色在 } from './天色.ts';
import { 末机, 末距, 末速, 眼珠 } from '../2-祭坛/末态.ts';

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
  it('干净的镜头都不短于 0.5 秒：眼睛特写、海；浪从起到盖满至少 0.5 秒；拉远 0.8 秒以上，拉完停稳 0.8 秒以上才起浪（核查 10-24：原来只停 11 帧）', () => {
    expect((事.眼化日.帧 - 窗.起帧) / fps).toBeGreaterThan(0.5);
    expect((事.浪起.帧 - 事.海平线.帧) / fps).toBeGreaterThan(0.5);
    expect((窗.止帧 - 事.浪起.帧) / fps).toBeGreaterThan(0.5);
    expect((事.拉远到位.帧 - 事.海平线.帧) / fps).toBeGreaterThanOrEqual(0.8);
    expect((事.浪起.帧 - 事.拉远到位.帧) / fps).toBeGreaterThanOrEqual(0.8);
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
  it('海平线那一刻船在原点、往南偏西走；你在前、她在后，她侧坐朝东偏南', () => {
    expect(船态(事.海平线.帧).loc[0]).toBeCloseTo(0, 9);
    expect(船态(事.海平线.帧).loc[1]).toBeCloseTo(0, 9);
    const 到 = 船态(事.拉远到位.帧).loc;
    expect(到[1]).toBeLessThan(0);
    expect(到[0]).toBeLessThan(0);
    expect(Math.abs(到[0])).toBeLessThan(Math.abs(到[1]));
    const g = 照片帧;
    expect(你位(g).loc[1]).toBeLessThan(她位(g).loc[1]);
    expect(你位(g).yaw).toBe(160);
    expect(她位(g).yaw).toBe(250);
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
  it('拉远到位以后你露侧脸、她正对镜头（核查 10-24：原来你一直背着镜头）', () => {
    // 人朝向和「人 → 镜头」的夹角（度）；yaw 同 FigurePose：朝向 (−sin, cos)
    const 夹角 = (人: { loc: readonly number[]; yaw: number }, 眼: readonly number[]) => {
      const 朝 = [-Math.sin((人.yaw * Math.PI) / 180), Math.cos((人.yaw * Math.PI) / 180)];
      const 到镜 = [眼[0]! - 人.loc[0]!, 眼[1]! - 人.loc[1]!];
      return (Math.acos((朝[0]! * 到镜[0]! + 朝[1]! * 到镜[1]!) / Math.hypot(到镜[0]!, 到镜[1]!)) * 180) / Math.PI;
    };
    for (const g of [事.拉远到位.帧, 照片帧, 事.浪起.帧]) {
      const 眼 = 海机位(g).眼;
      expect(夹角(你位(g), 眼), `歌曲帧 ${g}`).toBeLessThan(80);
      expect(夹角(她位(g), 眼), `歌曲帧 ${g}`).toBeLessThan(30);
    }
  });
  it('照片帧上人船够大：船那里一格在手机 390 宽上至少 60 像素（坐着的人一格半高，至少 90 像素）', () => {
    const 机 = 海机位(照片帧);
    expect((每格像素(机, 船态(照片帧).loc) * 390) / 1280).toBeGreaterThan(60);
  });
});

describe('匹配剪辑', () => {
  it('眼睛特写接着第 3 句最后一帧推：接帧的镜头就是 末机，推的速度就是 末速（接缝上推镜不停、不跳）', () => {
    const 机 = 眼机位(接帧);
    for (const i of [0, 1, 2]) expect(机.眼[i]).toBeCloseTo(末机.眼[i], 9);
    expect(机.视角).toBe(末机.视角);
    const 向 = (m: { 眼: readonly number[]; 看: readonly number[] }) => {
      const d = [0, 1, 2].map((i) => m.看[i]! - m.眼[i]!);
      const l = Math.hypot(d[0]!, d[1]!, d[2]!);
      return d.map((v) => v / l);
    };
    for (const i of [0, 1, 2]) expect(向(机)[i]).toBeCloseTo(向(末机)[i]!, 9);
    const L = (g: number) => Math.log(Math.hypot(...[0, 1, 2].map((i) => 眼机位(g).眼[i]! - 眼珠.右[i]!)));
    expect(L(接帧)).toBeCloseTo(Math.log(末距), 9);
    const ε = 1e-4;
    expect((L(接帧 + ε) - L(接帧)) / ε).toBeCloseTo(末速, 3);
    // 第 4 句第 0 帧（歌曲帧 窗.起帧）已经往里推了一帧
    expect(L(窗.起帧)).toBeLessThan(L(接帧));
  });
  it('叠化的时候（眼化日到海平线）画里只有太阳、光路和海：船身和你们俩的头都在画框右边、下边外头（一次一个看点）', () => {
    for (let g = 事.眼化日.帧; g <= 事.海平线.帧; g++) {
      const 机 = 海机位(g);
      const b = 船态(g);
      // 船身：船本地 长 ±0.9、宽 ±0.65，高到船帮；头：你（玩家模型 15/16）实体脚底往上 1.4～1.9 格、她 0.6～1.4 格，±0.25 格见方。
      // 盒子里外按 6 × 6 × 6 取点。桨伸出船外，桨梢会在右下角露一点（出静帧看过，二十来个成片像素）
      const 档 = (a: number, b: number) => Array.from({ length: 6 }, (_, i) => a + ((b - a) * i) / 5);
      const 点们: [number, number, number][] = [];
      for (const x of 档(-0.65, 0.65)) for (const y of 档(-0.9, 0.9)) for (const z of 档(0, 0.6)) 点们.push(船上(b.loc, b.yaw, [x, y, z]));
      for (const [人, 低, 高] of [[你位(g), 1.4, 1.9], [她位(g), 0.6, 1.4]] as const)
        for (const dx of 档(-0.25, 0.25)) for (const dy of 档(-0.25, 0.25)) for (const dz of 档(低, 高)) 点们.push([人.loc[0] + dx, 人.loc[1] + dy, 人.loc[2] + dz]);
      for (const q of 点们) {
        const p = 投影点(机, q);
        if (p) expect(p[0] > 1280 || p[1] > 720, `歌曲帧 ${g} (${p.map((v) => v.toFixed(0))})`).toBe(true);
      }
    }
  });
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

describe('光路、远档（Agent 加的，原版没有）', () => {
  const 日半 = (Math.atan(7.5 / 100) * 180) / Math.PI;
  /** 光路离太阳方位最远能到多少度：最宽处半宽 ×（抖 + 一截最长的半长） */
  const 最偏 = 日半 * (光路.宽 + 光路.张 * 光路.近) * (光路.抖 + 0.55);
  it('只在海平线以下、太阳正下方那一条里；近过 近 就没有了；同一处同一刻每次一样', () => {
    for (let 刻 = 0; 刻 < 200; 刻 += 7)
      for (let 差 = -40; 差 <= 40; 差 += 0.5) {
        expect(光路色(0, 差, 刻)).toBeNull();
        expect(光路色(-1, 差, 刻)).toBeNull();
        expect(光路色(光路.近 + 0.1, 差, 刻)).toBeNull();
        for (const 下 of [0.3, 1, 3, 8, 15]) {
          const c = 光路色(下, 差, 刻);
          if (Math.abs(差) > 最偏) expect(c).toBeNull();
          expect(光路色(下, 差, 刻)).toEqual(c);
        }
      }
  });
  it('贴着海平线那一道连成一片、和太阳差不多宽；一行一行隔开；光路在闪（隔几刻有的截换了位置）', () => {
    expect(光路色(0.2, 0, 0)).not.toBeNull();
    expect(光路色(0.2, 日半 * 光路.宽 * 1.01, 0)).toBeNull();
    // 往下一行一行：同一刻同一方位，有亮的行也有空的行
    const 一列 = Array.from({ length: 200 }, (_, i) => 光路.贴 + (i * (光路.近 - 光路.贴)) / 200).map((下) =>
      Array.from({ length: 41 }, (_, j) => 光路色(下, -最偏 + (j * 2 * 最偏) / 40, 10)).some((c) => c !== null),
    );
    expect(一列.filter((v) => v).length).toBeGreaterThan(20);
    expect(一列.filter((v) => !v).length).toBeGreaterThan(20);
    let 变 = 0;
    for (let 刻 = 0; 刻 < 40; 刻++)
      for (let 差 = -5; 差 <= 5; 差 += 0.25) if (JSON.stringify(光路色(3, 差, 刻)) !== JSON.stringify(光路色(3, 差, 刻 + 1))) 变++;
    expect(变).toBeGreaterThan(0);
  });
  it('远档：海平线以上不混，越往近混得越少，最近一档以外是原样的水', () => {
    expect(远混(0)).toBe(0);
    expect(远混(-2)).toBe(0);
    let 前 = 1;
    for (let 下 = 0.01; 下 < 10; 下 += 0.01) {
      expect(远混(下)).toBeLessThanOrEqual(前);
      前 = 远混(下);
    }
    expect(远混(远档.at(-1)![0] + 0.01)).toBe(0);
  });
  it('整帧的图：海平线以上一块都不盖（天归 天.tsx），太阳底下贴着海平线有光路', () => {
    const 机 = 海机位(照片帧);
    const 块 = 4;
    const { 字节, 列, 行 } = 海面图案(机, 游戏刻(照片帧), 1280, 720, 块);
    const 线 = 海平线y(机);
    for (let j = 0; j < 行; j++)
      if ((j + 0.5) * 块 < 线 - 1) for (let i = 0; i < 列; i++) expect(字节[(j * 列 + i) * 4 + 3]).toBe(0);
    const 日 = 太阳屏幕(机, 游戏刻(照片帧))!;
    const j = Math.floor((线 + 2) / 块);
    const i = Math.floor(日.x / 块);
    expect(字节[(j * 列 + i) * 4 + 3]).toBe(255);
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
