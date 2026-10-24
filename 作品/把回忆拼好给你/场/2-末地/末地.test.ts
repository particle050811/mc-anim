import { describe, expect, it } from 'vitest';
import { java随机, 死亡光束 } from './光束.ts';
import { 拆经验, 球图标 } from './经验球.ts';
import * as 参 from './参数.ts';
import { 事, 传送粒子们, 帧数, 她头位, 你眼, 死刻, 经验球们, 蛋格, 转场进度, 门格们, 机位 } from './编排.ts';

describe('原版算法照搬', () => {
  it('java随机 同 java.util.Random(432).nextFloat()（JDK 8 跑出来的头两个数）', () => {
    const r = java随机(432);
    expect(r()).toBeCloseTo(0.76393366, 7);
    expect(r()).toBeCloseTo(0.8275849, 7);
  });

  it('死亡光束：0 刻和 200 刻以后没有；条数 = 满足 i < (进度 + 进度²)/2 × 60 的 i 个数', () => {
    expect(死亡光束(0)).toBeNull();
    expect(死亡光束(200)).toBeNull();
    for (const t of [40, 100, 170, 199]) {
      const p = t / 200;
      expect(死亡光束(t)!.条数).toBe(Math.ceil(((p + p * p) / 2) * 60));
    }
    // 过了 0.8 才开始淡：160 刻中心还不透明，199 刻快没了
    expect(死亡光束(160)!.中心透明).toBe(1);
    expect(死亡光束(199)!.中心透明).toBeLessThan(0.05);
  });

  it('经验：一把 960 拆成 617 + 307 + 17 + 17 + 1 + 1；图标档', () => {
    expect(拆经验(960)).toEqual([617, 307, 17, 17, 1, 1]);
    expect(拆经验(2400).reduce((a, b) => a + b, 0)).toBe(2400);
    expect([1, 3, 17, 617, 2477].map(球图标)).toEqual([0, 1, 3, 8, 10]);
  });

  it('出口传送门 20 格（5×5 去四角、去中间柱子）', () => {
    expect(门格们.length).toBe(20);
    expect(门格们.some(([i, j]) => i === 0 && j === 0)).toBe(false);
  });

  it('龙蛋两次瞬移各 128 颗传送粒子', () => {
    expect(传送粒子们.length).toBe(256);
  });
});

describe('第 5 句的时间线', () => {
  it('伏着扭屁股 → 扑起 → 照片（半空）→ 落蛋抱住 → 你点 → 扑空 → 蹲起 → 她看蛋 → 再点', () => {
    const 序 = ['扭屁股', '扑起', '照片-扑龙蛋', '落蛋', '点龙蛋', '扑空', '蹲一', '抬头看你', '蹲二', '起二', '她看蛋', '再点龙蛋'];
    const 帧 = 序.map((k) => (事 as Record<string, number>)[k]);
    for (const f of 帧) expect(f).toBeTypeOf('number');
    for (let i = 1; i < 帧.length; i++) expect(帧[i]!).toBeGreaterThan(帧[i - 1]!);
    expect(事.再点龙蛋).toBeLessThan(帧数 - 1);
  });

  it('照片那一帧她在半空、蛋还在原处', () => {
    expect(事['照片-扑龙蛋']).toBeGreaterThan(事.扑起);
    expect(事['照片-扑龙蛋']).toBeLessThan(事.落蛋);
    expect(蛋格(事['照片-扑龙蛋'])).toEqual(参.蛋位们.起);
  });

  it('蛋：点之前在 起、点完在 一、再点在 二；三处都不在传送门上，二 在镜头背后', () => {
    expect(蛋格(事.点龙蛋 - 1)).toEqual(参.蛋位们.起);
    expect(蛋格(事.点龙蛋)).toEqual(参.蛋位们.一);
    expect(蛋格(事.再点龙蛋)).toEqual(参.蛋位们.二);
    for (const [x, y] of Object.values(参.蛋位们)) expect(门格们.some(([i, j]) => i === x && j === y)).toBe(false);
    expect(参.蛋位们.二[1]).toBeLessThan(Math.min(参.机位.眼起[1], 参.机位.眼止[1]));
  });

  it('扑出去以后她只抬头不转头（编排.ts 抬头）：要看的蛋（起；她看蛋以后一直盯着 一）、你都在她正前方 35° 以内', () => {
    const y = (参.她.趴朝向 * Math.PI) / 180;
    const 前 = [-Math.sin(y), Math.cos(y)];
    for (let f = 事.扑起; f < 帧数; f++) {
      const 头 = 她头位(f);
      const 看们 = f < 事.抬头看你 ? [参.蛋位们.起] : f < 事.她看蛋 ? [] : [参.蛋位们.一];
      const 点们 = [...看们.map((c) => [c[0] + 0.5, c[1] + 0.5]), ...(f >= 事.抬头看你 && f < 事.她看蛋 ? [你眼(f)] : [])];
      for (const 点 of 点们) {
        const dx = 点[0]! - 头[0], dy = 点[1]! - 头[1];
        const 偏 = (Math.abs(Math.atan2(-dx * 前[1]! + dy * 前[0]!, dx * 前[0]! + dy * 前[1]!)) * 180) / Math.PI;
        expect(偏).toBeLessThan(35);
      }
    }
  });

  it('龙在段里死透（第 200 刻以后光束没了）', () => {
    expect(死刻(0)).toBeLessThan(200);
    expect(死刻(帧数 - 1)).toBeGreaterThan(200);
    expect(死亡光束(死刻(帧数 - 1))).toBeNull();
  });

  it('经验球段里看得见、一颗也没被你吃到（段.ts：这一句没有吃经验的声音）', () => {
    let 最多 = 0;
    for (let f = 0; f < 帧数; f++) {
      const 球们 = 经验球们(f);
      最多 = Math.max(最多, 球们.length);
      for (const b of 球们) expect(b.被吃).toBeNull();
    }
    expect(最多).toBeGreaterThan(0);
  });

  it('转场：再点那一帧 0、段尾盖满；机位从段首推到再点那一帧停住', () => {
    expect(转场进度(事.再点龙蛋)).toBe(0);
    expect(转场进度(帧数 - 1)).toBe(1);
    expect(机位(0).眼).toEqual(参.机位.眼起);
    expect(机位(0).看).toEqual(参.机位.看起);
    for (const f of [事.再点龙蛋, 帧数 - 1]) {
      expect(机位(f).眼).toEqual(参.机位.眼止);
      expect(机位(f).看).toEqual(参.机位.看止);
    }
  });
});
