import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import 归隐段 from './段/2-归隐/段.ts';
import { fps, 段窗口, 正片事件 } from './分镜.ts';
import { 分屏N, 分屏态 } from './场/2-门口/分屏参数.ts';
import {
  归隐N,
  归隐风,
  归隐风参数,
  合屏照片墙边长,
  左取景,
  归隐刻,
  归隐气泡字,
  左太阳在,
  左天弧,
  化樱时,
  散心,
  照片墙边长,
  考场钟,
  褪色起,
  褪色止,
  铃在左屏,
  飘纸时,
} from './场/2-门口/归隐参数.ts';
import { 回色 } from './场/2-门口/第15句.ts';
import { 气泡字 } from './场/2-隐世之境/参数.ts';
import { 第14句声音们 } from './场/2-门口/第14句声音.ts';
import { 天体位置 } from './地点/天体.ts';
import { 照片墙格们, 照片墙格位 } from './地点/照片墙格.ts';
import { 合照 } from './特效/合照画.ts';
import { 地图画像素, 地图调色板, 白边 } from './特效/地图画.ts';
import { 第8句照片们 } from './特效/照片画.ts';
import { 造风墙, 墙瓣在, 风墙底, 风墙盖满 } from './特效/樱花风参数.ts';
import { 考场N } from './现实/考场布局.ts';
import { 卷子顶框, 撕口框, 栏杆, 楼上N, 楼上态于, 楼上顶面 } from './现实/楼上布局.ts';
import { 纸片在, 纸雨参数, 造纸片, 飘纸在 } from './现实/纸雨.ts';

const 事 = 正片事件;
const 秒 = (歌曲帧: number) => 歌曲帧 / fps;

describe('第 14 句：窗口和事件', () => {
  it('2-时差 [998, 1081)、2-归隐 [1081, 1167)，首尾相接、接 2-摇铃', () => {
    expect(段窗口('2-时差')).toMatchObject({ 起帧: 998, 止帧: 1081 });
    expect(段窗口('2-归隐')).toMatchObject({ 起帧: 1081, 止帧: 1167, 帧数: 86 });
    expect(段窗口('2-摇铃').起帧).toBe(1167);
    expect(归隐段.帧数).toBe(86);
  });

  it('事件按三稿的拍排开：考场、收卷铃、抬头、楼上、按框、撕书、打框、撒手取照、挂铃、合屏', () => {
    const 序 = [
      事.第14句考场,
      事.收卷铃,
      事.抬头看合照,
      事.楼上抱书,
      事.手按合照,
      事.撕书,
      事.打框,
      事.撒手取照,
      事.挂铃,
      事.归隐合屏,
    ].map((e) => e.帧);
    expect(序[0]).toBe(1081);
    for (let i = 1; i < 序.length; i++) expect(序[i]!).toBeGreaterThan(序[i - 1]!);
    expect(序[序.length - 1]!).toBeLessThan(1167);
    // 照片方案「拍前 2～3 帧她打一下框」
    expect(事.撒手取照.帧 - 事.打框.帧).toBeGreaterThanOrEqual(2);
    expect(事.撒手取照.帧 - 事.打框.帧).toBeLessThanOrEqual(3);
  });

  it('两屏像素一样大：门口、考场、楼上都是分屏 N', () => {
    expect([归隐N, 考场N, 楼上N]).toEqual([分屏N, 分屏N, 分屏N]);
  });
});

describe('照片墙', () => {
  it('第 8 句只挂四张、没有合照格；第 14 句取下以后合照格是空框', () => {
    const 四 = 照片墙格们(第8句照片们);
    expect(四).toHaveLength(4);
    const 五 = 照片墙格们(第8句照片们, null);
    expect(五).toHaveLength(5);
    expect(五[4]).toEqual({ i: 照片墙格位.合照[0], k: 照片墙格位.合照[1], 画: null });
    const 格 = 五.map((g) => `${g.i},${g.k}`);
    expect(new Set(格).size).toBe(5);
  });

  it('合照格正是原来火把那一格 (3, ·, 1)，在左屏取景里（告示牌 x −3.5 到合照格 x 3.5）', () => {
    expect(照片墙格位.合照).toEqual([3, 1]);
    const 半宽 = 640 / (左取景.每格 / 成片倍数);
    expect(左取景.中心[0] - 半宽).toBeLessThanOrEqual(-3.5);
    expect(左取景.中心[0] + 半宽).toBeGreaterThanOrEqual(3.5);
  });

  it('地图画：一格的地图像素落在整成片像素上，外圈白边，里面全是原版地图色', () => {
    expect((16 * 归隐N) % 照片墙边长).toBe(0);
    expect((16 * 10) % 合屏照片墙边长).toBe(0);
    for (const 边长 of [32, 64] as const) {
      const px = 地图画像素(合照, 边长);
      expect(px.length).toBe(边长 * 边长 * 4);
      const 边 = 白边(边长);
      const 调色板 = new Set(地图调色板.map((c) => c.join(',')));
      for (let y = 0; y < 边长; y++)
        for (let x = 0; x < 边长; x++) {
          const k = (y * 边长 + x) * 4;
          const c = `${px[k]},${px[k + 1]},${px[k + 2]}`;
          const 在边上 = x < 边 || y < 边 || x >= 边长 - 边 || y >= 边长 - 边;
          if (在边上) expect(c).toBe('255,255,255');
          else expect(调色板.has(c), `(${x}, ${y}) ${c}`).toBe(true);
        }
    }
  });
});

describe('调子、天', () => {
  it('左屏从第 13 句末的褪色起，合屏那一拍到 2-摇铃 开头的调子', () => {
    expect(分屏态(事.第14句考场.帧 - 1).褪色).toBeCloseTo(褪色起, 9);
    expect(褪色止).toBeCloseTo(1 - 回色.起, 12);
  });

  it('左屏的太阳停在 左太阳在，不在歌词那一行后面（歌词页面 x 392～889、y 38～95）', () => {
    const 每格页 = 左取景.每格 / 成片倍数;
    const 日 = 天体位置(归隐刻, 左天弧).太阳;
    expect(日.x).toBeCloseTo(左太阳在[0], 9);
    expect(日.z).toBeCloseTo(左太阳在[1], 9);
    // 太阳连光晕按一格见方算，左右沿都在歌词行左边
    const 右沿 = 320 + (日.x + 0.5 - 左取景.中心[0]) * 每格页;
    expect(右沿).toBeLessThanOrEqual(392);
  });

  it('撒手取照冒的气泡和第 15 句她头上那个是同一个颜文字', () => {
    expect(归隐气泡字).toBe(气泡字);
  });
});

describe('樱花风：挂铃起、合屏盖满、段尾散干净', () => {
  const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
  const 心: [number, number] = [散心.x * 成片倍数, 散心.y * 成片倍数];

  it('分屏换合屏那一刀前后两帧（合屏 − 1、合屏）风墙整屏盖住', () => {
    expect(风墙盖满(秒(事.归隐合屏.帧 - 1), 归隐风, 归隐风参数)).toBe(true);
    expect(风墙盖满(秒(事.归隐合屏.帧), 归隐风, 归隐风参数)).toBe(true);
  });

  it('段尾最后一帧（2-摇铃 前一帧）风墙、风流一片不剩', () => {
    const t = 秒(段窗口('2-归隐').止帧 - 1);
    expect(风墙底(t, 归隐风, 归隐风参数, W)).toBeNull();
    for (const q of 造风墙(归隐风参数, W, H)) {
      const { x, y } = 墙瓣在(q, t, 归隐风, 归隐风参数, W, H, 心);
      const 边 = q.档 * 3;
      expect(x + 边 <= 0 || x >= W || y + 边 <= 0 || y >= H).toBe(true);
    }
    expect(归隐风.满 + 归隐风参数.风流.散完秒).toBeLessThan(t);
  });

  it('风从左屏的铃那里起（铃在左半屏里）', () => {
    expect(铃在左屏.x).toBeGreaterThan(0);
    expect(铃在左屏.x).toBeLessThan(640);
    expect(铃在左屏.y).toBeGreaterThan(0);
    expect(铃在左屏.y).toBeLessThan(720);
  });
});

describe('声音', () => {
  it('六个音效都在本段里放完（风声、铃声不拖进 2-摇铃）', () => {
    const 窗 = 段窗口('2-归隐');
    for (const 音 of 第14句声音们) {
      const 尾 = 音.起帧 + (音.帧数 ?? Math.ceil(音.时长秒 * fps));
      expect(音.起帧, 音.名).toBeGreaterThanOrEqual(窗.起帧);
      expect(尾, 音.名).toBeLessThanOrEqual(窗.止帧);
    }
    const 名们 = (归隐段.声音 ?? []).filter((c): c is 资产cue => c.资产 !== undefined).map((c) => c.名);
    expect(名们).toEqual(['原声', ...第14句声音们.map((s) => s.名)]);
  });

  it('收卷铃、撕书、撒手、取出、挂铃落在各自的事件帧上', () => {
    const 起 = Object.fromEntries(第14句声音们.map((s) => [s.名, s.起帧]));
    expect(起.收卷铃).toBe(事.收卷铃.帧);
    expect(起.荧光框取出).toBe(事.撒手取照.帧);
    expect(起.挂铃).toBeLessThanOrEqual(事.挂铃.帧);
    expect(起.樱花风).toBe(事.归隐起风.帧);
    expect(事.归隐起风.帧 - 事.挂铃.帧).toBe(4);
  });
});

describe('右屏：考场、楼上、纸雨', () => {
  it('挂钟收卷铃前停在 11:59:59，收卷铃那一帧跳到 12:00', () => {
    expect(考场钟(事.收卷铃.帧 - 1)).toEqual({ 时: 11, 分: 59, 秒: 59 });
    expect(考场钟(事.收卷铃.帧)).toEqual({ 时: 12, 分: 0, 秒: 0 });
  });

  it('楼上态：撕书那一帧开始撕，撒手那一帧撒手；化樱合屏前化完', () => {
    const 时 = { 撕书: 事.撕书.帧, 撒手: 事.撒手取照.帧, 化起: 化樱时.起, 化止: 化樱时.止 };
    expect(楼上态于(事.撕书.帧 - 1, 时, fps).撕).toBe(0);
    expect(楼上态于(事.撕书.帧, 时, fps).撕).toBeGreaterThan(0);
    expect(楼上态于(事.撒手取照.帧 - 1, 时, fps).撒手秒).toBe(0);
    expect(楼上态于(事.撒手取照.帧, 时, fps).撒手帧).toBe(0);
    expect(楼上态于(化樱时.起 - 1, 时, fps).化樱).toBe(0);
    expect(楼上态于(事.归隐合屏.帧 - 1, 时, fps).化樱).toBe(1);
  });

  it('纸从栏杆外撒出去：卷子顶面、撕口都在右屏里、栏杆顶线以上', () => {
    const 栏杆顶 = 栏杆.顶 + 楼上顶面 / 楼上N;
    for (const 框 of [卷子顶框, 撕口框]) {
      expect(框.x0).toBeGreaterThan(0);
      expect(框.x1).toBeLessThan(10);
      expect(框.x0).toBeLessThan(框.x1);
      expect(框.z0).toBeGreaterThan(栏杆顶);
    }
  });

  it('撒手那一下纸是往下走的：撒手到合屏这段，纸的平均高度在往下掉', () => {
    const 纸们 = 造纸片(纸雨参数.种子, 纸雨参数.撒手张数, 事.撒手取照.秒, 卷子顶框);
    const 平均z = (t: number) => 纸们.reduce((s, q) => s + 纸片在(q, t, Infinity)!.z, 0) / 纸们.length;
    expect(平均z(秒(事.归隐合屏.帧 - 1))).toBeLessThan(平均z(事.撒手取照.秒));
  });

  it('飘过分屏线的那张：过线前后位置接得上，过线那一刻在分屏线上', () => {
    const 源 = { x: 卷子顶框.x0 + 0.3, z: (卷子顶框.z0 + 卷子顶框.z1) / 2 };
    const 前 = 飘纸在(飘纸时.过线 - 1e-6, 飘纸时, 源)!;
    const 后 = 飘纸在(飘纸时.过线, 飘纸时, 源)!;
    expect(前.成瓣).toBe(false);
    expect(后.成瓣).toBe(true);
    expect(Math.abs(前.x)).toBeLessThan(1e-3);
    expect(Math.abs(后.x)).toBeLessThan(1e-3);
    expect(Math.abs(前.z - 后.z)).toBeLessThan(1e-3);
    expect(飘纸在(飘纸时.起 - 1e-6, 飘纸时, 源)).toBeNull();
    expect(飘纸时.起).toBeGreaterThan(事.撒手取照.秒);
    expect(飘纸时.过线).toBeLessThan(事.归隐合屏.秒);
  });
});
