import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import 归隐段 from './段/2-归隐/段.ts';
import { fps, 段窗口, 正片事件 } from './分镜.ts';
import { 末帧速度, 镜 as 空床镜, 帧数 as 空床帧数 } from './段/2-空床/编排.ts';
import { 分屏N, 分屏态, 成形, 成形偏于 } from './场/2-门口/分屏参数.ts';
import { 她于 } from './场/2-门口/归隐她.ts';
import { 归隐歌词 } from './场/2-门口/归隐歌词.ts';
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
  挂铃N,
  挂铃取景,
  挂铃站位,
  她倍,
  铃心,
  风源,
  风镜像,
  飘瓣档,
} from './场/2-门口/归隐参数.ts';
import { 回色, 铃 } from './场/2-门口/第15句.ts';
import { 侧投影 } from './地点/侧剖面.tsx';
import { 符文歌词默认, 字状态 } from './界面/符文排版.ts';
import { 正片歌词行 } from './界面/符文歌词数据.ts';
import { 正交顶面 } from './画风.ts';
import { 气泡字 } from './场/2-隐世之境/参数.ts';
import { 第14句声音们 } from './场/2-门口/第14句声音.ts';
import { 天体位置 } from './地点/天体.ts';
import { 照片墙格们, 照片墙格位 } from './地点/照片墙格.ts';
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

  it('事件按三稿的拍排开：考场、收卷铃、抬头、楼上、按框、撕书、打框、撒手取照、切到挂铃、挂铃、起风、合屏', () => {
    const 序 = [
      事.第14句考场,
      事.收卷铃,
      事.抬头看合照,
      事.楼上抱书,
      事.手按合照,
      事.撕书,
      事.打框,
      事.撒手取照,
      事.挂铃切,
      事.挂铃,
      事.归隐起风,
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

describe('挂铃那一镜（核查 10-24：原来干净的只有 4 帧、她压着牌子、铃在手机上认不出）', () => {
  const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
  const 投 = 侧投影(挂铃取景, 640, 720, 正交顶面);
  // 人站的那一排（地点/门口小木屋.tsx 的 站排y；那边引了方块贴图，测试里引不进来）
  const 站排y = 0.5;
  // 她（帽檐半径 0.5 格 × 她倍）和铃在画面上占的框（页面像素）：她从脚底到帽顶按 2.6 格算
  const 半宽 = 0.5 * 她倍;
  const 左上 = 投(Math.min(挂铃站位 - 半宽, 铃心[0] - 铃.大小 / 2), 2.6, 站排y);
  const 右下 = 投(挂铃站位 + 半宽, 0, 站排y);
  const 框 = { x0: 左上.x * 成片倍数, x1: 右下.x * 成片倍数, y0: 左上.y * 成片倍数, y1: 右下.y * 成片倍数 };

  it('她站在牌子右边、整个人在左屏里，帽檐不压牌子（牌子 x −3.5～−2.5）', () => {
    expect(挂铃站位 - 半宽).toBeGreaterThanOrEqual(铃.挂点[0]);
    expect(框.x0).toBeGreaterThan(0);
    expect(框.x1).toBeLessThan(640 * 成片倍数);
    expect(框.y0).toBeGreaterThan(0);
  });

  it('寻风之铃缩到手机 390 宽有 18 像素以上；取景中心落在偶数成片像素上', () => {
    expect(((铃.大小 * 16 * 挂铃N) / W) * 390).toBeGreaterThanOrEqual(18);
    expect(Math.abs(挂铃取景.中心[0] * 挂铃取景.每格) % 2).toBe(0);
    expect(Math.abs(挂铃取景.中心[1] * 挂铃取景.每格) % 2).toBe(0);
  });

  it('切过去以后至少 12 帧（0.5 秒）风墙碰不到她和铃（风往左吹：画布左右翻过来）', () => {
    expect(事.归隐合屏.帧 - 事.挂铃切.帧).toBeGreaterThanOrEqual(12);
    const 墙 = 造风墙(归隐风参数, W, H);
    for (let f = 事.挂铃切.帧; f < 事.挂铃切.帧 + 12; f++) {
      const t = 秒(f);
      const 底 = 风墙底(t, 归隐风, 归隐风参数, W);
      // 翻过来以后补缝的底占 [W − 右, W − 左)
      if (底) expect(W - 底[1], `第 ${f} 帧补缝的底`).toBeGreaterThanOrEqual(框.x1);
      for (const q of 墙) {
        const { x, y } = 墙瓣在(q, t, 归隐风, 归隐风参数, W, H, [风镜像(散心).x * 成片倍数, 散心.y * 成片倍数]);
        const 边 = q.档 * 3;
        const [x0, x1] = [W - x - 边, W - x];
        const 碰 = x1 > 框.x0 && x0 < 框.x1 && y + 边 > 框.y0 && y < 框.y1;
        expect(碰, `第 ${f} 帧`).toBe(false);
      }
    }
  });

  it('切过去那一帧她已经在牌子旁边，挂铃那一帧松手；铃声、风声跟着', () => {
    expect(她于(事.挂铃切.帧)!.x).toBe(挂铃站位);
    expect(她于(事.挂铃切.帧 - 1)!.x).not.toBe(挂铃站位);
    expect(事.挂铃.帧).toBeGreaterThan(事.挂铃切.帧);
    expect(事.归隐起风.帧).toBeGreaterThan(事.挂铃.帧);
  });

  it('气泡从撒手取照一直挂到合屏前一帧（切到告示牌也在），合屏她不见了', () => {
    for (let f = 事.撒手取照.帧; f < 事.归隐合屏.帧; f++) expect(她于(f)!.气泡, `第 ${f} 帧`).not.toBeNull();
    expect(她于(事.撒手取照.帧 - 1)!.气泡).toBeNull();
    expect(她于(事.归隐合屏.帧)).toBeNull();
  });

  it('风流、飘过线的花瓣按这一镜的 N 取 N、2N 两档', () => {
    expect(new Set(归隐风参数.风流.档们)).toEqual(new Set([挂铃N, 2 * 挂铃N]));
    expect(飘瓣档).toBe(2 * 挂铃N);
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

  it('合屏那一帧顶上那一行已经退完（不压太阳、树冠）', () => {
    const f = 事.归隐合屏.帧 - 起帧;
    for (let i = 0; i < 14; i++) for (const z of 字状态(歌.上行们, i, f, 符文歌词默认, 歌.上收)) expect(z.显).toBe(0);
  });
});

describe('2-时差 开头接 2-空床 末帧的速度', () => {
  const v = 末帧速度();
  // 2-空床 镜头往右下走，画面里的东西往左上走（页面像素/帧）
  const 那边 = { 横: (v.右 * v.每格) / 成片倍数, 竖: (v.下 * v.每格) / 成片倍数 };
  const n = 事.分屏成形到位.帧 - 事.分屏起.帧;

  const 步 = (f: number) => {
    const [p, q] = [成形偏于(f), 成形偏于(f + 1)];
    return { 横: p.横 - q.横, 竖: p.竖 - q.竖 };
  };

  it('横竖比和 2-空床 末帧一样（画面往同一个方向走，不拐弯）', () => {
    expect(成形.横 / 成形.竖).toBeCloseTo(那边.横 / 那边.竖, 2);
  });

  it('切过来第一步和 2-空床 末帧速度差不到 4 页面像素，不比那边最后一步慢；往后一步比一步慢，到位那一帧停稳', () => {
    const [a, b] = [空床镜(空床帧数 - 2), 空床镜(空床帧数 - 1)];
    const 末步 = { 横: ((b.中心[0] - a.中心[0]) * b.每格) / 成片倍数, 竖: ((a.中心[1] - b.中心[1]) * b.每格) / 成片倍数 };
    const 首步 = 步(事.分屏起.帧);
    expect(Math.abs(首步.横 - 那边.横)).toBeLessThan(4);
    expect(Math.abs(首步.竖 - 那边.竖)).toBeLessThan(4);
    expect(首步.横).toBeGreaterThanOrEqual(末步.横);
    expect(首步.竖).toBeGreaterThanOrEqual(末步.竖);
    for (let f = 事.分屏起.帧 + 1; f < 事.分屏成形到位.帧; f++) {
      expect(步(f).横).toBeLessThan(步(f - 1).横);
      expect(步(f).竖).toBeLessThan(步(f - 1).竖);
    }
    expect(成形偏于(事.分屏成形到位.帧)).toEqual({ 横: 0, 竖: 0 });
    expect(n).toBe(5);
  });
});

describe('樱花风：起风、合屏盖满、段尾散干净', () => {
  const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
  // 往左吹：樱花风画布左右翻过来画，散心按翻过来的给
  const 心: [number, number] = [风镜像(散心).x * 成片倍数, 散心.y * 成片倍数];

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

  it('风从左屏的铃那里起（铃、风源在左半屏里，风源在铃左上）', () => {
    for (const p of [铃在左屏, 风源]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(640);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(720);
    }
    expect(风源.x).toBeLessThan(铃在左屏.x);
    expect(风源.y).toBeLessThan(铃在左屏.y);
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
