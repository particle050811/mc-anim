import { describe, expect, it } from 'vitest';
import { 加挥手, 挥手进度 } from '@库/角色/挥手.ts';
import { 火箭位置, 烟花火花们, 炸开秒, 炸点, 球半径 } from '@库/特效/烟花.ts';
import { fps, 段窗口, 正片事件, 第几句, 歌曲帧 } from '../../分镜.ts';
import { 告示牌行们 } from './参数.ts';
import { 第8句镜头, 第8句镜头N } from './第8句.ts';
import { 本段音效, 门口之夜音效 } from './门口之夜声音.ts';
import { 你态, 她态, 摆设态 } from './门口之夜编排.ts';
import { 下线图标, 亮档, 你站, 卡片, 天取景, 夜天弧, 她站, 定格帧, 烟花们, 照片帧, 照片晚帧, 牌上行们, 牌字面, 牌近N, 树苗x, 聊天缩放, 远N, 镜头, 镜头段 } from './门口之夜参数.ts';

const 窗们 = ['2-明年六月见', '2-烟花', '2-截图下线'].map(段窗口);
const 起 = 窗们[0]!.起帧;
const 止 = 窗们[2]!.止帧;
const 帧们 = Array.from({ length: 止 - 起 }, (_, i) => 起 + i);

/** 场景点 → 成片像素（同 地点/侧剖面.tsx 的 侧投影 × 2） */
const 投 = (帧: number, x: number, z: number, y = 0.5) => {
  const j = 镜头(帧);
  const k = 16 * j.N;
  return { x: 1280 + (x - j.中心[0]) * k, y: 720 - (z + (j.顶面 / j.N) * y - j.中心[1]) * k };
};
/** 存档图标裁的画面正中的正方形（成片像素 x 560～2000） */
const 在图标里 = (x: number) => x >= 560 && x <= 2000;

describe('门口之夜的段（第 9–11 句）', () => {
  it('三段首尾相接，从第 9 句首字到第 12 句首字', () => {
    expect(起).toBe(歌曲帧(第几句(9).起));
    expect(止).toBe(歌曲帧(第几句(12).起));
    expect(窗们[0]!.止帧).toBe(窗们[1]!.起帧);
    expect(窗们[1]!.止帧).toBe(窗们[2]!.起帧);
  });

  it('按词写的四拍落在第 9 句那段里、隔一秒以内；照片、碎裂、下线落在最后一段里', () => {
    const 字 = (['写字一', '写字二', '写字三', '写字四'] as const).map((k) => 正片事件[k].帧);
    for (const f of 字) expect(f >= 窗们[0]!.起帧 && f < 窗们[0]!.止帧).toBe(true);
    for (let i = 1; i < 字.length; i++) expect(字[i]! - 字[i - 1]!).toBeLessThanOrEqual(fps);
    for (const k of ['第11句照片', '第11句碎裂', '第11句下线'] as const) {
      const f = 正片事件[k].帧;
      expect(f >= 窗们[2]!.起帧 && f < 窗们[2]!.止帧).toBe(true);
    }
    expect(定格帧).toBe(正片事件.第11句照片.帧);
    expect(照片帧).toBe(定格帧 + 照片晚帧);
  });

  it('牌上的字只有 参数.ts 告示牌行们 一处：写字一之前空着，写字四写全，第一个词写在第二行', () => {
    expect(牌上行们(正片事件.写字一.帧 / fps - 0.01)).toEqual(['', '', '', '']);
    expect(牌上行们(正片事件.写字一.帧 / fps)[1]!.length).toBeGreaterThan(0);
    expect(牌上行们(正片事件.写字一.帧 / fps)[2]).toBe('');
    expect(摆设态(正片事件.写字四.帧).牌上).toEqual(告示牌行们);
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

  it('最后一发升空：离地一格以后，火箭周围一格内前两发只剩快烧完的小火花（spark_0～2，刚炸开的是 spark_7）', () => {
    const 末 = 烟花们[烟花们.length - 1]!;
    for (let f = 正片事件.第11句最后一发.帧 + 1; f < 定格帧; f++) {
      const p = 火箭位置(末, f / fps)!;
      expect(p, `第 ${f} 帧`).not.toBeNull();
      if (p[2] < 1) continue;
      for (const 发 of 烟花们) {
        if (发 === 末) continue;
        for (const h of 烟花火花们(发, f / fps))
          if (Math.abs(h.p[0] - p[0]) < 1 && Math.abs(h.p[2] - p[2]) < 1) expect(h.贴图, `第 ${f} 帧 第${发.名}发`).toBeLessThanOrEqual(2);
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

describe('镜头：一个镜头不切（第 8 句同机位 → 推到牌子上 → 跟火箭上天 → 落回门口定格）', () => {
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

  it('开场同第 8 句的机位（N 16、中心），匹配剪进来', () => {
    expect(镜头(起)).toEqual({ N: 第8句镜头N, 顶面: 2, 中心: 第8句镜头.取景.中心 });
  });

  it('写字那四拍都在牌子特写里（N 84）：牌字在画面正中、你在画外；写完以后牌子留到镜头跟火箭拉开', () => {
    for (let f = 正片事件.写字一.帧; f < 镜头段.跟起 * fps; f++) {
      expect(镜头(f).N, `第 ${f} 帧`).toBe(牌近N);
      const 牌 = 投(f, 牌字面.x, 牌字面.z, 牌字面.y);
      expect(Math.abs(牌.x - 1280)).toBeLessThan(2);
      expect(Math.abs(牌.y - 720)).toBeLessThan(2);
      // 你朝西侧身：胳膊往前伸到 x − 0.375
      expect(投(f, 你态(f).x - 0.375, 1).x, `第 ${f} 帧`).toBeGreaterThan(2560);
    }
    expect((镜头段.跟起 - 正片事件.写字四.秒) * fps).toBeGreaterThanOrEqual(0.8 * fps);
  });

  it('两发小烟花都在画面中间炸开（离中心不到 32 像素），炸点在顶上歌词那条（y 200 以上）下面', () => {
    for (const 发 of 烟花们.slice(0, 2)) {
      const f = Math.ceil(炸开秒(发) * fps);
      expect(镜头(f).N).toBe(远N);
      const [x, y, z] = 炸点(发);
      const p = 投(f, x, z, y);
      expect(Math.hypot(p.x - 1280, p.y - 720), `第${发.名}发`).toBeLessThan(32);
    }
  });

  it('定格：你、她、树苗、牌子、最大那朵（照片那一帧开到的半径）都在存档图标裁的正中正方形里', () => {
    const 大 = 烟花们[烟花们.length - 1]!;
    const r = 球半径('大球', (照片帧 / fps - 炸开秒(大)) * 20);
    expect(r).toBeGreaterThan(1.5);
    const [bx, by, bz] = 炸点(大);
    const 心 = 投(照片帧, bx, bz, by);
    const k = 16 * 镜头(照片帧).N;
    expect(在图标里(心.x - r * k) && 在图标里(心.x + r * k)).toBe(true);
    expect(心.y - r * k).toBeGreaterThan(0);
    for (const [x, 宽] of [[你站, 0.3], [她站, 0.5], [树苗x, 0.5], [牌字面.x, 0.5]] as const) {
      expect(在图标里(投(照片帧, x - 宽, 1).x), `x ${x}`).toBe(true);
      expect(在图标里(投(照片帧, x + 宽, 1).x), `x ${x}`).toBe(true);
    }
  });

  it('月亮在左上、让开歌词（定格那一镜；天按 天取景 画）', () => {
    const 天 = 天取景(镜头(定格帧));
    const x = 1280 + (夜天弧.心[0] - 天.中心[0]) * 天.每格;
    const y = 720 - (夜天弧.心[1] + 夜天弧.半径 - 天.中心[1]) * 天.每格;
    expect(x).toBeLessThan(600);
    expect(x).toBeGreaterThan(100);
    expect(y).toBeGreaterThan(80);
    expect(y).toBeLessThan(400);
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

  it('你：一直站在 x −1.5 朝西；头两帧拿着树苗，种下换上告示牌、插下去挥手，写字时空手，拉开时换上火箭；放每一发都挥手；照片里仰头', () => {
    expect(你态(起)).toMatchObject({ x: 你站, yaw: 90, 拿: '树苗' });
    expect(你态(起 + 1).拿).toBe('树苗');
    expect(你态(起 + 3).拿).toBe('告示牌');
    expect(你态(起 + 3).挥).toBeGreaterThan(0);
    const 插 = 正片事件.第9句插牌子.帧;
    expect(你态(插 + 1).拿).toBe(null);
    expect(你态(插 + 1).挥).toBeGreaterThan(0);
    expect(你态(Math.floor(镜头段.跟起 * fps)).拿).toBe(null);
    expect(你态(Math.ceil(镜头段.跟起 * fps)).拿).toBe('烟花火箭');
    for (const 发 of 烟花们) expect(你态(Math.ceil(发.发射秒 * fps) + 1).挥).toBeGreaterThan(0);
    for (const f of 帧们) expect(你态(f)).toMatchObject({ x: 你站, yaw: 90 });
    expect(你态(照片帧).拿).toBe('烟花火箭');
    expect(你态(照片帧).头俯仰).toBeGreaterThan(30);
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
  it('每一声都整个落在三段里，三段切出来的截数加起来不少；咔哒的起音落在定格那一帧', () => {
    const 截 = 窗们.flatMap((w) => 本段音效(w));
    for (const 音 of 门口之夜音效) {
      expect(Number.isInteger(音.起帧)).toBe(true);
      expect(音.起帧).toBeGreaterThanOrEqual(起);
      expect(截.some((c) => c.名 === 音.名)).toBe(true);
    }
    const 咔 = 门口之夜音效.find((s) => s.名 === '咔哒')!;
    expect(咔.起帧 + Math.round(0.13 * fps)).toBe(定格帧);
  });
});
