import { describe, expect, it } from 'vitest';
import { 加挥手, 挥手进度 } from '@库/角色/挥手.ts';
import { 火箭位置, 烟花火花们, 炸开秒, 炸点, 球半径 } from '@库/特效/烟花.ts';
import { 天体位置 } from '../../地点/天体.ts';
import { 四周方块, 屋后远景范围 } from '../../地点/小木屋四周地形.ts';
import { fps, 拍, 段窗口, 正片事件, 第几句, 歌曲帧 } from '../../分镜.ts';
import { 逐字 } from '../../配乐/逐字.ts';
import { 告示牌行们 } from './参数.ts';
import { 第8句镜头, 第8句镜头N } from './第8句.ts';
import { 本段音效, 门口之夜音效 } from './门口之夜声音.ts';
import { 你态, 她态, 摆设态 } from './门口之夜编排.ts';
import {
  下线图标,
  亮档,
  你站,
  卡片,
  天取景,
  夜刻,
  夜天弧,
  满月在画面,
  她站,
  定格帧,
  换火箭秒,
  烟花们,
  照片帧,
  照片晚帧,
  牌上行们,
  牌字面,
  牌近N,
  树苗x,
  种下秒,
  聊天缩放,
  远N,
  镜头,
  镜头段,
} from './门口之夜参数.ts';

const 窗们 = ['2-明年六月见', '2-烟花', '2-截图下线'].map(段窗口);
const 起 = 窗们[0]!.起帧;
const 止 = 窗们[2]!.止帧;
const 帧们 = Array.from({ length: 止 - 起 }, (_, i) => 起 + i);
const 种下帧 = Math.round(种下秒 * fps);
const 换火箭帧 = Math.round(换火箭秒 * fps);

/** 场景点 → 成片像素（同 地点/侧剖面.tsx 的 侧投影 × 2） */
const 投 = (帧: number, x: number, z: number, y = 0.5) => {
  const j = 镜头(帧);
  const k = 16 * j.N;
  return { x: 1280 + (x - j.中心[0]) * k, y: 720 - (z + (j.顶面 / j.N) * y - j.中心[1]) * k };
};
/** 存档图标裁的画面正中的正方形（成片像素 x 560～2000） */
const 在图标里 = (x: number) => x >= 560 && x <= 2000;
/** 月亮中心（成片像素）：天按 天取景（N 16）画；月亮本体 8 个贴图点加两圈各 1 点的光圈，共 12 点 = 192 像素，半边 96 */
const 月在 = (帧: number) => {
  const 天 = 天取景(镜头(帧));
  const m = 天体位置(夜刻(帧 / fps), 夜天弧).月亮;
  return { x: 1280 + (m.x - 天.中心[0]) * 天.每格, y: 720 - (m.z - 天.中心[1]) * 天.每格 };
};
const 月半边 = 96;

/** 屋后远景（地点/屋后远景.tsx：视距 6、眼高 1.62、地平线在屋前四排草地上面 0.3125 格；那边引 three，测试引不进来，照抄）在这一帧画面上
 *  x 左～右 这一截里最高的那一点（成片像素 y）：相机挂在正交那一层上，眼睛在取景中心正南 6 格，方块 (i, j, k) 的前上沿离眼睛 j + 6 格 */
const 远景块们 = 四周方块(屋后远景范围);
const 远景顶 = (帧: number, 左: number, 右: number) => {
  const j0 = 镜头(帧);
  const k = 16 * j0.N;
  const 地平行 = 720 + (j0.中心[1] - (4 * j0.顶面) / j0.N - 0.3125) * k;
  let 顶 = Infinity;
  for (const b of [...远景块们.平原, ...远景块们.樱花林]) {
    const [i, j, 层] = b.位 as [number, number, number];
    const 高 = 层 + 1 - 1.62;
    if (高 <= 0) continue;
    const 比 = (6 * k) / (j + 6);
    const x1 = 1280 + (i - 0.5 - j0.中心[0]) * 比, x2 = 1280 + (i + 0.5 - j0.中心[0]) * 比;
    if (x2 < 左 || x1 > 右) continue;
    顶 = Math.min(顶, 地平行 - 高 * 比);
  }
  return 顶;
};

describe('门口之夜的段（第 9–11 句）', () => {
  it('三段首尾相接，从第 9 句首字到第 12 句首字', () => {
    expect(起).toBe(歌曲帧(第几句(9).起));
    expect(止).toBe(歌曲帧(第几句(12).起));
    expect(窗们[0]!.止帧).toBe(窗们[1]!.起帧);
    expect(窗们[1]!.止帧).toBe(窗们[2]!.起帧);
    expect(正片事件.第9句入夜.帧).toBe(起);
  });

  it('一行一写：两行落在第 9 句那段里、隔两拍；照片、碎裂、下线落在最后一段里', () => {
    const 字 = (['写字一', '写字二'] as const).map((k) => 正片事件[k].帧);
    for (const f of 字) expect(f >= 窗们[0]!.起帧 && f < 窗们[0]!.止帧).toBe(true);
    expect(字[1]! - 字[0]!).toBe(Math.round(拍(72.5) * fps) - Math.round(拍(70.5) * fps));
    for (const k of ['第11句照片', '第11句碎裂', '第11句下线'] as const) {
      const f = 正片事件[k].帧;
      expect(f >= 窗们[2]!.起帧 && f < 窗们[2]!.止帧).toBe(true);
    }
    expect(定格帧).toBe(正片事件.第11句照片.帧);
    expect(照片帧).toBe(定格帧 + 照片晚帧);
  });

  it('牌上写字和歌词的字错开：写上一行那一帧离第 9、10 句每个字唱到的那一帧（和前一帧拼齐）至少 3 帧', () => {
    const 唱 = [...逐字[9]!, ...逐字[10]!].map(歌曲帧);
    for (const k of ['写字一', '写字二'] as const) {
      const f = 正片事件[k].帧;
      for (const g of 唱) expect(Math.min(Math.abs(f - g), Math.abs(f - (g - 1))), `${k} 和第 ${g} 帧`).toBeGreaterThanOrEqual(3);
    }
  });

  it('牌上的字只有 参数.ts 告示牌行们 一处：写字一之前空着，写字一写上第一行，写字二写全', () => {
    const 一 = 正片事件.写字一.帧;
    expect(牌上行们((一 - 1) / fps)).toEqual(['', '', '', '']);
    expect(摆设态(一).牌上).toEqual([告示牌行们[0], 告示牌行们[1], '', 告示牌行们[3]]);
    expect(摆设态(正片事件.写字二.帧).牌上).toEqual(告示牌行们);
    expect(摆设态(止 - 1).牌上).toEqual(告示牌行们);
  });
});

describe('烟花（原版 1.20.1 的走法）', () => {
  it('三发：炸开正好落在分镜的炸开事件上，飞的刻数在原版 Flight 0 的 11～22 刻里；最大那发炸在「绽」上，和咔哒同一帧', () => {
    const 炸事件 = ['第10句烟花一', '第10句烟花三', '第11句大烟花'] as const;
    expect(烟花们.length).toBe(炸事件.length);
    烟花们.forEach((发, i) => {
      expect(炸开秒(发)).toBeCloseTo(正片事件[炸事件[i]!].秒, 9);
      expect(发.飞刻).toBeGreaterThanOrEqual(11);
      expect(发.飞刻).toBeLessThanOrEqual(22);
    });
    const 大 = 烟花们[烟花们.length - 1]!;
    expect(大.形).toBe('大球');
    // 定格帧那一刻已经炸了，前一帧还没炸
    expect(定格帧 / fps).toBeGreaterThanOrEqual(炸开秒(大));
    expect((定格帧 - 1) / fps).toBeLessThan(炸开秒(大));
    const 大炸 = 门口之夜音效.find((s) => s.名.endsWith('大炸'))!;
    expect(大炸.起帧).toBe(定格帧);
  });

  it('最后一发升空：离地一格以后，火箭周围一格内前两发的火花都已经烧过一半、缩成小火花（spark_0～3，刚炸开的是 spark_7）', () => {
    const 末 = 烟花们[烟花们.length - 1]!;
    for (let f = 正片事件.第11句最后一发.帧 + 1; f < 定格帧; f++) {
      const p = 火箭位置(末, f / fps)!;
      expect(p, `第 ${f} 帧`).not.toBeNull();
      if (p[2] < 1) continue;
      for (const 发 of 烟花们) {
        if (发 === 末) continue;
        for (const h of 烟花火花们(发, f / fps))
          if (Math.abs(h.p[0] - p[0]) < 1 && Math.abs(h.p[2] - p[2]) < 1) expect(h.贴图, `第 ${f} 帧 第${发.名}发`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('小球 98 颗、大球 386 颗（createParticleBall 立方体外壳；炸开那一刻火箭也照常放出最后一颗白火花），炸开那一刻的半径', () => {
    const 球数 = (i: number) => {
      const 发 = { ...烟花们[i]!, 拖尾: false };
      const 刚炸 = 烟花火花们(发, 炸开秒(发) + 0.5 / 20).length;
      const 没炸 = 烟花火花们(发, 炸开秒(发) - 0.5 / 20).length;
      return 刚炸 - 没炸 - 1;
    };
    expect(球数(0)).toBe(98);
    expect(球数(烟花们.length - 1)).toBe(386);
    expect(球半径('大球', 1)).toBeCloseTo(0.5, 9);
  });

  it('闪光亮档：大面积明暗一秒变不到 3 次；定格的照片那一帧正亮在最高档', () => {
    const 亮起: number[] = [];
    for (let f = 起 + 1; f < 止; f++) if (亮档(f / fps).档 > 0 && 亮档((f - 1) / fps).档 === 0) 亮起.push(f);
    for (const f of 亮起) expect(亮起.filter((g) => g >= f && g < f + fps).length).toBeLessThanOrEqual(3);
    expect(亮档(照片帧 / fps).档).toBe(2);
    for (const 发 of 烟花们) expect(炸点(发)[2]).toBeGreaterThan(3.5);
  });
});

describe('镜头：一个镜头不切（第 8 句同机位 → 停住种树苗 → 推到牌子上 → 跟火箭上天 → 落回门口定格）', () => {
  it('每一帧 N 是偶数、顶面 2，中心落在偶数像素上（方块边、地面线都是整像素）', () => {
    for (const f of 帧们) {
      const j = 镜头(f);
      const k = 16 * j.N;
      expect(j.N % 2, `第 ${f} 帧`).toBe(0);
      expect(j.顶面).toBe(2);
      const ex = (0.5 + j.中心[0]) * k;
      const ez = j.中心[1] * k;
      expect(Math.abs(ex - Math.round(ex))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ex) % 2)).toBe(0);
      expect(Math.abs(ez - Math.round(ez))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ez) % 2)).toBe(0);
    }
  });

  it('连贯：相邻两帧 N 变不过 1.5 倍，画面中心那一点挪不过半屏宽', () => {
    for (let f = 起 + 1; f < 止; f++) {
      const [a, b] = [镜头(f - 1), 镜头(f)];
      expect(Math.max(a.N / b.N, b.N / a.N), `第 ${f} 帧`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(投(f, a.中心[0], a.中心[1], 0).x - 1280), `第 ${f} 帧`).toBeLessThan(1280);
    }
  });

  it('开场同第 8 句的机位（N 16、中心）匹配剪进来，原样停 4 帧；N 16 一直留到 0.6 秒以后才往牌子推', () => {
    for (let f = 起; f < 起 + 4; f++) expect(镜头(f), `第 ${f} 帧`).toEqual({ N: 第8句镜头N, 顶面: 2, 中心: 第8句镜头.取景.中心 });
    let f = 起;
    while (镜头(f).N === 第8句镜头N) f++;
    expect(f - 起).toBeGreaterThanOrEqual(0.6 * fps);
    expect(f - 1).toBeGreaterThanOrEqual(种下帧);
  });

  it('种下树苗那一帧到往牌子推之前，树苗那一格整个在画里（离左边 64 像素以上）', () => {
    for (let f = 种下帧; f <= 正片事件.第9句推近.帧; f++) expect(投(f, 树苗x - 0.5, 0).x, `第 ${f} 帧`).toBeGreaterThanOrEqual(64);
  });

  it('两行字都在牌子特写里写上（N 84）：牌字在画面正中、你在画外；写完的两行在特写里留 0.5 秒以上', () => {
    for (let f = 正片事件.写字一.帧; f < 镜头段.跟起 * fps; f++) {
      expect(镜头(f).N, `第 ${f} 帧`).toBe(牌近N);
      const 牌 = 投(f, 牌字面.x, 牌字面.z, 牌字面.y);
      expect(Math.abs(牌.x - 1280)).toBeLessThan(2);
      expect(Math.abs(牌.y - 720)).toBeLessThan(2);
      // 你朝西侧身：胳膊往前伸到 x − 0.375
      expect(投(f, 你态(f).x - 0.375, 1).x, `第 ${f} 帧`).toBeGreaterThan(2560);
    }
    expect(镜头段.跟起 - 正片事件.写字二.帧 / fps).toBeGreaterThanOrEqual(0.5);
  });

  it('火箭到手时镜头已经拉开（N 36 以内），你整个人和伸出去的手都在画里，不从画框边戳进来', () => {
    for (let f = 换火箭帧; f <= 正片事件.第10句烟花一发射.帧; f++) {
      expect(镜头(f).N, `第 ${f} 帧`).toBeLessThanOrEqual(36);
      expect(投(f, 你站 - 0.8, 1).x, `第 ${f} 帧`).toBeGreaterThan(0);
      expect(投(f, 你站 + 0.3, 1).x, `第 ${f} 帧`).toBeLessThan(2560);
      const 手 = 投(f, 你站 - 0.5, 0.7);
      expect(手.y, `第 ${f} 帧`).toBeLessThan(1440 - 32);
    }
  });

  it('两发小烟花都在画面中间炸开（离中心不到 32 像素）', () => {
    for (const 发 of 烟花们.slice(0, 2)) {
      const f = Math.ceil(炸开秒(发) * fps);
      expect(镜头(f).N).toBe(远N);
      const [x, y, z] = 炸点(发);
      const p = 投(f, x, z, y);
      expect(Math.hypot(p.x - 1280, p.y - 720), `第${发.名}发`).toBeLessThan(32);
    }
  });

  it('两发小烟花开到最大时整个在屋后林子上面的天里（林子跟正交那一层一起沉出画面下边，不压平地）', () => {
    for (const 发 of 烟花们.slice(0, 2)) {
      const f = Math.ceil(炸开秒(发) * fps) + 10;
      const [x, y, z] = 炸点(发);
      const p = 投(f, x, z, y);
      const r = 球半径(发.形, (f / fps - 炸开秒(发)) * 20) * 16 * 镜头(f).N;
      expect(p.y + r, `第${发.名}发`).toBeLessThan(远景顶(f, p.x - r, p.x + r));
    }
  });

  it('定格：你、她（连帽檐）、牌子、照片墙、最大那朵（照片那一帧开到的半径）都整个在存档图标裁的正中正方形里，树苗整个在外面', () => {
    const 大 = 烟花们[烟花们.length - 1]!;
    const r = 球半径('大球', (照片帧 / fps - 炸开秒(大)) * 20);
    expect(r).toBeGreaterThan(1.5);
    const [bx, by, bz] = 炸点(大);
    const 心 = 投(照片帧, bx, bz, by);
    const k = 16 * 镜头(照片帧).N;
    expect(在图标里(心.x - r * k) && 在图标里(心.x + r * k)).toBe(true);
    expect(心.y - r * k).toBeGreaterThan(0);
    for (const [x, 宽] of [[你站, 0.3], [她站, 0.56], [牌字面.x, 0.5]] as const) {
      expect(在图标里(投(照片帧, x - 宽, 1).x), `x ${x}`).toBe(true);
      expect(在图标里(投(照片帧, x + 宽, 1).x), `x ${x}`).toBe(true);
    }
    // 照片墙（地点/门口小木屋.tsx：后墙 i 1～2 的框，x 0.5～2.5）整个在里面，屋里 x 3.5 起的摆设、树苗那格整个在外面
    expect(在图标里(投(照片帧, 0.5, 1, 2).x) && 在图标里(投(照片帧, 2.5, 1, 2).x)).toBe(true);
    expect(投(照片帧, 3.5, 1, 1.5).x).toBeGreaterThan(2000);
    expect(投(照片帧, 树苗x + 0.5, 0, 1.5).x).toBeLessThan(560);
  });

  it('月亮：匹配剪进来正好挂在 满月在画面；一直在左上、歌词那一行左边，定格那一刻整个在存档图标的正方形外面，不挨着烟花', () => {
    const 开 = 月在(起);
    // 第 9 句起在 28.62 秒，第一帧在 28.625 秒，月亮往西挪了不到 0.1 像素
    expect(开.x).toBeCloseTo(1280 + 满月在画面[0] * 256, 0);
    expect(开.y).toBeCloseTo(720 - 满月在画面[1] * 256, 0);
    for (const f of 帧们) {
      const m = 月在(f);
      expect(m.x + 月半边, `第 ${f} 帧`).toBeLessThanOrEqual(560);
      // 拉开那一下镜头先往下看你和火箭，天跟着往上挪一点，外圈光圈贴到画面上沿；月亮本体（半边 64）一直整个在画里
      expect(m.y - 64, `第 ${f} 帧`).toBeGreaterThan(0);
    }
    for (const 发 of 烟花们) {
      const f = Math.ceil(炸开秒(发) * fps) + 3;
      const [x, y, z] = 炸点(发);
      const p = 投(f, x, z, y);
      const r = 球半径(发.形, (f / fps - 炸开秒(发)) * 20) * 16 * 镜头(f).N;
      const m = 月在(f);
      expect(Math.hypot(p.x - m.x, p.y - m.y) - r - 月半边, `第${发.名}发`).toBeGreaterThan(0);
    }
  });
});

describe('人', () => {
  it('匹配剪进来几帧照第 8 句末态（闭眼歪头），之后睁眼；照片里她仰头看烟花，头转不过 30°（再转帽檐就把脸盖住）', () => {
    expect(她态(起).眨眼).toBe(1);
    expect(她态(起).头).toEqual([12, 30, 14]);
    expect(她态(照片帧).头[0]).toBeGreaterThanOrEqual(15);
    expect(Math.abs(她态(照片帧).头[1])).toBeLessThanOrEqual(30);
    expect(她态(照片帧).头[1] % 90).not.toBe(0);
  });

  it('你：一直站在 x −1.5 朝西；匹配剪进来拿着树苗、种下挥手，写字时空手，镜头拉开以后才换上火箭；放每一发都挥手；照片里仰头', () => {
    expect(你态(起)).toMatchObject({ x: 你站, yaw: 90, 拿: '树苗' });
    expect(你态(种下帧 - 1).拿).toBe('树苗');
    expect(你态(种下帧).拿).toBe(null);
    expect(你态(种下帧 + 1).挥).toBeGreaterThan(0);
    expect(你态(换火箭帧 - 1).拿).toBe(null);
    expect(你态(换火箭帧).拿).toBe('烟花火箭');
    expect(换火箭帧).toBeGreaterThan(镜头段.跟起 * fps);
    for (const 发 of 烟花们) expect(你态(Math.ceil(发.发射秒 * fps) + 1).挥).toBeGreaterThan(0);
    for (const f of 帧们) expect(你态(f)).toMatchObject({ x: 你站, yaw: 90 });
    expect(你态(照片帧).拿).toBe('烟花火箭');
    expect(你态(照片帧).头俯仰).toBeGreaterThan(30);
  });

  it('树苗种下那一帧起就在地上', () => {
    expect(摆设态(种下帧 - 1).树苗).toBe(false);
    expect(摆设态(种下帧).树苗).toBe(true);
  });

  it('挥手 6 刻挥完；没在挥时姿势原样', () => {
    expect(挥手进度(0)).toBe(0);
    expect(挥手进度(0.15)).toBeCloseTo(0.5, 9);
    expect(挥手进度(0.3)).toBe(0);
    const p = { loc: [0, 0, 0], pitch: 0, squash: 0, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0 };
    expect(加挥手(p, 0)).toBe(p);
    expect(加挥手(p, 0.3).armR).toBeGreaterThan(p.armR + 60);
  });
});

describe('下线：存档图标', () => {
  it('照原版：裁正中正方形，落定时 64×64 个点、一个点 8 个成片像素，斜度、相纸边收没', () => {
    const c = 卡片(正片事件.第11句下线.帧 + 下线图标.缩帧 - 1, 2560, 1440);
    expect(c.下).toBe(1);
    expect(c.点).toBe(64);
    expect(c.w).toBe(512);
    expect(c.h).toBe(512);
    expect(c.边).toBe(0);
    expect(c.下边).toBe(0);
    expect(c.角).toBe(0);
    expect(c.源).toEqual([560, 0, 1440, 1440]);
    // 中心、上下沿落在偶数个成片像素上
    expect(c.cy % 2).toBe(0);
  });

  it('最后半秒是落定的图标和下线那行聊天', () => {
    expect(止 - (正片事件.第11句下线.帧 + 下线图标.缩帧 - 1)).toBeGreaterThanOrEqual(0.5 * fps);
  });

  it('手机 390 宽：聊天字（原版字高 8 个界面像素）至少 11 像素高；图标下沿让开聊天栏暗底（y 950 起）', () => {
    expect((8 * 聊天缩放 * 390) / 2560).toBeGreaterThanOrEqual(11);
    const c = 卡片(止 - 1, 2560, 1440);
    expect(c.cy + c.h / 2).toBeLessThanOrEqual(950);
  });
});

describe('声音', () => {
  it('每一声都整个落在三段里，三段切出来的截数加起来不少；种树苗的声音在种下那一帧，咔哒的起音落在定格那一帧', () => {
    const 截 = 窗们.flatMap((w) => 本段音效(w));
    for (const 音 of 门口之夜音效) {
      expect(Number.isInteger(音.起帧)).toBe(true);
      expect(音.起帧).toBeGreaterThanOrEqual(起);
      expect(截.some((c) => c.名 === 音.名)).toBe(true);
    }
    expect(门口之夜音效.find((s) => s.名 === '种樱花树苗')!.起帧).toBe(种下帧);
    const 咔 = 门口之夜音效.find((s) => s.名 === '咔哒')!;
    expect(咔.起帧 + Math.round(0.13 * fps)).toBe(定格帧);
  });
});
