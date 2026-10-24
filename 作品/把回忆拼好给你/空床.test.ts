import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-空床/段.ts';
import { 光档, 光态, 她态, 她色调, 帧数, 抚平姿, 末帧速度, 镜, 下沉进度, 事, 转身起 } from './段/2-空床/编排.ts';
import { fps, 正片事件, 段窗口, 第几句 } from './分镜.ts';
import { 侧投影 } from './地点/侧剖面.tsx';
import { 卧室, 卧室墙 } from './地点/小木屋卧室布局.ts';
import * as 参 from './场/2-卧室/参数.ts';
import { 坐床沿骨骼, 抚平手位 } from './场/2-卧室/姿势.ts';
import { 光斑, 卧室受光面, 卧室开口 } from './场/2-卧室/光斑.ts';
import { 正片原声增益 } from './配乐/正片.ts';
import { 床面高 } from './物品/床尺寸.ts';

describe('2-空床：第 12 句卧室整句一个镜头', () => {
  it('窗口从第 12 句首字到第 13 句前导（歌曲帧 922～998），段尾就是分屏起', () => {
    const w = 段窗口('2-空床');
    expect([w.起帧, w.止帧]).toEqual([922, 998]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(12).起, 1);
    expect(段.帧数).toBe(76);
    expect(帧数).toBe(76);
    expect(段.场窗口).toEqual({ 起帧: 922, 止帧: 998 });
    expect(正片事件.分屏起.帧).toBe(998);
  });

  it('三稿的时刻：抚平 38.46、坐床沿 39.31、天亮转头 41.01（差不到半帧）；事件按顺序、都在段里', () => {
    for (const [e, 秒] of [[正片事件.抚平被子, 38.46], [正片事件.坐床沿, 39.31], [正片事件.天亮转头, 41.01]] as const)
      expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
    const 序 = [事.抚平被子, 事.坐床沿, 事.窗光二, 事.窗光三, 事.月落, 事.天亮转头, 事.下沉起];
    expect([...序].sort((a, b) => a - b)).toEqual(序);
    expect(序[0]).toBeGreaterThanOrEqual(0);
    expect(序.at(-1)).toBeLessThan(帧数);
  });

  it('cue：只有原声，铺满整段、固定增益、不淡', () => {
    const 声 = 段.声音 as 资产cue[];
    expect(声).toHaveLength(1);
    expect(声[0]).toMatchObject({ 帧: 0, 帧数: 76, 入点秒: 922 / 24, 增益: 正片原声增益, 资产: '配乐/把回忆拼好给你-抖音原声' });
  });

  it('抚平：手心落在你床的被面上（反解再正算回去，差不到 0.01 格），手伸出去离脚底 0.3 格以上（手在她身子外面），抹的幅度手机上看得出（0.25 格以上）', () => {
    const 朝 = ((参.抚平朝向 + 90) * Math.PI) / 180;
    const xs: number[] = [];
    for (let f = 0; f < 转身起; f++) {
      const [前, 高] = 抚平手位(抚平姿(f));
      expect(高).toBeCloseTo(床面高, 2);
      expect(前).toBeGreaterThan(0.3);
      const x = 参.抚平站位[0] + 前 * Math.cos(朝), y = 参.抚平站位[1] + 前 * Math.sin(朝);
      expect(x).toBeGreaterThan(卧室.你的床.位[0] - 0.5);
      expect(x).toBeLessThan(卧室.你的床.位[0] + 0.5);
      expect(y).toBeGreaterThan(1);
      xs.push(x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.25);
    // 尾巴压下来（比腰弯多压 抚平尾压 度），不和上身连成横着的一条
    const 骨 = 抚平姿(0);
    expect((骨.Tail!.rot as number[])[0]).toBeCloseTo(-(骨.UpBody!.rot as number[])[0]! - 参.抚平尾压, 6);
  });

  it('转身、坐下：骨骼一帧一帧插过去，不在一帧里弹直（腰、胸每帧变不到 20°，尾巴、胳膊、腿不到 50°，朝向不到 45°）', () => {
    const rx = (f: number, b: string) => ((她态(f).骨骼[b]?.rot as number[] | undefined)?.[0] ?? 0);
    for (let f = 转身起; f <= 事.坐床沿; f++) {
      for (const b of ['UpBody', 'UpperBody']) expect(Math.abs(rx(f, b) - rx(f - 1, b))).toBeLessThan(20);
      for (const b of ['Tail', 'RightArm', 'RightForeArm', 'RightLeg', 'LeftLeg', 'RightLowerLeg']) expect(Math.abs(rx(f, b) - rx(f - 1, b))).toBeLessThan(50);
      expect(Math.abs(她态(f).yaw - 她态(f - 1).yaw)).toBeLessThan(45);
      const [a, b] = [她态(f).loc, 她态(f - 1).loc];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.2);
    }
  });

  it('坐床沿到天亮转头之前一动不动；天亮那一拍两帧里转去看门口（过头一帧再回来），上身一挺，表情惊讶', () => {
    const 定 = JSON.stringify(她态(事.坐床沿));
    for (let f = 事.坐床沿; f < 事.天亮转头; f++) expect(JSON.stringify(她态(f))).toBe(定);
    const 坐 = 她态(事.坐床沿);
    expect(坐.骨骼).toBe(坐床沿骨骼);
    expect(((坐.yaw % 360) + 360) % 360).toBe(参.坐朝向);
    expect(坐.看).toEqual(参.守夜看);
    expect(坐.表情).toBe('无');
    expect(她态(事.天亮转头 + 参.转头帧 - 1).看).toEqual(参.看门口过头);
    expect(她态(事.天亮转头 + 参.转头帧).看).toEqual(参.看门口);
    expect(她态(帧数 - 1).看).toEqual(参.看门口);
    for (let f = 事.天亮转头; f < 帧数; f++) expect(她态(f).表情).toBe('惊讶');
    const 挺 = (f: number) => (她态(f).骨骼.UpperBody!.rot as number[])[0];
    expect(挺(事.天亮转头 + 参.转头帧 - 1)).toBe(参.转头上身挺过头);
    expect(挺(帧数 - 1)).toBe(参.转头上身挺);
    // 身子朝门：门洞中心 (0, 0.5) 在她的朝向 ±10° 里
    const [x, y] = 参.床沿坐位;
    const 门向 = (Math.atan2(-(0 - x), 0.5 - y) * 180) / Math.PI;
    expect(Math.abs(门向 - 参.坐朝向)).toBeLessThan(10);
  });

  it('她的色调比屋里亮（往白里提 她提亮），夜里也分得出她和墙', () => {
    const 屋 = 光态(0).调子.色调;
    const 拆 = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [a, b] = [拆(屋), 拆(她色调(屋))];
    for (let i = 0; i < 3; i++) expect(b[i]! - a[i]!).toBeCloseTo((255 - a[i]!) * 参.她提亮, -0.5);
  });

  it('窗光：月光三档、月落一档没有、天亮一档，档在拍上跳；月光一档地板、二档被面、三档后墙，一档比一档往右、往里；天亮门口那束落在她脚前的地板上', () => {
    expect([0, 事.窗光二 - 1, 事.窗光二, 事.窗光三, 事.月落, 事.天亮转头 - 1, 事.天亮转头, 帧数 - 1].map(光档)).toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
    expect(光态(事.月落).光).toEqual([]);
    expect([0, 1, 2, 3, 4].map((i) => 参.窗光档们[i]!.length)).toEqual([1, 1, 1, 0, 2]);
    expect([0, 事.月落, 事.天亮转头 - 1, 事.天亮转头, 帧数 - 1].map((f) => 光态(f).门外亮)).toEqual([false, false, false, true, true]);
    /** 一束光在各受光面上的面积（格²）和场景里的重心 [x, y] */
    const 量 = (b: 参.光束) => {
      const 面积: Record<string, number> = {};
      let s = 0, sx = 0, sy = 0;
      for (const 面 of 卧室受光面)
        for (const c of 光斑(面, b.方向, 卧室开口[b.从])) {
          const A = (c.a1 - c.a0) * (c.b1 - c.b0);
          面积[面.名] = (面积[面.名] ?? 0) + A;
          s += A;
          sx += ((c.a0 + c.a1) / 2) * A;
          sy += (面.种 === '平' ? (c.b0 + c.b1) / 2 : 面.y) * A;
        }
      return { 面积, s, x: sx / s, y: sy / s };
    };
    const 主 = (m: Record<string, number>) => Object.entries(m).sort((p, q) => q[1] - p[1])[0]![0];
    const [一, 二, 三] = [0, 1, 2].map((i) => 量(参.窗光档们[i]![0]!));
    expect(主(一!.面积)).toBe('地板');
    expect(['你床面', '女仆床面']).toContain(主(二!.面积));
    expect(主(三!.面积)).toBe('后墙');
    for (const m of [一!, 二!, 三!]) expect(m.s).toBeGreaterThan(0.7);
    expect(一!.x).toBeLessThan(二!.x);
    expect(二!.x).toBeLessThan(三!.x);
    expect(一!.y).toBeLessThan(三!.y);
    const 门束 = 参.窗光档们[4]!.find((b) => b.从 === '门')!;
    const 门 = 量(门束);
    expect(门.面积.地板 ?? 0).toBeGreaterThan(0.3);
    expect(门.x).toBeLessThan(参.床沿坐位[0]);
    // 光斑都在受光面里，不落进后墙的窗洞
    for (const 档 of 参.窗光档们)
      for (const b of 档)
        for (const 面 of 卧室受光面)
          for (const 条 of 光斑(面, b.方向, 卧室开口[b.从])) {
            expect(条.a0).toBeGreaterThanOrEqual(面.x[0] - 1e-9);
            expect(条.a1).toBeLessThanOrEqual(面.x[1] + 1e-9);
            if (面.名 === '后墙') {
              const [i, k] = 卧室.后窗;
              const 进窗 = 条.a1 > i - 0.5 && 条.a0 < i + 0.5 && 条.b1 > k && 条.b0 < k + 1;
              expect(进窗).toBe(false);
            }
          }
  });

  it('镜头：下沉起之前不动，段尾最后一帧走完、还在加速；取景中心落在成片偶数像素上；最后一帧屋里的东西（地面线往上）全出画', () => {
    for (let f = 0; f < 事.下沉起; f++) expect(镜(f)).toEqual(镜(0));
    expect(下沉进度(事.下沉起 - 1)).toBe(0);
    expect(下沉进度(帧数 - 1)).toBe(1);
    const 步 = (f: number) => 下沉进度(f) - 下沉进度(f - 1);
    for (let f = 事.下沉起 + 1; f < 帧数; f++) expect(步(f)).toBeGreaterThan(步(f - 1));
    const 离整 = (x: number) => Math.abs(x - Math.round(x));
    for (let f = 0; f < 帧数; f++) for (const v of 镜(f).中心) expect(离整((v * 镜(f).每格) / 2)).toBeLessThan(1e-6);
    const 末 = 镜(帧数 - 1), 前 = 镜(帧数 - 2);
    const v = 末帧速度();
    // 最后两帧之间实际挪的，和段尾的瞬时速度（二次方的导数）差不到一成
    expect((前.中心[1] - 末.中心[1]) / v.下).toBeGreaterThan(0.9);
    expect((末.中心[0] - 前.中心[0]) / v.右).toBeGreaterThan(0.9);
    // 剖面上 y = 0、z = 0 的地面线（屋里最低、离镜头最近的一点）在画面上沿之外；开头那帧在画面里
    const 投 = (取: typeof 末) => 侧投影(取, 1280, 720, 参.卧室顶面);
    expect(投(末)(卧室墙.西墙, 0, 0).y).toBeLessThan(0);
    expect(投(镜(0))(卧室墙.西墙, 0, 0).y).toBeGreaterThan(600);
    expect(投(镜(0))(卧室墙.西墙, 0, 0).y).toBeLessThan(720);
    // 开头那帧：门板（x −1.5）的右沿、后窗都在画面里
    expect(投(镜(0))(卧室.门.开着的门板.x1, 1).x).toBeGreaterThan(0);
    expect(投(镜(0))(卧室.后窗[0] + 0.5, 卧室.后窗[1] + 1, 卧室墙.后墙).x).toBeLessThan(1280);
    expect(投(镜(0))(卧室.后窗[0], 卧室.后窗[1] + 1, 卧室墙.后墙).y).toBeGreaterThan(0);
  });
});
