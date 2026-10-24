import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-空床/段.ts';
import { 光档, 光态, 她态, 帧数, 抚平姿, 末帧速度, 镜, 下沉进度, 事, 转身起 } from './段/2-空床/编排.ts';
import { fps, 正片事件, 段窗口, 第几句 } from './分镜.ts';
import { 卧室 } from './地点/小木屋卧室布局.ts';
import * as 参 from './场/2-卧室/参数.ts';
import { 坐床沿骨骼, 抚平手位 } from './场/2-卧室/姿势.ts';
import { 光斑, 卧室受光面 } from './场/2-卧室/光斑.ts';
import { 原声增益 } from './场/1-隐世之境一楼/参数.ts';
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
    expect(声[0]).toMatchObject({ 帧: 0, 帧数: 76, 入点秒: 922 / 24, 增益: 原声增益, 资产: '配乐/把回忆拼好给你-抖音原声' });
  });

  it('抚平：手心落在你床的被面上（反解再正算回去，差不到 0.01 格），抹的时候手在 x 2.6～2.85 之间来回', () => {
    const 朝 = ((参.抚平朝向 + 90) * Math.PI) / 180;
    const xs: number[] = [];
    for (let f = 0; f < 转身起; f++) {
      const [前, 高] = 抚平手位(抚平姿(f));
      expect(高).toBeCloseTo(床面高, 2);
      const x = 参.抚平站位[0] + 前 * Math.cos(朝), y = 参.抚平站位[1] + 前 * Math.sin(朝);
      expect(x).toBeGreaterThan(卧室.你的床.位[0] - 0.5);
      expect(x).toBeLessThan(卧室.你的床.位[0] + 0.5);
      expect(y).toBeGreaterThan(1);
      xs.push(x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.15);
  });

  it('坐床沿到天亮转头之前一动不动，天亮那一拍两帧里转去看门口', () => {
    const 定 = JSON.stringify(她态(事.坐床沿));
    for (let f = 事.坐床沿; f < 事.天亮转头; f++) expect(JSON.stringify(她态(f))).toBe(定);
    const 坐 = 她态(事.坐床沿);
    expect(坐.骨骼).toBe(坐床沿骨骼);
    expect(((坐.yaw % 360) + 360) % 360).toBe(参.坐朝向);
    expect(坐.看).toEqual(参.守夜看);
    expect(她态(事.天亮转头 + 参.转头帧 - 1).看).toEqual(参.看门口);
    expect(她态(帧数 - 1).看).toEqual(参.看门口);
  });

  it('窗光：月光三档、月落一档没有、天亮一档，档在拍上跳；后墙上的光斑一档比一档往右，天亮落在门口那边', () => {
    expect([0, 事.窗光二 - 1, 事.窗光二, 事.窗光三, 事.月落, 事.天亮转头 - 1, 事.天亮转头, 帧数 - 1].map(光档)).toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
    expect(光态(事.月落).光).toBeNull();
    const 后墙 = 卧室受光面.find((m) => m.名 === '后墙')!;
    const 中x = (档: number) => {
      const 条 = 光斑(后墙, 参.窗光档们[档]!.方向);
      expect(条.length).toBeGreaterThan(0);
      const 面积 = 条.reduce((s, c) => s + (c.a1 - c.a0) * (c.b1 - c.b0), 0);
      expect(面积).toBeGreaterThan(0.7);
      return 条.reduce((s, c) => s + ((c.a0 + c.a1) / 2) * (c.a1 - c.a0) * (c.b1 - c.b0), 0) / 面积;
    };
    const [a, b, c, 晓] = [中x(0), 中x(1), 中x(2), 中x(4)];
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(晓).toBeLessThan(2);
    // 光斑不落进后墙的窗洞，都在受光面里
    for (const 档 of 参.窗光档们) {
      if (!档) continue;
      for (const 面 of 卧室受光面)
        for (const 条 of 光斑(面, 档.方向)) {
          expect(条.a0).toBeGreaterThanOrEqual(面.x[0] - 1e-9);
          expect(条.a1).toBeLessThanOrEqual(面.x[1] + 1e-9);
          if (面.名 === '后墙') {
            const [i, k] = 卧室.后窗;
            const 进窗 = 条.a1 > i - 0.5 && 条.a0 < i + 0.5 && 条.b1 > k && 条.b0 < k + 1;
            expect(进窗).toBe(false);
          }
        }
    }
  });

  it('镜头：下沉起之前不动，段尾最后一帧走完、还在加速；取景中心落在成片偶数像素上', () => {
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
  });
});
