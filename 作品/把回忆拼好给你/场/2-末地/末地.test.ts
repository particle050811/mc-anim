import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 做透视相机, Z朝上转three } from '@库/界面/投影.ts';
import { 画幅 } from '../../分镜.ts';
import { java随机, 死亡光束 } from './光束.ts';
import { 拆经验, 球图标 } from './经验球.ts';
import * as 参 from './参数.ts';
import { 事, 你挥, 传送粒子们, 原版下落, 帧数, 摔地帧, 死刻, 气泡态, 经验球们, 蛋格, 转场进度, 门格们, 机位, 龙位 } from './编排.ts';

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

  it('死亡光束画在龙模型那层姿势里：光束中心在龙位上方 2.501、往龙身后 1 格，跟着朝向绕竖轴转', () => {
    const 中心们 = (朝向: number) => {
      const 束 = 死亡光束(170, 朝向)!;
      const r: number[][] = [];
      for (let i = 0; i < 束.权.length; i++) if (束.权[i] === 1) r.push([束.位[i * 3]!, 束.位[i * 3 + 1]!, 束.位[i * 3 + 2]!]);
      return r;
    };
    // 原版 (0, 2.501, −1) 转 Y −朝向，换成场景 (x, −z, y)：朝向 0 → (0, 1, 2.501)，朝向 90 → (1, 0, 2.501)
    for (const [朝向, 应] of [[0, [0, 1, 2.501]], [90, [1, 0, 2.501]]] as const) {
      const 们 = 中心们(朝向);
      expect(们.length).toBeGreaterThan(0);
      for (const c of 们) c.forEach((v, k) => expect(v).toBeCloseTo(应[k]!, 4));
    }
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
  it('伏着扭屁股 → 扑起 → 落在蛋上 → 照片 → 你点 → 你蹲、她摔趴 → 坐起 → 她看蛋 → 再点', () => {
    const 序 = ['扭屁股', '扑起', '落蛋', '照片-扑龙蛋', '点龙蛋', '蹲一', '扑空', '起一', '坐起', '起二', '她看蛋', '再点龙蛋'];
    const 帧 = 序.map((k) => (事 as Record<string, number>)[k]);
    for (const f of 帧) expect(f).toBeTypeOf('number');
    for (let i = 1; i < 帧.length; i++) expect(帧[i]!).toBeGreaterThan(帧[i - 1]!);
    expect(事.再点龙蛋).toBeLessThan(帧数 - 1);
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

  it('你的手比蛋先动（核查 10-24：原来蛋先没、手后动），蛋瞬移那帧还在挥', () => {
    for (const e of [事.点龙蛋, 事.再点龙蛋]) {
      expect(你挥(e - 1)).not.toBeNull();
      expect(你挥(e)).not.toBeNull();
      expect(你挥(e - 3)).toBeNull();
    }
  });

  it('蛋：点之前在 起、点完在 一、再点在 二；三处都不在传送门上，二 在镜头背后', () => {
    expect(蛋格(事.点龙蛋 - 1)).toEqual(参.蛋位们.起);
    expect(蛋格(事.点龙蛋)).toEqual(参.蛋位们.一);
    expect(蛋格(事.再点龙蛋)).toEqual(参.蛋位们.二);
    for (const [x, y] of Object.values(参.蛋位们)) expect(门格们.some(([i, j]) => i === x && j === y)).toBe(false);
    expect(参.蛋位们.二[1]).toBeLessThan(Math.min(参.机位.眼起[1], 参.机位.眼止[1]));
  });

  it('死亡光束：歌词那一行里最多亮到满亮的四分之一（核查 10-24：原来亮的光束压在符文后面），不从人前面过、不扫到人站的那一带', () => {
    /** 符文歌词那一行在页面上的范围（2-抢龙蛋 静帧量的字框，四周放 10 像素） */
    const 歌词行 = { x0: 256, x1: 1021, y0: 28, y1: 104 };
    const { 宽, 高 } = 画幅;
    const 采 = 12;
    let 查过 = 0;
    for (let f = 0; f < 帧数; f += 3) {
      const t = 死刻(f);
      const 束 = 死亡光束(t, 参.龙朝向);
      if (!束) continue;
      const 机 = 机位(f);
      const cam = 做透视相机({ 眼: Z朝上转three(机.眼), 看: Z朝上转three(机.看), 视角: 机.视角, 宽, 高 });
      const 投 = (p: readonly [number, number, number]) => {
        const v = new THREE.Vector3(...Z朝上转three(p));
        const 深 = -v.clone().applyMatrix4(cam.matrixWorldInverse).z;
        v.project(cam);
        return { x: ((v.x + 1) / 2) * 宽, y: ((1 - v.y) / 2) * 高, 深 };
      };
      // 她（伏、扑、蛋上、坐都在 x 2～6.6）、你（x 6.9～7.9）站的那条线在画面上的框和离镜头多远
      const 人框们 = [[2, 6.6], [6.9, 7.9]].map(([x0, x1]) => {
        const ps = [x0!, x1!].flatMap((x) => [0, 1.8].map((z) => 投([x, 参.你.位[1], z])));
        return { x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)), 深: Math.min(...ps.map((p) => p.深)) };
      });
      const 龙 = 龙位(t);
      for (let i = 0; i < 束.位.length; i += 9)
        for (let a = 0; a <= 采; a++)
          for (let b = 0; a + b <= 采; b++) {
            const u = a / 采, v = b / 采, w0 = 1 - u - v;
            const 权 = w0 * 束.权[i / 3]! + u * 束.权[i / 3 + 1]! + v * 束.权[i / 3 + 2]!;
            if (权 <= 0) continue;
            const p = [0, 1, 2].map((k) => w0 * 束.位[i + k]! + u * 束.位[i + 3 + k]! + v * 束.位[i + 6 + k]! + 龙[k]!) as [number, number, number];
            if (p[2] < 0) continue; // 地底下，被地挡住
            expect(p[2] < 3.2 && p[1] < 参.你.位[1] + 1.5 && Math.abs(p[0] - 5) < 10, `第 ${f} 帧光束扫到人站的那一带`).toBe(false);
            const q = 投(p);
            if (q.深 <= 0 || q.x < 0 || q.x >= 宽 || q.y < 0 || q.y >= 高) continue;
            查过++;
            // 画出来的透明度：按色阶往上取整，再乘中心透明（同 死亡光束.tsx 的着色器）
            const 透明 = (Math.ceil(权 * 参.光束色阶 - 0.001) / 参.光束色阶) * 束.中心透明;
            if (q.x >= 歌词行.x0 && q.x <= 歌词行.x1 && q.y >= 歌词行.y0 && q.y <= 歌词行.y1) expect(透明, `第 ${f} 帧歌词那一行里的光束`).toBeLessThanOrEqual(0.25);
            for (const 框 of 人框们) expect(q.x >= 框.x0 && q.x <= 框.x1 && q.y >= 框.y0 && q.y <= 框.y1 && q.深 < 框.深, `第 ${f} 帧光束在人前面`).toBe(false);
          }
    }
    expect(查过).toBeGreaterThan(1000);
  });

  it('气泡坐起来才有，之后一直在', () => {
    expect(气泡态(事.坐起 - 1)).toBeNull();
    for (let f = 事.坐起; f < 帧数; f++) expect(气泡态(f)?.字).toBe(参.气泡字);
  });

  it('龙在段里死透（第 200 刻以后光束没了）', () => {
    expect(死刻(0)).toBeLessThan(200);
    expect(死刻(帧数 - 1)).toBeGreaterThan(200);
    expect(死亡光束(死刻(帧数 - 1))).toBeNull();
  });

  it('经验球段里看得见、一颗也没被你吃到（段.ts：这一句没有吃经验的声音）；第 12 帧起画面里一直有球（核查 10-24：原来前 40 帧几乎看不见）', () => {
    let 最多 = 0;
    for (let f = 0; f < 帧数; f++) {
      const 球们 = 经验球们(f);
      最多 = Math.max(最多, 球们.length);
      for (const b of 球们) expect(b.被吃).toBeNull();
      if (f < 12) continue;
      const 机 = 机位(f);
      const cam = 做透视相机({ 眼: Z朝上转three(机.眼), 看: Z朝上转three(机.看), 视角: 机.视角, 宽: 画幅.宽, 高: 画幅.高 });
      const 画里 = 球们.filter((b) => {
        const v = new THREE.Vector3(...Z朝上转three(b.位)).project(cam);
        return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1;
      });
      expect(画里.length, `第 ${f} 帧画面里的经验球`).toBeGreaterThan(0);
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
