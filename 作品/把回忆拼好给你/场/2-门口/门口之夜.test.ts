import { describe, expect, it } from 'vitest';
import { 加挥手, 挥手进度 } from '@库/角色/挥手.ts';
import { 火箭位置, 烟花火花们, 炸开秒, 炸点, 球半径 } from '@库/特效/烟花.ts';
import { fps, 段窗口, 正片事件, 第几句, 歌曲帧 } from '../../分镜.ts';
import { 本段音效, 门口之夜音效 } from './门口之夜声音.ts';
import { 你态, 她态, 摆设态, 气泡态 } from './门口之夜编排.ts';
import { 亮档, 卡片, 夜天弧, 定格帧, 开场, 开场你站, 烟花们, 牌字面, 照片帧, 照片晚帧, 镜头, 你站, 她站, 推近档, 聊天缩放, 下线图标 } from './门口之夜参数.ts';

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
/** 顶上符文歌词那条（成片像素）：y 77～189、|x| < 3.1 格（N = 10），留点余量 */
const 在歌词条 = (p: { x: number; y: number }) => p.y > 60 && p.y < 200 && Math.abs(p.x - 1280) < 3.1 * 160;

describe('门口之夜的段（第 9–11 句）', () => {
  it('三段首尾相接，从第 9 句首字到第 12 句首字', () => {
    expect(起).toBe(歌曲帧(第几句(9).起));
    expect(止).toBe(歌曲帧(第几句(12).起));
    expect(窗们[0]!.止帧).toBe(窗们[1]!.起帧);
    expect(窗们[1]!.止帧).toBe(窗们[2]!.起帧);
  });

  it('一拍一个字落在第 9 句那段里，照片、碎裂、下线落在最后一段里', () => {
    const 字 = (['写明', '写年', '写六', '写月', '写见'] as const).map((k) => 正片事件[k].帧);
    for (const f of 字) expect(f >= 窗们[0]!.起帧 && f < 窗们[0]!.止帧).toBe(true);
    for (const k of ['第11句照片', '第11句碎裂', '第11句下线'] as const) {
      const f = 正片事件[k].帧;
      expect(f >= 窗们[2]!.起帧 && f < 窗们[2]!.止帧).toBe(true);
    }
    expect(定格帧).toBe(正片事件.第11句照片.帧);
    expect(照片帧).toBe(定格帧 + 照片晚帧);
    expect(摆设态(正片事件.写见.帧).牌上).toBe('明年六月见');
    expect(摆设态(正片事件.写明.帧 - 1).牌上).toBe('');
  });
});

describe('烟花（原版 1.20.1 的走法）', () => {
  it('四发：炸开正好落在分镜的炸开事件上，飞的刻数在原版 Flight 0 的 11～22 刻里；最大那发炸在「绽」上，和咔哒同一帧', () => {
    const 炸事件 = ['第10句烟花一', '第10句烟花二', '第10句烟花三', '第11句大烟花'] as const;
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
    const 咔 = 门口之夜音效.find((s) => s.名 === '咔哒')!;
    expect(大炸.起帧).toBe(定格帧);
    expect(咔.起帧 + Math.round(0.13 * fps)).toBe(定格帧);
  });

  it('35.90「最后一发火箭升空」：那几帧火箭离了地往上蹿，周围一格内别的发只剩快烧完的小火花（spark_0～2，刚炸开的是 spark_7）', () => {
    const 末 = 烟花们[烟花们.length - 1]!;
    const 拍84 = 歌曲帧(35.9);
    for (let f = 拍84 - 1; f <= 拍84 + 2; f++) {
      const p = 火箭位置(末, f / fps)!;
      expect(p, `第 ${f} 帧`).not.toBeNull();
      expect(p[2]).toBeGreaterThan(0.5);
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

  it('照片里最大那发已经开到 1.5 格以上，火花一颗都不在顶上歌词那条里', () => {
    const 大 = 烟花们[烟花们.length - 1]!;
    expect(球半径('大球', (照片帧 / fps - 炸开秒(大)) * 20)).toBeGreaterThan(1.5);
    for (let f = 正片事件.第9句拉回.帧; f <= 照片帧; f++) {
      for (const 发 of 烟花们)
        for (const h of 烟花火花们(发, f / fps)) expect(在歌词条(投(f, h.p[0], h.p[2], h.p[1])), `第 ${f} 帧 第${发.名}发`).toBe(false);
    }
  });

  it('月亮在右上、不在歌词后面（整屏；开场 N 16 那一镜月亮在画外）', () => {
    const 整 = 正片事件.第10句烟花一发射.帧;
    expect(镜头(整).N).toBe(10);
    const p = 投(整, 夜天弧.心[0], 夜天弧.心[1] + 夜天弧.半径, 0);
    expect(在歌词条(p)).toBe(false);
    expect(p.x).toBeGreaterThan(1280 + 3.5 * 160);
    expect(p.y).toBeGreaterThan(0);
  });

  it('闪光亮档：大面积明暗一秒变不到 3 次；定格那一帧正亮在最高档', () => {
    const 亮起: number[] = [];
    for (let f = 起 + 1; f < 止; f++) if (亮档(f / fps).档 > 0 && 亮档((f - 1) / fps).档 === 0) 亮起.push(f);
    for (const f of 亮起) expect(亮起.filter((g) => g >= f && g < f + fps).length).toBeLessThanOrEqual(3);
    expect(亮档(照片帧 / fps).档).toBe(2);
    for (const 发 of 烟花们) expect(炸点(发)[2]).toBeGreaterThan(3.5);
  });
});

describe('镜头：开场 N = 16 → 推到牌子上 → 拉回整屏 N = 10', () => {
  it('每一帧 N、顶面是偶数，中心落在偶数像素上（方块边、地面线都是整像素）', () => {
    for (const f of 帧们) {
      const j = 镜头(f);
      const k = 16 * j.N;
      expect(j.N % 2, `第 ${f} 帧`).toBe(0);
      expect(j.顶面 % 2).toBe(0);
      expect(j.顶面).toBeLessThanOrEqual(j.N);
      const ex = (0.5 + j.中心[0]) * k;
      const ez = j.中心[1] * k;
      expect(Math.abs(ex - Math.round(ex))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ex) % 2)).toBe(0);
      expect(Math.abs(ez - Math.round(ez))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ez) % 2)).toBe(0);
    }
  });

  it('开场同第 8 句的 N 16、地面线，留 0.5 秒以上才推；拉回后是整屏 N = 10；推到底时牌子在画面正中、你在画外', () => {
    expect(镜头(起)).toEqual(开场);
    expect(开场.N).toBe(16);
    expect(正片事件.第9句推近.帧 - 起).toBeGreaterThanOrEqual(0.5 * fps);
    expect(镜头(正片事件.第9句推近.帧 - 1)).toEqual(开场);
    expect(镜头(正片事件.第10句烟花一发射.帧).N).toBe(10);
    for (const f of 帧们) {
      const j = 镜头(f);
      if (j.N !== 推近档[推近档.length - 1]) continue;
      const 牌 = 投(f, 牌字面.x, 牌字面.z, 牌字面.y);
      expect(Math.abs(牌.x - 1280)).toBeLessThan(40);
      expect(Math.abs(牌.y - 720)).toBeLessThan(40);
      // 你侧身站，头最宽 ±0.25 格、帽子层再出 1/32
      expect(投(f, 你态(f).x + 0.29, 1).x, `第 ${f} 帧`).toBeLessThan(0);
    }
    // 第二个字起都在推到底时写上，五个字写全以后留 10 帧再拉回
    for (let f = 正片事件.写年.帧; f < 正片事件.写见.帧 + 10; f++) expect(镜头(f).N, `第 ${f} 帧`).toBe(推近档[推近档.length - 1]);
  });
});

describe('人', () => {
  it('匹配剪进来几帧照第 8 句末态（闭眼歪头），之后睁眼；照片里她仰头看烟花，头转不过 30°（再转帽檐就把脸盖住）', () => {
    expect(她态(起).眨眼).toBe(1);
    expect(她态(起).头).toEqual([12, 30, 14]);
    expect(她态(照片帧).头[0]).toBeGreaterThanOrEqual(15);
    expect(Math.abs(她态(照片帧).头[1])).toBeLessThanOrEqual(30);
    expect(她态(照片帧).头[1] % 90).not.toBe(0);
    expect(气泡态(起)).toBe(1);
    expect(气泡态(正片事件.第9句推近.帧)).toBe(0);
  });

  it('你：开场朝东，头两帧手里拿着树苗，种下后换上告示牌、插下去挥手；放每一发都挥手；照片里拿着火箭仰头', () => {
    expect(你态(起)).toMatchObject({ x: 开场你站, yaw: -90, 拿: '树苗' });
    expect(你态(起 + 2).拿).toBe('告示牌');
    expect(你态(起 + 2).挥).toBeGreaterThan(0);
    const 插 = 正片事件.第9句插牌子.帧;
    expect(你态(插).拿).toBe(null);
    expect(你态(插).挥).toBeGreaterThan(0);
    for (const 发 of 烟花们) expect(你态(Math.ceil(发.发射秒 * fps)).挥).toBeGreaterThan(0);
    expect(你态(正片事件.第9句拉回.帧)).toMatchObject({ x: 你站, yaw: 90, 拿: '烟花火箭' });
    expect(你态(照片帧).拿).toBe('烟花火箭');
    expect(你态(照片帧).头俯仰).toBeGreaterThan(30);
  });

  it('开场这一镜（N 16）：你、树苗、牌子、门里的她都在画里，你和树苗之间隔着 1/4 格以上', () => {
    for (let f = 起; f < 正片事件.第9句推近.帧; f++) {
      for (const x of [开场你站 - 0.29, -5.5, -3.5, -2.5, 她站 + 0.5]) {
        const p = 投(f, x, 1);
        expect(p.x, `第 ${f} 帧 x ${x}`).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(2560);
      }
      // 你朝东侧身：腿、身子 ±0.125 格，胳膊往前伸到 +0.375；树苗贴图左沿 x −5.5
      expect(-5.5 - (开场你站 + 0.375)).toBeGreaterThanOrEqual(0.125);
      expect(-5.5 - (开场你站 + 0.125)).toBeGreaterThanOrEqual(0.25);
    }
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

describe('手机 390 宽', () => {
  it('下线那行聊天字（原版字高 8 个界面像素）缩到 390 宽至少 11 像素高，右沿到不了图标；图标缩到底时让开聊天栏暗底（y 950 起）', () => {
    expect((8 * 聊天缩放 * 390) / 2560).toBeGreaterThanOrEqual(11);
    const 图标左沿 = 1280 - (下线图标.高 * 1440) / 2;
    expect((73 + 12) * 聊天缩放).toBeLessThan(图标左沿);
    const 下 = 正片事件.第11句下线.帧;
    const c = 卡片(下 + 下线图标.缩帧, 2560, 1440);
    expect(c.下).toBe(1);
    expect(c.cy + c.h / 2 + c.下边).toBeLessThanOrEqual(950);
  });
});

describe('声音', () => {
  it('每一声都整个落在三段里，三段切出来的截数加起来不少', () => {
    const 截 = 窗们.flatMap((w) => 本段音效(w));
    for (const 音 of 门口之夜音效) {
      expect(Number.isInteger(音.起帧)).toBe(true);
      expect(音.起帧).toBeGreaterThanOrEqual(起);
      expect(截.some((c) => c.名 === 音.名)).toBe(true);
    }
    // 咔哒的起音落在定格那一帧
    const 咔 = 门口之夜音效.find((s) => s.名 === '咔哒')!;
    expect(咔.起帧 + Math.round(0.13 * fps)).toBe(定格帧);
  });
});
