import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 摇铃段 from './段/2-摇铃/段.ts';
import 重逢段 from './段/2-重逢/段.ts';
import { fps, 段内正片事件帧, 段窗口, 正片事件 } from './分镜.ts';
import { 正片原声增益 } from './配乐/正片.ts';
import { 樱花风默认, 风墙沿, 风墙盖满 } from './特效/樱花风参数.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 铃声, 铃声文件, 风 } from './场/2-门口/第15句声音.ts';
import { 推门声 } from './场/2-隐世之境/重逢声音.ts';

const 事 = 正片事件;
const 风时刻 = { 起: 事.摇铃.秒, 满: 事.风散开.秒 };
const 秒 = (歌曲帧: number) => 歌曲帧 / fps;
const 找 = (段: typeof 摇铃段, 名: string) => 段.声音?.find((c): c is 资产cue => c.资产 !== undefined && c.名 === 名);

describe('正片第 15 句：两段的窗口和事件', () => {
  it('2-摇铃 [1167, 1189)、2-重逢 [1189, 1271)，首尾相接', () => {
    expect(段窗口('2-摇铃')).toMatchObject({ 起帧: 1167, 止帧: 1189, 帧数: 22 });
    expect(段窗口('2-重逢')).toMatchObject({ 起帧: 1189, 止帧: 1271, 帧数: 82 });
    expect(摇铃段.帧数).toBe(22);
    expect(重逢段.帧数).toBe(82);
  });

  it('段内帧：摇铃 12；对视 10（封面帧）、蹲下 20、驯服 31、推脸 61', () => {
    expect(段内正片事件帧('2-摇铃').摇铃).toBe(12);
    const 内 = 段内正片事件帧('2-重逢');
    expect([内.风散开, 内.第15句对视, 内.蹲下, 内.第15句驯服, 内.推向她的脸, 内.第15句段尾]).toEqual([0, 10, 20, 31, 61, 82]);
  });

  it('换上蛋糕落在蹲下那一帧，右键在驯服前一刻', () => {
    expect(事.换上蛋糕.帧).toBe(事.蹲下.帧);
    expect((事.第15句驯服.秒 - 事.递蛋糕右键.秒) * 20).toBeCloseTo(1, 9);
  });

  it('「Steve加入了游戏」到段尾还满亮（原版 180 刻后才淡）', () => {
    expect((事.第15句段尾.秒 - 事.第15句加入游戏.秒) * 20).toBeLessThan(180);
  });
});

describe('樱花风转场', () => {
  it('转场前后两帧（歌曲帧 1188、1189）风墙整屏盖住', () => {
    expect(风墙盖满(秒(1188), 风时刻)).toBe(true);
    expect(风墙盖满(秒(1189), 风时刻)).toBe(true);
  });

  it('摇铃那一帧风墙还没进画；对视（封面帧）之前风墙扫出画、风流的花瓣吹散完', () => {
    const W = 1280 * 成片倍数;
    expect(风墙沿(事.摇铃.秒, 风时刻, 樱花风默认, W).右沿).toBeLessThanOrEqual(0);
    expect(风墙沿(秒(事.第15句对视.帧 - 1), 风时刻, 樱花风默认, W).左沿).toBeGreaterThanOrEqual(W);
    expect(事.风散开.秒 + 樱花风默认.风流.散完秒).toBeLessThan(秒(事.第15句对视.帧 - 1));
  });
});

describe('声音：跨段的那几截首尾相接', () => {
  it('原声：两段各放满自己的窗口，入点接上，增益固定（不淡）', () => {
    const a = 找(摇铃段, '原声')!;
    const b = 找(重逢段, '原声')!;
    expect(a).toMatchObject({ 帧: 0, 帧数: 22, 入点秒: 1167 / fps, 增益: 正片原声增益 });
    expect(b).toMatchObject({ 帧: 0, 帧数: 82, 入点秒: 1189 / fps, 增益: 正片原声增益 });
  });

  it('铃声、风声：摇铃段放前一截，重逢段从段头接着放，入点 = 已放的帧数 ÷ fps，增益逐帧连得上', () => {
    for (const 音 of [铃声, 风]) {
      const a = 找(摇铃段, 音.名)!;
      const b = 找(重逢段, 音.名)!;
      expect(a.帧).toBe(音.起帧 - 1167);
      expect(a.帧 + a.帧数).toBe(22);
      expect(a.入点秒).toBeUndefined();
      expect(b.帧).toBe(0);
      expect(b.入点秒).toBeCloseTo(a.帧数 / fps, 12);
      const 总 = 音.帧数 ?? Math.ceil(音.时长秒 * fps);
      expect(a.帧数 + b.帧数).toBe(总);
      const 增益 = [...(a.增益 as readonly number[]), ...(b.增益 as readonly number[])];
      expect(增益).toEqual(Array.from({ length: 总 }, (_, i) => Math.round(音.增益(音.起帧 + i) * 1e6) / 1e6));
    }
  });

  it('铃声起音离摇铃那一拍不到半帧；风声淡进淡出，两头是 0 附近、转场前最后一帧最响、转场后 0.35 秒淡完', () => {
    expect(Math.abs(铃声.起帧 / fps + 铃声文件.起音秒 - 事.摇铃.秒)).toBeLessThan(0.5 / fps);
    const g = 风.增益;
    expect(g(风.起帧)).toBeLessThan(0.2);
    expect(g(风.起帧 + 风.帧数! - 1)).toBeLessThan(0.1);
    expect(g(事.风散开.帧 - 1)).toBeCloseTo(0.6, 6);
    expect(g(事.风散开.帧)).toBeLessThan(0.6);
  });

  it('推门声在重逢段里从推门那一帧起、放满文件', () => {
    const c = 找(重逢段, '推门')!;
    expect(c.帧).toBe(段内正片事件帧('2-重逢').推门);
    expect(c.帧数 / fps).toBeGreaterThanOrEqual(推门声.时长秒);
    expect(找(摇铃段, '推门')).toBeUndefined();
  });
});
