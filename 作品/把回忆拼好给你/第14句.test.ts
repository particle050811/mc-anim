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
import { 中线, 混起, 片框, 纸图们, 纸花们, 纸花参数, 纸花在, 纸落完秒, 看得见, 落完 } from './场/2-门口/纸花.ts';
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

describe('纸和花瓣（用户 10-24：两边方向、速度一样，合屏时混在一起；用户 10-25：纸要认得出是撕下来的、多到漫天飘）', () => {
  const 全 = 纸花们();
  const 纸们 = 全.filter((q) => q.种 === '纸');
  const 段帧们 = Array.from({ length: 段窗口('2-摇铃').止帧 - 事.第14句分屏.帧 }, (_, i) => 事.第14句分屏.帧 + i);
  /** 这一刻露在 [左, 1280) × [0, 720) 里的 */
  const 画里 = (qs: readonly typeof 全[number][], t: number, 左: number) =>
    qs.filter((q) => {
      if (!看得见(q, t)) return false;
      const { x, y } = 纸花在(q, t);
      const k = 片框(q);
      return x + k.宽 > 左 && x < 1280 && y + k.高 > 0 && y < 720;
    });

  it('纸、花瓣的飘法从同一套分布里取（往下、往左的速度都在 纸花参数 的范围里）', () => {
    for (const q of 全) {
      expect(q.vx).toBeGreaterThanOrEqual(纸花参数.vx[0]);
      expect(q.vx).toBeLessThanOrEqual(纸花参数.vx[1]);
      expect(q.vy).toBeGreaterThanOrEqual(纸花参数.vy[0]);
      expect(q.vy).toBeLessThanOrEqual(纸花参数.vy[1]);
    }
  });

  it('纸的样子：每张都有撕掉的缺口、至少两道字行，字行总是横的（只正着、倒着放）', () => {
    for (const 图 of 纸图们) {
      expect(new Set(图.map((行) => 行.length)).size).toBe(1);
      expect(图.join('')).toContain('.');
      expect(图.filter((行) => 行.includes('L')).length).toBeGreaterThanOrEqual(2);
    }
    for (const q of 纸们) expect(q.转 % 2).toBe(0);
  });

  it('漫天飘：分屏里有一刻右屏里飘着三十张以上，上、中、下三截都有', () => {
    const 好 = 段帧们
      .filter((f) => f < 事.合屏起.帧)
      .some((f) => {
        const 在 = 画里(纸们, 秒(f), 中线);
        const 截 = [0, 1, 2].map((i) => 在.filter((q) => Math.floor(Math.max(0, 纸花在(q, 秒(f)).y) / 240) === i).length);
        return 在.length >= 30 && 截.every((n) => n >= 5);
      });
    expect(好).toBe(true);
  });

  it('合屏起 以前：看得见的纸露在右屏、花瓣在左屏（只差左右晃的那一点）', () => {
    for (let f = 事.第14句分屏.帧; f < 事.合屏起.帧; f += 2) {
      const t = 秒(f);
      for (const q of 全) {
        if (!看得见(q, t)) continue;
        const { x } = 纸花在(q, t);
        if (q.种 === '纸') expect(x + q.摆 + 片框(q).宽, `第 ${f} 帧的纸`).toBeGreaterThan(中线);
        else expect(x - q.摆, `第 ${f} 帧的花瓣`).toBeLessThan(中线);
      }
    }
  });

  it('不会凭空冒出来：头一帧看得见时，纸是刚扔出来（窗里、上沿外），花瓣是从画面上沿外面或者现实那半后面（分屏线那边）出来', () => {
    for (const f of 段帧们) {
      const [t0, t1] = [秒(f - 1), 秒(f)];
      for (const q of 全) {
        if (看得见(q, t0) || !看得见(q, t1)) continue;
        const { x, y } = 纸花在(q, t1);
        const 刚扔 = q.种 === '纸' && t0 < q.生;
        const 线后 = q.种 === '瓣' && t0 >= q.生;
        expect(y + 片框(q).高 <= 0 || 刚扔 || 线后, `第 ${f} 帧 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
      }
    }
  });

  it('混起 那一刻露在右屏里的纸一直看得见；纸都在 2-摇铃 最后一帧以前落出画面（2-重逢 不画纸，不会一刀没了）', () => {
    const 留下 = 纸们.filter((q) => 看得见(q, 混起));
    expect(留下.length).toBeGreaterThanOrEqual(20);
    for (const q of 留下) for (const f of 段帧们.filter((g) => 秒(g) >= 混起)) expect(看得见(q, 秒(f))).toBe(true);
    expect(纸落完秒).toBeLessThan(段窗口('2-摇铃').止帧 / fps);
    for (const q of 纸们) expect(落完(q, 纸落完秒), `${q.生.toFixed(2)} 秒扔的`).toBe(true);
  });

  it('合屏到位那一帧纸和花瓣在同一块地方混着：原来现实那半（x 640～1280）里既有纸也有花瓣', () => {
    const t = 事.合屏到位.秒;
    for (const 种 of ['纸', '瓣'] as const) {
      const 在 = 画里(全.filter((q) => q.种 === 种 && 纸花在(q, t).x >= 中线), t, 中线);
      expect(在.length, 种).toBeGreaterThanOrEqual(3);
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
