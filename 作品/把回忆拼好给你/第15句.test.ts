import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 摇铃段 from './段/2-摇铃/段.ts';
import 重逢段 from './段/2-重逢/段.ts';
import { fps, 段内正片事件帧, 段窗口, 正片事件 } from './分镜.ts';
import { 正片原声增益 } from './配乐/正片.ts';
import { 樱花风默认, 造风墙, 墙瓣在, 风墙沿, 风墙底, 风墙盖满 } from './特效/樱花风参数.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 铃声, 铃声文件, 风 } from './场/2-门口/第15句声音.ts';
import { 推门声 } from './场/2-隐世之境/重逢声音.ts';
import { 对视取景, 对视脚, 对视视角 } from './场/2-隐世之境/对视参数.ts';
import { 回头进度, 对视那帧秒, 聊天行不透明, 重逢机位 } from './场/2-隐世之境/重逢动作.ts';
import { 她 } from './场/2-隐世之境/参数.ts';
import { 推镜, 风散心高 } from './场/2-隐世之境/重逢参数.ts';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';

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

  it('段内帧：摇铃 12；风散开 0、回头 0（风散开时已经在转）、对视 10（封面帧）、换上蛋糕 30、驯服 41（她同一帧笑）、段尾 82', () => {
    expect(段内正片事件帧('2-摇铃').摇铃).toBe(12);
    const 内 = 段内正片事件帧('2-重逢');
    expect([内.风散开, 内.回头, 内.第15句对视, 内.换上蛋糕, 内.第15句驯服, 内.第15句笑, 内.第15句段尾]).toEqual([0, 0, 10, 30, 41, 41, 82]);
  });

  it('门在风里推开，开门声落在风散开那一拍', () => {
    expect(事.推门.帧).toBe(事.风散开.帧);
  });

  it('对视留够 0.8 秒再换上蛋糕；右键在驯服前一刻；她笑到段尾有 1.5 秒以上', () => {
    expect(事.换上蛋糕.秒 - 事.第15句对视.秒).toBeGreaterThanOrEqual(0.8);
    expect((事.第15句驯服.秒 - 事.递蛋糕右键.秒) * 20).toBeCloseTo(1, 9);
    expect(事.第15句段尾.秒 - 事.第15句笑.秒).toBeGreaterThanOrEqual(1.5);
  });
});

describe('樱花风转场', () => {
  it('转场前后两帧（歌曲帧 1188、1189）风墙整屏盖住', () => {
    expect(风墙盖满(秒(1188), 风时刻)).toBe(true);
    expect(风墙盖满(秒(1189), 风时刻)).toBe(true);
  });

  it('摇铃那一帧风墙还没进画；对视（封面帧）之前风墙的每一片花瓣、风流都吹出画', () => {
    const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
    expect(风墙沿(事.摇铃.秒, 风时刻, 樱花风默认, W).右沿).toBeLessThanOrEqual(0);
    const t = 秒(事.第15句对视.帧 - 1);
    expect(风墙底(t, 风时刻, 樱花风默认, W)).toBeNull();
    for (const q of 造风墙(樱花风默认, W, H)) {
      const { x, y } = 墙瓣在(q, t, 风时刻, 樱花风默认, W, H);
      const 边 = q.档 * 3;
      expect(x + 边 <= 0 || x >= W || y + 边 <= 0 || y >= H).toBe(true);
    }
    expect(事.风散开.秒 + 樱花风默认.风流.散完秒).toBeLessThan(t);
  });

  it('她的背影那块先散开：散心方圆 200 页面像素，转场后第 3 帧起一片花瓣都没有', () => {
    const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
    const 机 = 重逢机位(事.风散开.帧 / fps);
    const cam = 做透视相机({ 眼: Z朝上转three(机.眼), 看: Z朝上转three(机.看), 视角: 机.视角, 宽: 1280, 高: 720 });
    const c = 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], 她.脚[2] + 风散心高]), 1280, 720);
    const 心: [number, number] = [c.x * 成片倍数, c.y * 成片倍数];
    const 墙 = 造风墙(樱花风默认, W, H);
    const 挨着 = (帧: number) =>
      墙.filter((q) => {
        const { x, y } = 墙瓣在(q, 秒(帧), 风时刻, 樱花风默认, W, H, 心);
        const 边 = q.档 * 3;
        const [nx, ny] = [Math.max(x, Math.min(心[0], x + 边)), Math.max(y, Math.min(心[1], y + 边))];
        return Math.hypot(nx - 心[0], ny - 心[1]) < 200 * 成片倍数;
      }).length;
    expect(挨着(事.风散开.帧)).toBeGreaterThan(0);
    for (let 帧 = 事.风散开.帧 + 3; 帧 <= 事.第15句对视.帧; 帧++) expect(挨着(帧), `帧 ${帧}`).toBe(0);
  });

  it('风散开时她已经在转：散心那块散完（第 3 帧）时头转了不到一半、身子不到三成，之后每一帧都在转，到对视那一帧才转完', () => {
    const 起 = 事.风散开.帧 + 3;
    const k = 回头进度(秒(起));
    expect(k.头).toBeGreaterThan(0);
    expect(k.头).toBeLessThan(0.5);
    expect(k.身).toBeLessThan(0.3);
    for (let 帧 = 起 + 1; 帧 <= 事.第15句对视.帧; 帧++) expect(回头进度(秒(帧)).身, `帧 ${帧}`).toBeGreaterThan(回头进度(秒(帧 - 1)).身);
    expect(回头进度(秒(事.第15句对视.帧 - 1)).身).toBeLessThan(1);
  });

  it('风散开那一下不是一下散光：转场后第 3 帧还有一半以上的花瓣在画里', () => {
    const [W, H] = [1280 * 成片倍数, 720 * 成片倍数];
    const 墙 = 造风墙(樱花风默认, W, H);
    const 在画里 = (帧: number) =>
      墙.filter((q) => {
        const { x, y } = 墙瓣在(q, 秒(帧), 风时刻, 樱花风默认, W, H);
        const 边 = q.档 * 3;
        return x + 边 > 0 && x < W && y + 边 > 0 && y < H;
      }).length;
    expect(在画里(事.风散开.帧 + 3)).toBeGreaterThan(在画里(事.风散开.帧) / 2);
  });
});

describe('隐世之境一镜到底：回头', () => {
  it('对视那一帧她回头转完，风散开那一帧还背对着门', () => {
    expect(对视那帧秒).toBeCloseTo(事.第15句对视.帧 / fps, 12);
    expect(回头进度(秒(事.第15句对视.帧))).toEqual({ 身: 1, 头: 1 });
    expect(回头进度(秒(事.风散开.帧))).toEqual({ 身: 0, 头: 0 });
  });
});

describe('隐世之境一镜到底：接过来的聊天行', () => {
  it('接缝那一帧（风散开）同 2-摇铃 末帧满亮，跟着风散开一路淡，对视那一帧以前淡完', () => {
    expect(聊天行不透明(秒(事.风散开.帧))).toBe(1);
    for (let 帧 = 事.风散开.帧 + 1; 帧 < 事.第15句对视.帧; 帧++) {
      const [前, 这] = [聊天行不透明(秒(帧 - 1)), 聊天行不透明(秒(帧))];
      expect(这 < 前 || 这 === 0, `帧 ${帧}`).toBe(true);
    }
    expect(聊天行不透明(秒(事.第15句对视.帧 - 1))).toBe(0);
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

  it('推门声在重逢段里从推门那一帧（段头）起、放满文件', () => {
    const c = 找(重逢段, '推门')!;
    expect(c.帧).toBe(段内正片事件帧('2-重逢').推门);
    expect(c.帧).toBe(0);
    expect(c.帧数 / fps).toBeGreaterThanOrEqual(推门声.时长秒);
    expect(找(摇铃段, '推门')).toBeUndefined();
  });
});

describe('隐世之境一镜到底：机位', () => {
  const 机 = (帧: number) => 重逢机位(秒(帧));
  it('对视那一帧的机位就是封面帧（片）的：眼、看点、视角', () => {
    const c = 机(事.第15句对视.帧);
    expect(c.眼).toEqual([对视脚[0], 对视脚[1], 对视脚[2] + 1.62]);
    expect(c.看).toEqual(对视取景.片.看);
    expect(c.视角).toBe(对视视角);
  });

  it('整镜眼睛不动；对视以前看点就是封面帧的，以后才挪', () => {
    for (let 帧 = 事.风散开.帧; 帧 < 事.第15句段尾.帧; 帧++) expect(机(帧).眼, `帧 ${帧}`).toEqual(机(事.第15句对视.帧).眼);
    for (let 帧 = 事.风散开.帧; 帧 <= 事.第15句对视.帧; 帧++) expect(机(帧).看, `帧 ${帧}`).toEqual(对视取景.片.看);
  });

  it('视角整镜一直收（一刻不停、不回头），段尾那一刻收到 末视角', () => {
    for (let 帧 = 事.风散开.帧 + 1; 帧 < 事.第15句段尾.帧; 帧++) expect(机(帧).视角, `帧 ${帧}`).toBeLessThan(机(帧 - 1).视角);
    expect(机(事.第15句段尾.帧 - 1).视角).toBeGreaterThan(推镜.末视角);
    expect(机(事.第15句段尾.帧).视角).toBeCloseTo(推镜.末视角, 9);
  });

  it('推完最后 1 秒：她的脸在画面中间三分之一，下巴在底部歌词（页面 y 623 起）上面', () => {
    for (let 帧 = 事.第15句段尾.帧 - fps; 帧 < 事.第15句段尾.帧; 帧++) {
      const c = 机(帧);
      const cam = 做透视相机({ 眼: Z朝上转three(c.眼), 看: Z朝上转three(c.看), 视角: c.视角, 宽: 1280, 高: 720 });
      const 投 = (z: number) => 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], 她.脚[2] + z]), 1280, 720);
      expect(投(1.1).y, `帧 ${帧}`).toBeLessThan(600);
      expect(投(1.25).x, `帧 ${帧}`).toBeGreaterThan(1280 / 3);
      expect(投(1.25).x, `帧 ${帧}`).toBeLessThan((1280 * 2) / 3);
    }
  });
});
