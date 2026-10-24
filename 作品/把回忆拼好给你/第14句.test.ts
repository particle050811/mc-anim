import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import 归隐段 from './段/2-归隐/段.ts';
import { fps, 段窗口, 正片事件 } from './分镜.ts';
import { 分屏N, 分屏态 } from './场/2-门口/分屏参数.ts';
import { 整屏镜头 } from './场/2-门口/参数.ts';
import { 她于 } from './场/2-门口/归隐她.ts';
import { 归隐歌词 } from './场/2-门口/归隐歌词.ts';
import {
  归隐N,
  合屏照片墙边长,
  左取景,
  归隐刻,
  左太阳在,
  左天弧,
  照片墙边长,
  褪色起,
  褪色止,
  挂铃站位,
  墙前站位,
} from './场/2-门口/归隐参数.ts';
import { 回色, 铃 } from './场/2-门口/第15句.ts';
import { 纸声们 } from './场/2-门口/第8句参数.ts';
import { 中线, 混起, 生密, 纸花们, 纸花参数, 纸花在, 看得见 } from './场/2-门口/纸花.ts';
import { 第14句声音们 } from './场/2-门口/第14句声音.ts';
import { 符文歌词默认, 字状态 } from './界面/符文排版.ts';
import { 正片歌词行 } from './界面/符文歌词数据.ts';
import { 天体位置 } from './地点/天体.ts';
import { 照片墙格们, 照片墙格位 } from './地点/照片墙格.ts';
import { 地图画像素, 地图调色板, 白边 } from './特效/地图画.ts';
import { 第8句照片们 } from './特效/照片画.ts';
import { 楼下N } from './现实/楼下布局.ts';

const 事 = 正片事件;
const 秒 = (歌曲帧: number) => 歌曲帧 / fps;

describe('第 14 句：窗口和事件', () => {
  it('2-时差 [998, 1081)、2-归隐 [1081, 1167)，首尾相接、接 2-摇铃', () => {
    expect(段窗口('2-时差')).toMatchObject({ 起帧: 998, 止帧: 1081 });
    expect(段窗口('2-归隐')).toMatchObject({ 起帧: 1081, 止帧: 1167, 帧数: 86 });
    expect(段窗口('2-摇铃').起帧).toBe(1167);
    expect(归隐段.帧数).toBe(86);
  });

  it('事件按照片方案的拍排开：分屏、抬头看合照、纸飘下、按框、打框、取照、分屏线淡、挂铃、她消失', () => {
    const 序 = [事.第14句分屏, 事.抬头看合照, 事.纸飘下, 事.手按合照, 事.打框, 事.取照, 事.分屏线淡, 事.挂铃, 事.她消失].map((e) => e.帧);
    expect(序[0]).toBe(1081);
    for (let i = 1; i < 序.length; i++) expect(序[i]!).toBeGreaterThan(序[i - 1]!);
    expect(序.at(-1)!).toBeLessThan(段窗口('2-摇铃').起帧);
    // 照片方案「拍前 2～3 帧她打一下框」
    expect(事.取照.帧 - 事.打框.帧).toBeGreaterThanOrEqual(2);
    expect(事.取照.帧 - 事.打框.帧).toBeLessThanOrEqual(3);
    // 用户 10-24「47.83 分屏线淡掉」：线 4 帧淡完，挂铃那一帧合成一整个画面
    expect(事.挂铃.帧 - 事.分屏线淡.帧).toBe(4);
  });

  it('两屏像素一样大：门口、教学楼下都是分屏 N', () => {
    expect([归隐N, 楼下N]).toEqual([分屏N, 分屏N]);
  });
});

describe('她', () => {
  it('取照那一帧合照落进主手，之前手里没有；墙前站位在合照格右边', () => {
    expect(她于(事.取照.帧 - 1)!.右手).toBeNull();
    expect(她于(事.取照.帧)!.右手).toBe('合照');
    expect(她于(事.第14句分屏.帧)!.x).toBe(墙前站位);
    expect(墙前站位).toBeGreaterThan(照片墙格位.合照[0] + 0.5);
  });

  it('挂铃那一帧（合屏）她已经在告示牌前，合照换到副手；她消失 那一帧起不在了', () => {
    expect(她于(事.挂铃.帧 - 1)!.x).not.toBe(挂铃站位);
    const 挂 = 她于(事.挂铃.帧)!;
    expect([挂.x, 挂.右手, 挂.左手]).toEqual([挂铃站位, null, '合照']);
    expect(她于(事.她消失.帧 - 1)).not.toBeNull();
    for (let f = 事.她消失.帧; f < 段窗口('2-归隐').止帧; f++) expect(她于(f), `第 ${f} 帧`).toBeNull();
  });

  it('合屏（整屏镜头，她 1 倍）：她整个人在画里，帽檐不压牌子（牌子右沿 x −2.5）', () => {
    const 半屏格 = 640 / (整屏镜头.取景.每格 / 成片倍数);
    expect(挂铃站位 - 0.5).toBeGreaterThanOrEqual(铃.挂点[0]);
    expect(挂铃站位 - 0.5).toBeGreaterThan(整屏镜头.取景.中心[0] - 半屏格);
    expect(挂铃站位 + 0.5).toBeLessThan(整屏镜头.取景.中心[0] + 半屏格);
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
    // 合照（特效/合照.ts）是资产里的 PNG，测试引不进来；拿第 8 句四张核同一套算法
    for (const 边长 of [32, 64] as const)
      for (const 画 of 第8句照片们) {
        const px = 地图画像素(画, 边长);
        expect(px.length).toBe(边长 * 边长 * 4);
        const 边 = 白边(边长);
        const 调色板 = new Set(地图调色板.map((c) => c.join(',')));
        for (let y = 0; y < 边长; y++)
          for (let x = 0; x < 边长; x++) {
            const k = (y * 边长 + x) * 4;
            const c = `${px[k]},${px[k + 1]},${px[k + 2]}`;
            const 在边上 = x < 边 || y < 边 || x >= 边长 - 边 || y >= 边长 - 边;
            if (在边上) expect(c).toBe('255,255,255');
            else expect(调色板.has(c), `${画.名} (${x}, ${y}) ${c}`).toBe(true);
          }
      }
  });
});

describe('调子、天', () => {
  it('左屏从第 13 句末的褪色起，合屏那一拍到 2-摇铃 开头的调子', () => {
    expect(分屏态(事.第14句分屏.帧 - 1).褪色).toBeCloseTo(褪色起, 9);
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
});

describe('纸和花瓣（用户 10-24：两边方向、速度、大小一样，47.83 混在一起）', () => {
  const 全 = 纸花们();
  const 边 = 3 * (纸花参数.档 / 成片倍数);
  const 段帧们 = Array.from({ length: 段窗口('2-摇铃').止帧 - 事.第14句分屏.帧 }, (_, i) => 事.第14句分屏.帧 + i);

  it('纸、花瓣的速度从同一套分布里取：平均往下、往左的速度差不到 5%', () => {
    const 均 = (种: '纸' | '瓣', k: 'vx' | 'vy') => {
      const 们 = 全.filter((q) => q.种 === 种);
      return 们.reduce((s, q) => s + q[k], 0) / 们.length;
    };
    for (const k of ['vx', 'vy'] as const) expect(Math.abs(均('纸', k) / 均('瓣', k) - 1), k).toBeLessThan(0.05);
  });

  it('分屏线淡 以前：看得见的纸都在右半屏、花瓣都在左半屏（只差左右晃的那一点）', () => {
    for (let f = 事.第14句分屏.帧; f < 事.分屏线淡.帧; f += 3) {
      const t = 秒(f);
      for (const q of 全) {
        if (!看得见(q, t)) continue;
        const { x } = 纸花在(q, t);
        if (q.种 === '纸') expect(x + q.摆, `第 ${f} 帧的纸`).toBeGreaterThanOrEqual(中线);
        else expect(x - q.摆, `第 ${f} 帧的花瓣`).toBeLessThan(中线);
      }
    }
  });

  it('不会凭空冒出来：一片头一帧看得见时在画面上沿外面，或者（分屏时）是左屏的花瓣刚从分屏线那边飘进来；混起 那一刀也一样', () => {
    for (const f of 段帧们) {
      const [t0, t1] = [秒(f - 1), 秒(f)];
      for (const q of 全) {
        if (看得见(q, t0) || !看得见(q, t1)) continue;
        const { x, y } = 纸花在(q, t1);
        const 从线进 = t1 < 混起 && q.种 === '瓣' && Math.abs(x - 中线) <= q.摆 - q.vx / fps;
        expect(y + 边 <= 0 || 从线进, `第 ${f} 帧 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
      }
    }
  });

  it('混起 以后看得见的一直看得见（飘过线就混到对面，不会半路消失）', () => {
    for (const q of 全) {
      if (!看得见(q, 混起) || q.生 > 混起) continue;
      expect(看得见(q, 秒(段窗口('2-摇铃').止帧))).toBe(true);
    }
  });

  it('越下越密：纸飘下 以前零零星星，取照 那一拍最密；混起 以后两种各一半，合起来一样密', () => {
    expect(生密(事.纸飘下.秒 - 0.01)).toBe(纸花参数.密.底);
    expect(生密(事.取照.秒)).toBe(纸花参数.密.满);
    expect(2 * 生密(混起)).toBe(纸花参数.密.满);
  });

  it('合屏那一帧纸和花瓣铺满整页：上、中、下三截都有纸也有花瓣（核查 10-24：纸原来只落到右屏上面三分之一）', () => {
    const t = 事.挂铃.秒;
    for (const 种 of ['纸', '瓣'] as const)
      for (let k = 0; k < 3; k++) {
        const 在这截 = 全.filter((q) => {
          if (q.种 !== 种 || !看得见(q, t)) return false;
          const { x, y } = 纸花在(q, t);
          return x + 边 > 0 && x < 1280 && y >= k * 240 && y < (k + 1) * 240;
        });
        expect(在这截.length, `${种} 第 ${k + 1} 截`).toBeGreaterThan(0);
      }
  });
});

describe('歌词：第 15 句在底部', () => {
  const 起帧 = 段窗口('2-归隐').起帧;
  const 歌 = 归隐歌词(起帧);
  const 全 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));

  it('顶上只有第 1～14 句，底部只有第 15 句', () => {
    expect(歌.上行们.map((r) => r.词)).toEqual(全.slice(0, 14).map((r) => r.词));
    expect(歌.下行们.map((r) => r.词)).toEqual([全[14]!.词]);
  });

  it('第 14 句的退场和顶上还有第 15 句时逐帧一样', () => {
    for (let f = 0; f < 段窗口('2-归隐').帧数; f++)
      expect(字状态(歌.上行们, 13, f, 符文歌词默认, 歌.上收), `段内第 ${f} 帧`).toEqual(字状态(全, 13, f, 符文歌词默认));
  });

  it('文字一时只走一路：底部第 15 句冒头那一帧，顶上已经退完', () => {
    let f = 0;
    while (字状态(歌.下行们, 0, f, 符文歌词默认).every((z) => z.显 === 0)) f++;
    for (let i = 0; i < 14; i++) for (const z of 字状态(歌.上行们, i, f, 符文歌词默认, 歌.上收)) expect(z.显, `第 ${i + 1} 句、段内第 ${f} 帧`).toBe(0);
  });
});

describe('声音', () => {
  it('三个音效都在本段里放完（铃声不拖进 2-摇铃）', () => {
    const 窗 = 段窗口('2-归隐');
    for (const 音 of 第14句声音们) {
      const 尾 = 音.起帧 + (音.帧数 ?? Math.ceil(音.时长秒 * fps));
      expect(音.起帧, 音.名).toBeGreaterThanOrEqual(窗.起帧);
      expect(尾, 音.名).toBeLessThanOrEqual(窗.止帧);
    }
    const 名们 = (归隐段.声音 ?? []).filter((c): c is 资产cue => c.资产 !== undefined).map((c) => c.名);
    expect(名们).toEqual(['原声', ...第14句声音们.map((s) => s.名)]);
  });

  it('纸声最响那一下在纸飘下、取出声在取照、铃声起音不晚于挂铃', () => {
    const 起 = Object.fromEntries(第14句声音们.map((s) => [s.名, s.起帧]));
    expect(起.纸飘下! + 纸声们[1]!.峰帧).toBe(事.纸飘下.帧);
    expect(起.荧光框取出).toBe(事.取照.帧);
    expect(起.挂铃).toBeLessThanOrEqual(事.挂铃.帧);
  });
});
