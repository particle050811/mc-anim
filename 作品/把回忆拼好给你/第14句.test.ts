import { describe, expect, it, vi } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import 归隐段 from './段/2-归隐/段.ts';
import { fps, 段窗口, 正片事件 } from './分镜.ts';
import { 分屏态 } from './场/2-门口/分屏参数.ts';
import { 整屏镜头, 整屏镜头N } from './场/2-门口/参数.ts';
import { 她于 } from './场/2-门口/归隐她.ts';
import { 归隐歌词 } from './场/2-门口/归隐歌词.ts';
import {
  分屏线x,
  取照站位,
  合屏前偏,
  归隐N,
  按伸帧,
  挂铃站位,
  服务器中心x,
  照片墙边长,
  褪色起,
  褪色止,
  走到,
} from './场/2-门口/归隐参数.ts';
import { 回色, 铃 } from './场/2-门口/第15句.ts';
import { 纸声们 } from './场/2-门口/第8句参数.ts';
import {
  中线,
  变完秒,
  变档数,
  变法,
  挡她,
  档位,
  混起,
  片框,
  瓣形,
  看得见,
  碎图们,
  纸花们,
  纸花参数,
  纸花在,
  让开,
  风,
  风力,
  type 纸花片,
} from './场/2-门口/纸花.ts';
import { 第14句声音们 } from './场/2-门口/第14句声音.ts';
import { 符文歌词默认, 字状态 } from './界面/符文排版.ts';
import { 正片歌词行 } from './界面/符文歌词数据.ts';
import { 聊天行不透明 } from './场/2-隐世之境/重逢动作.ts';
import { 照片墙格们, 照片墙格位 } from './地点/照片墙格.ts';
import { 地图画像素, 地图调色板, 白边 } from './特效/地图画.ts';
import { 第8句照片们 } from './特效/照片画.ts';
import { 撒纸窗们, 楼, 楼下N } from './现实/楼下布局.ts';

// 特效/照片画.ts 顶上就解码四张照片（真帧资产，打包时才有 asset:），这里换成一张 1×1 的 RGBA（同 祭坛召唤.test.ts）
const 一像素 = vi.hoisted(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
vi.mock('asset:贴图/照片/第3句递蛋糕-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第4句日落划船-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第5句扑龙蛋-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第7句光柱破云-二版', () => ({ default: 一像素 }));

const 事 = 正片事件;
const 秒 = (歌曲帧: number) => 歌曲帧 / fps;
/** 左屏（合屏前）看得到的 x 范围（格）：整屏镜头往左挪 合屏前偏 格的左半边 */
const 左屏格 = (() => {
  const 半 = 640 / 2 / (整屏镜头.取景.每格 / 成片倍数);
  const 中 = 整屏镜头.取景.中心[0] + 合屏前偏 - 半;
  return [中 - 半, 中 + 半] as const;
})();

describe('第 14 句：窗口和事件', () => {
  it('2-时差 [998, 1081)、2-归隐 [1081, 1158)，首尾相接、接 2-摇铃（合屏到位，48.26）', () => {
    expect(段窗口('2-时差')).toMatchObject({ 起帧: 998, 止帧: 1081 });
    expect(段窗口('2-归隐')).toMatchObject({ 起帧: 1081, 止帧: 1158, 帧数: 77 });
    expect(段窗口('2-摇铃').起帧).toBe(1158);
    expect(事.合屏到位.帧).toBe(1158);
    expect(归隐段.帧数).toBe(77);
  });

  it('事件一拍一个动作：分屏、挂铃、走向照片墙、纸飘下、按框、打框、取照、她消失、合屏到位', () => {
    const 序 = [事.第14句分屏, 事.挂铃, 事.走向照片墙, 事.纸飘下, 事.手按合照, 事.打框, 事.取照, 事.她消失, 事.合屏到位].map((e) => e.帧);
    expect(序[0]).toBe(1081);
    for (let i = 1; i < 序.length; i++) expect(序[i]!).toBeGreaterThan(序[i - 1]!);
    // 照片方案「拍前 2～3 帧她打一下框」
    expect(事.取照.帧 - 事.打框.帧).toBeGreaterThanOrEqual(2);
    expect(事.取照.帧 - 事.打框.帧).toBeLessThanOrEqual(3);
    // 她走以后门口空着停 0.3 秒上下再拉开，拉开用 10 帧以上（核查 10-24：同一台机位连续拉开，不是一刀；她走、合屏、你上线一件一件来）
    expect((事.合屏起.帧 - 事.她消失.帧) / fps).toBeGreaterThanOrEqual(0.25);
    expect(事.合屏到位.帧 - 事.合屏起.帧).toBeGreaterThanOrEqual(8);
    expect(事.第15句加入游戏.帧 - 事.合屏到位.帧).toBeGreaterThanOrEqual(4);
  });

  it('两屏、2-摇铃 像素一样大：门口、教学楼下都是整屏镜头的 N（合屏只挪不缩）', () => {
    expect([归隐N, 楼下N]).toEqual([整屏镜头N, 整屏镜头N]);
  });
});

describe('合屏：同一台机位连续拉开', () => {
  const 合屏帧们 = Array.from({ length: 事.合屏到位.帧 - 事.合屏起.帧 + 1 }, (_, i) => 事.合屏起.帧 + i);

  it('合屏前：左屏就是整屏镜头往左挪 合屏前偏 格的左半边，分屏线在中线；合屏到位：整屏镜头、分屏线出画', () => {
    expect(合屏前偏).toBe(4);
    for (const f of [事.第14句分屏.帧, 事.合屏起.帧]) {
      expect(服务器中心x(秒(f))).toBe(合屏前偏);
      expect(分屏线x(秒(f))).toBe(中线);
    }
    expect(服务器中心x(秒(事.合屏到位.帧))).toBe(整屏镜头.取景.中心[0]);
    expect(分屏线x(秒(事.合屏到位.帧))).toBe(1280);
  });

  it('每帧只挪整贴图像素、一路往一个方向，没有一帧跳得特别远（两头慢）', () => {
    const 每贴图像素页 = 整屏镜头N / 成片倍数;
    for (let i = 1; i < 合屏帧们.length; i++) {
      const [a, b] = [合屏帧们[i - 1]!, 合屏帧们[i]!].map((f) => 服务器中心x(秒(f)));
      const 挪页 = (a! - b!) * 16 * 每贴图像素页;
      expect(挪页, `第 ${合屏帧们[i]} 帧`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(挪页 / 每贴图像素页 - Math.round(挪页 / 每贴图像素页))).toBeLessThan(1e-9);
      const [la, lb] = [合屏帧们[i - 1]!, 合屏帧们[i]!].map((f) => 分屏线x(秒(f)));
      expect(lb! - la!).toBeGreaterThanOrEqual(0);
      // 线一帧不超过平均速度的 1.6 倍（smoothstep 峰值 1.5 倍）
      expect(lb! - la!).toBeLessThanOrEqual((1.6 * 640) / (合屏帧们.length - 1));
    }
  });

  it('合照格、告示牌在左屏里（告示牌 x −3.5 到合照格 x 3.5）', () => {
    expect(照片墙格位.合照).toEqual([3, 1]);
    expect(左屏格[0]).toBeLessThanOrEqual(-3.5);
    expect(左屏格[1]).toBeGreaterThanOrEqual(3.5);
  });
});

describe('她：挂铃 → 走进屋 → 取照 → 传送走', () => {
  it('第一帧在告示牌旁举着铃，帽檐不压牌子（牌子右沿 x −2.5）；挂铃 以后才起步', () => {
    const 起 = 她于(事.第14句分屏.帧)!;
    expect([起.x, 起.yaw, 起.右手]).toEqual([挂铃站位, 180, null]);
    expect(挂铃站位 - 0.5).toBeGreaterThanOrEqual(铃.挂点[0]);
    expect(她于(事.走向照片墙.帧)!.x).toBe(挂铃站位);
  });

  it('走路：一路往东、原版走路到疾跑之间的速度（4.3～5.6 格/秒），手按合照 前 按伸帧 帧停在取照站位', () => {
    const 止 = 事.手按合照.帧 - 按伸帧;
    let 最快 = 0;
    for (let f = 事.走向照片墙.帧 + 1; f <= 止; f++) {
      const d = 走到(f).x - 走到(f - 1).x;
      expect(d, `第 ${f} 帧`).toBeGreaterThanOrEqual(0);
      最快 = Math.max(最快, d * fps);
    }
    expect(最快).toBeGreaterThan(4.3);
    expect(最快).toBeLessThanOrEqual(5.6);
    expect(走到(止).x).toBeCloseTo(取照站位, 9);
    expect(她于(止)!.x).toBeCloseTo(取照站位, 9);
    // 帽檐右沿不压合照格（x 2.5～3.5）
    expect(取照站位 + 0.5).toBeLessThanOrEqual(照片墙格位.合照[0] - 0.5);
    expect(取照站位 + 0.5).toBeLessThanOrEqual(左屏格[1]);
  });

  it('取照那一帧合照落进主手，之前手里没有；她消失 那一帧起不在了', () => {
    expect(她于(事.取照.帧 - 1)!.右手).toBeNull();
    expect(她于(事.取照.帧)!.右手).toBe('合照');
    expect(她于(事.她消失.帧 - 1)).not.toBeNull();
    for (let f = 事.她消失.帧; f < 段窗口('2-归隐').止帧; f++) expect(她于(f), `第 ${f} 帧`).toBeNull();
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

  it('地图画：一格的地图像素落在整成片像素上，外圈白边，里面全是原版地图色', () => {
    expect((16 * 归隐N) % 照片墙边长).toBe(0);
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

describe('调子', () => {
  it('左屏从第 13 句末的褪色起，合屏到位那一拍到 2-摇铃 开头的调子', () => {
    expect(分屏态(事.第14句分屏.帧 - 1).褪色).toBeCloseTo(褪色起, 9);
    expect(褪色止).toBeCloseTo(1 - 回色.起, 12);
  });
});

describe('教学楼下', () => {
  it('扔纸的窗是一楼、二楼的窗，整扇在右屏里（N = 10 半屏 9 格高）', () => {
    const 斜 = 2 / 楼下N;
    for (const 窗 of 撒纸窗们) {
      // 楼下.tsx 的窗：每层 层高 格，层里第 1、2 格是窗
      expect(窗.z[0] % 楼.层高).toBe(1);
      expect(窗.z[1] - 窗.z[0]).toBe(2);
      expect(窗.y).toBe(楼.j);
      // 斜投影里窗顶的高度（地面线以上几格）不出画：地面线以上 720 页面像素里能放 (720 − 地面线离底) ÷ 每格页 格
      const 地面线以上 = (720 / 2) / (整屏镜头.取景.每格 / 成片倍数) + 整屏镜头.取景.中心[1];
      expect(窗.z[1] + 斜 * 窗.y).toBeLessThanOrEqual(地面线以上);
      expect(窗.x[0]).toBeGreaterThanOrEqual(-4);
      expect(窗.x[1]).toBeLessThanOrEqual(4);
    }
  });
});

describe('碎纸和花瓣（用户 10-24：两边方向、速度一样；用户 10-25：撕碎、被风横着吹过去、一边飘一边变成樱花瓣）', () => {
  const 全 = 纸花们();
  const 纸们 = 全.filter((q) => q.种 === '纸');
  const 瓣们 = 全.filter((q) => q.种 === '瓣');
  const 段帧们 = Array.from({ length: 段窗口('2-摇铃').止帧 - 事.第14句分屏.帧 }, (_, i) => 事.第14句分屏.帧 + i);
  /** 这一刻露在 [左, 1280) × [0, 720) 里的 */
  const 画里 = (qs: readonly 纸花片[], t: number, 左 = 0) =>
    qs.filter((q) => {
      if (!看得见(q, t)) return false;
      const { x, y } = 纸花在(q, t);
      const k = 片框(q);
      return x + k.宽 > 左 && x < 1280 && y + k.高 > 0 && y < 720;
    });
  const 中心x = (q: 纸花片, t: number) => 纸花在(q, t).x + 片框(q).宽 / 2;

  it('碎纸、花瓣的飘法从同一套分布里取（没风时往下、往左的速度，吃风多少都在范围里）', () => {
    for (const q of 全) {
      expect(q.vx).toBeGreaterThanOrEqual(纸花参数.vx[0]);
      expect(q.vx).toBeLessThanOrEqual(纸花参数.vx[1]);
      expect(q.vy).toBeGreaterThanOrEqual(纸花参数.vy[0]);
      expect(q.vy).toBeLessThanOrEqual(纸花参数.vy[1]);
      expect(q.吃风).toBeGreaterThanOrEqual(风.吃[0]);
      expect(q.吃风).toBeLessThanOrEqual(风.吃[1]);
    }
  });

  it('碎纸的样子：小块（3～5 格）、每张都有撕掉的缺口、至少一道字行，字行总是横的（只正着、倒着放）', () => {
    for (const 图 of 碎图们) {
      expect(new Set(图.map((行) => 行.length)).size).toBe(1);
      for (const n of [图.length, 图[0]!.length]) {
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(5);
      }
      expect(图.join('')).toContain('.');
      expect(图.some((行) => 行.includes('LL'))).toBe(true);
    }
    for (const q of 纸们) expect(q.转 % 2).toBe(0);
  });

  it('风：纸飘下 那一拍前后刮起来，一直刮到转向铃，摇铃那一拍停住（樱花风从铃那里接手）', () => {
    expect(风力(事.纸飘下.秒 - 0.2)).toBe(0);
    for (let t = 事.纸飘下.秒 + 0.3; t <= 事.转向铃.秒; t += 0.05) expect(风力(t)).toBeCloseTo(1, 9);
    expect(风力(事.摇铃.秒)).toBe(0);
  });

  it('起风以后两边一个方向：每一片都在往左飘，横着走（往左比往下快得多）', () => {
    for (let f = 事.纸飘下.帧 + 8; f < 事.转向铃.帧; f += 2) {
      const [t0, t1] = [秒(f), 秒(f + 1)];
      for (const q of 全) {
        if (t0 < q.生 + 纸花参数.拽秒 * 3) continue;
        const [a, b] = [纸花在(q, t0), 纸花在(q, t1)];
        expect(b.x - a.x, `第 ${f} 帧`).toBeLessThan(0);
        expect(Math.abs(b.x - a.x), `第 ${f} 帧`).toBeGreaterThan(1.5 * Math.abs(b.y - a.y));
      }
    }
  });

  it('碎、多：分屏里有一刻右屏里飘着六十片以上碎纸，上、中两截都有十几片', () => {
    const 好 = 段帧们
      .filter((f) => f < 事.合屏起.帧)
      .some((f) => {
        const 在 = 画里(纸们, 秒(f), 中线);
        const 截 = [0, 1].map((i) => 在.filter((q) => Math.floor(Math.max(0, 纸花在(q, 秒(f)).y) / 240) === i).length);
        return 在.length >= 60 && 截.every((n) => n >= 15);
      });
    expect(好).toBe(true);
    expect(片框(纸们.find((q) => q.档 === 纸花参数.近档)!).宽).toBeLessThanOrEqual(50);
  });

  it('碎纸越过分屏线飘到她那边：合屏起 以前过了线的超过一半', () => {
    const 过线 = 纸们.filter((q) => {
      for (let t = q.生; t < 混起; t += 1 / 24) if (中心x(q, t) < 中线) return true;
      return false;
    });
    expect(过线.length / 纸们.length).toBeGreaterThan(0.5);
  });

  it('一张一张变：每片先当至少 纸秒 的碎纸，一档至少 3 帧，变完秒 以前变成樱花瓣；换到同一档的时刻前后错开半秒以上，同一帧里换档的不到三分之一（不是整片一起）', () => {
    for (const q of 纸们) {
      expect(q.变).toHaveLength(变档数);
      expect(q.变[0]! - q.生).toBeGreaterThanOrEqual(变法.纸秒 - 1e-9);
      for (let k = 1; k < 变档数; k++) expect(q.变[k]! - q.变[k - 1]!).toBeGreaterThanOrEqual(3 / fps - 1e-9);
      expect(q.变[变档数 - 1]!).toBeLessThanOrEqual(变完秒);
    }
    for (let k = 0; k < 变档数; k++) {
      const 时们 = 纸们.map((q) => q.变[k]!);
      expect(Math.max(...时们) - Math.min(...时们), `第 ${k + 1} 档`).toBeGreaterThan(0.5);
    }
    for (const f of 段帧们) {
      const 换 = 纸们.filter((q) => 档位(q, 秒(f)) !== 档位(q, 秒(f - 1))).length;
      expect(换, `第 ${f} 帧`).toBeLessThan(纸们.length / 3);
    }
  });

  it('越往左越像樱花：分屏里过了线的碎纸，平均档位比还在右屏的高', () => {
    let 比过 = 0;
    for (let f = 事.纸飘下.帧 + 12; f < 事.合屏起.帧; f++) {
      const t = 秒(f);
      const 在 = 画里(纸们, t);
      const [左, 右] = [在.filter((q) => 中心x(q, t) < 中线), 在.filter((q) => 中心x(q, t) >= 中线)];
      if (左.length < 5 || 右.length < 5) continue;
      const 均 = (qs: 纸花片[]) => qs.reduce((n, q) => n + 档位(q, t), 0) / qs.length;
      expect(均(左), `第 ${f} 帧`).toBeGreaterThan(均(右));
      比过++;
    }
    expect(比过).toBeGreaterThanOrEqual(10);
  });

  it('形状按像素格一步步来：第 1、2 档只掉碎纸多出来的格（离瓣心远的先掉），第 2 档里樱花瓣形状的格都在，格数一档比一档少', () => {
    const 格数 = (g: readonly string[]) => g.join('').replace(/\./g, '').length;
    for (const q of 纸们) {
      const [g0, g1, g2] = q.格们 as [string[], string[], string[]];
      expect(g0).toEqual([...碎图们[q.图]!]);
      expect(格数(g0)).toBeGreaterThan(格数(g1));
      expect(格数(g1)).toBeGreaterThan(格数(g2));
      expect(格数(g2)).toBeGreaterThan(7);
      for (let j = 0; j < g0.length; j++)
        for (let i = 0; i < g0[0]!.length; i++) if (g1[j]![i] !== '.') expect(g1[j]![i]).toBe(g0[j]![i]);
      const 形 = 瓣形(q.瓣);
      const [ox, oy] = [Math.floor((g0[0]!.length - 3) / 2), Math.floor((g0.length - 3) / 2)];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (形[j]![i] === 'X') expect(g2[oy + j]![ox + i]).not.toBe('.');
    }
  });

  it('合屏起 以后飘着的已经全是樱花瓣（用户 10-25：合成一整屏的时候已经都是樱花瓣）', () => {
    for (const f of 段帧们.filter((g) => 秒(g) >= 混起)) for (const q of 画里(纸们, 秒(f))) expect(档位(q, 秒(f))).toBe(变档数);
  });

  it('她按框、取下合照、传送走那几拍（手按合照 前 0.1 秒到 合屏起），她和照片墙那块没有碎纸、花瓣挡着', () => {
    expect(让开.起).toBeLessThan(事.手按合照.秒);
    expect(让开.止).toBeGreaterThanOrEqual(事.她消失.秒 + 0.3);
    // 让开框盖住取照时的她：取照站位在左屏 x = 320 + 80 × 站位 页面像素
    const 她x = 640 / 2 + 取照站位 * (整屏镜头.取景.每格 / 成片倍数);
    expect(让开.左).toBeLessThan(她x - 40);
    expect(让开.右).toBeGreaterThan(她x + 40);
    for (const q of 全) expect(挡她(q), `${q.种} ${q.生.toFixed(2)}`).toBe(false);
  });

  it('不会凭空冒出来：头一帧看得见时，碎纸是刚扔出窗、或者在画面外；花瓣在画面上沿外面，或者是合屏时分屏线推过去露出来的', () => {
    for (const f of 段帧们) {
      const [t0, t1] = [秒(f - 1), 秒(f)];
      for (const q of 全) {
        if (看得见(q, t0) || !看得见(q, t1)) continue;
        const { x, y } = 纸花在(q, t1);
        const k = 片框(q);
        const 画外 = y + k.高 <= 0 || y >= 720 || x + k.宽 <= 0 || x >= 1280;
        if (q.种 === '纸') expect(t0 < q.生, `第 ${f} 帧的碎纸`).toBe(true);
        else expect(画外 || t0 >= 混起, `第 ${f} 帧的花瓣 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
      }
    }
    // 碎纸出发点：窗洞里（右屏）或者画面外
    for (const q of 纸们) {
      const 画外 = q.y0 + 片框(q).高 <= 0 || q.x0 >= 1280;
      expect(画外 || q.x0 > 中线).toBe(true);
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

  it('第 14 句的退场和顶上还有第 15 句时逐帧一样（2-归隐、2-摇铃 两段）', () => {
    for (let f = 0; f < 段窗口('2-摇铃').止帧 - 起帧; f++)
      expect(字状态(歌.上行们, 13, f, 符文歌词默认), `段内第 ${f} 帧`).toEqual(字状态(全, 13, f, 符文歌词默认));
  });

  it('文字一时只走一路（核查 10-24）：你上线、聊天行弹出那一帧，顶上已经退完；底部第 15 句冒头那一帧，接过来的聊天行已经淡完', () => {
    const 上线 = 事.第15句加入游戏.帧 - 起帧;
    for (let i = 0; i < 14; i++) for (const z of 字状态(歌.上行们, i, 上线, 符文歌词默认)) expect(z.显, `第 ${i + 1} 句`).toBe(0);
    let f = 0;
    while (字状态(歌.下行们, 0, f, 符文歌词默认).every((z) => z.显 === 0)) f++;
    expect(聊天行不透明((起帧 + f) / fps)).toBe(0);
    for (let i = 0; i < 14; i++) for (const z of 字状态(歌.上行们, i, f, 符文歌词默认)) expect(z.显, `第 ${i + 1} 句、段内第 ${f} 帧`).toBe(0);
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
