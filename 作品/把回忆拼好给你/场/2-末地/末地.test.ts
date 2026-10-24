import { describe, expect, it } from 'vitest';
import * as 参 from './参数.ts';
import { 事, 你挥, 你态, 传送粒子们, 原版下落, 帧数, 她态, 摔地帧, 机位, 浪进, 蛋格, 门格们, java随机 } from './编排.ts';

describe('原版算法照搬', () => {
  it('java随机 同 java.util.Random(432).nextFloat()（JDK 8 跑出来的头两个数）', () => {
    const r = java随机(432);
    expect(r()).toBeCloseTo(0.76393366, 7);
    expect(r()).toBeCloseTo(0.8275849, 7);
  });

  it('出口传送门 20 格（5×5 去四角、去中间柱子）', () => {
    expect(门格们.length).toBe(20);
    expect(门格们.some(([i, j]) => i === 0 && j === 0)).toBe(false);
  });

  it('龙蛋只瞬移一次，128 颗传送粒子', () => {
    expect(传送粒子们.length).toBe(128);
  });
});

describe('第 5 句的时间线（用户 10-24「画面转太快就删」：只留扑龙蛋扑空一件事）', () => {
  it('伏着扭屁股 → 扑起 → 落在蛋上 → 照片 → 你点 → 她摔趴 → 坐起，都在段里', () => {
    const 序 = ['扭屁股', '扑起', '落蛋', '照片-扑龙蛋', '点龙蛋', '扑空', '坐起'];
    const 帧 = 序.map((k) => (事 as Record<string, number>)[k]);
    for (const f of 帧) expect(f).toBeTypeOf('number');
    for (let i = 1; i < 帧.length; i++) expect(帧[i]!).toBeGreaterThan(帧[i - 1]!);
    expect(事.坐起).toBeLessThan(帧数 - 1);
  });

  it('每个动作至少停 1 秒左右看得清：坐起来噘嘴一直到段尾超过 1 秒；扑之前伏着扭屁股超过半秒', () => {
    expect((帧数 - 事.坐起) / 24).toBeGreaterThan(1);
    expect((事.扑起 - 事.扭屁股) / 24).toBeGreaterThan(0.5);
  });

  it('她在蛋上抱住至少 8 帧（核查 10-24：原来 3 帧，手机上看不出抓到了）；照片那一帧她在蛋上、蛋还在原处', () => {
    expect(事.点龙蛋 - 事.落蛋).toBeGreaterThanOrEqual(8);
    expect(事['照片-扑龙蛋']).toBeGreaterThanOrEqual(事.落蛋 + 参.落地弹帧);
    expect(事['照片-扑龙蛋']).toBeLessThan(事.点龙蛋);
    expect(蛋格(事['照片-扑龙蛋'])).toEqual(参.蛋位们.起);
  });

  it('扑空（分镜.ts）和照原版重力算出来的落地差不到一帧；落地前她一直在往下掉', () => {
    expect(Math.abs(摔地帧 - 事.扑空)).toBeLessThan(1);
    expect(原版下落(1)).toBeCloseTo(0, 9);
    for (let t = 1; t < 6; t++) expect(原版下落(t + 1)).toBeGreaterThan(原版下落(t));
  });

  it('你的手比蛋先动（核查 10-24：原来蛋先没、手后动），蛋瞬移那帧还在挥；整句只挥这一下', () => {
    expect(你挥(事.点龙蛋 - 1)).not.toBeNull();
    expect(你挥(事.点龙蛋)).not.toBeNull();
    expect(你挥(事.点龙蛋 - 3)).toBeNull();
    let 挥帧 = 0;
    for (let f = 0; f < 帧数; f++) if (你挥(f) !== null) 挥帧++;
    expect(挥帧).toBeLessThanOrEqual(Math.ceil((参.挥手刻 / 20) * 24) + 1);
  });

  it('你整句站在原地不动', () => {
    for (let f = 0; f < 帧数; f++) expect(你态(f).loc).toEqual(参.你.位);
  });

  it('坐起以后她一直坐着噘嘴，到段尾不变', () => {
    for (let f = Math.ceil(事.坐起); f < 帧数; f++) {
      const s = 她态(f);
      expect(s.姿势).toBe('坐');
      expect(s.表情).toBe('难过');
    }
  });

  it('蛋：点之前在 起、点完在 一；两处都不在传送门上', () => {
    expect(蛋格(事.点龙蛋 - 1)).toEqual(参.蛋位们.起);
    expect(蛋格(事.点龙蛋)).toEqual(参.蛋位们.一);
    for (const [x, y] of Object.values(参.蛋位们)) expect(门格们.some(([i, j]) => i === x && j === y)).toBe(false);
  });

  it('机位从段首一路推到段尾', () => {
    expect(机位(0).眼).toEqual(参.机位.眼起);
    expect(机位(0).看).toEqual(参.机位.看起);
    for (let k = 0; k < 3; k++) expect(机位(帧数 - 1).眼[k]).toBeCloseTo(参.机位.眼止[k]!, 9);
    const 推 = (f: number) => Math.hypot(...机位(f).眼.map((v, k) => v - 参.机位.眼止[k]!));
    for (let f = 1; f < 帧数; f++) expect(推(f)).toBeLessThanOrEqual(推(f - 1) + 1e-9);
  });

  it('开头接第 4 句那道浪：段首盖满（进 1），照涌上来的速度退完（进 2），退完以后不再动', () => {
    expect(浪进(0)).toBe(1);
    for (let f = 1; f < 帧数; f++) expect(浪进(f)).toBeGreaterThanOrEqual(浪进(f - 1));
    expect(浪进(帧数 - 1)).toBe(2);
    // 浪一程 16 帧左右，她扑起来之前已经退完，扑这一下整个看得见
    expect(浪进(事.扑起 - 1)).toBe(2);
  });
});
