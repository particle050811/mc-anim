import { describe, expect, it } from 'vitest';
import type { 声音cue, 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-第一晚/段.ts';
import {
  事, 亮满帧, 僵尸态, 僵尸过洞帧, 剥, 坑态, 天刻, 快进起, 捡起帧, 掉落物们, 挖的出手, 洞暗, 碎们, 裂纹态, 镜头, 顶墙暗, 黎明起, 史蒂夫态, 下落,
} from './段/2-第一晚/编排.ts';
import { 正片事件, 段窗口, 第几句, fps, 拍 } from './分镜.ts';
import { 天亮 } from './地点/天体.ts';
import { 僵尸, 僵尸吼提前, 地层, 头, 快进, 挖朝向, 洞里暗, 音效们 } from './场/2-第一晚/参数.ts';
import { 剖面, 剖面原点, 机位们 } from './场/2-新世界/参数.ts';
import { 剖面方块 } from './场/2-新世界/地形.ts';
import { 你在, 天刻在, 机位在 } from './场/2-新世界/编排.ts';
import { 星亮 } from './场/2-新世界/星.ts';

const 帧数 = 段.帧数;
const 起 = 段窗口('2-第一晚').起帧;

describe('2-第一晚：第 2 句「祈愿小世界里不只有挫败」', () => {
  it('窗口从第 2 句首字到第 3 句首字（歌曲帧 119～201）', () => {
    const w = 段窗口('2-第一晚');
    expect([w.起帧, w.止帧]).toEqual([119, 201]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(2).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(第几句(3).起, 1);
    expect(帧数).toBe(82);
  });

  it('只拍挖三填一：挖一、挖二、挖三、填土一拍一下（第 12～15 拍），挖开天窗在第 18 拍，段尾留够半秒阳光照进洞里（第 3 句从这里接）', () => {
    const 对 = [[正片事件.挖一, 12], [正片事件.挖二, 13], [正片事件.挖三, 14], [正片事件.填土, 15], [正片事件.挖开天窗, 18]] as const;
    for (const [e, n] of 对) expect(e.秒).toBeCloseTo(拍(n), 6);
    expect(帧数 - 事.挖开天窗).toBeGreaterThanOrEqual(Math.round(0.5 * fps));
    for (let f = 事.挖开天窗; f < 帧数; f++) {
      expect(坑态(f)).toEqual({ 挖掉: 3, 顶土: false });
      expect(天亮(天刻(f))).toBe(1);
      expect(顶墙暗(f)).toBe(洞里暗.顶墙);
    }
    // 天光两格照到底以后到段尾洞里全亮，至少留三分之一秒
    const 照到底 = 事.挖开天窗 + 2 * 洞里暗.光下帧;
    expect(帧数 - 照到底).toBeGreaterThanOrEqual(Math.round(fps / 3));
    for (let f = 照到底; f < 帧数; f++) expect(洞暗(f)).toEqual([{ 前: 0, 后: 0 }, { 前: 0, 后: 0 }]);
  });

  it('cue：原声铺满整段；音效是挖三填一、僵尸低吼和挖开天窗，挖、放在碎、放的那一帧，按实测峰值配到目标 dBFS', () => {
    const 声 = (段.声音 ?? []).filter((c: 声音cue): c is 资产cue => c.台词 === undefined);
    const 原 = 声.find((c) => c.名 === '原声') as 资产cue;
    expect([原.帧, 原.帧数]).toEqual([0, 帧数]);
    const 资产们 = 声.filter((c) => c.名 !== '原声');
    expect(资产们.map((c) => c.名)).toEqual(['挖一', '挖二', '挖三', '填土', '僵尸', '挖开天窗']);
    for (const c of 资产们) {
      expect(c.帧 + c.帧数).toBeLessThanOrEqual(帧数);
      const 定 = 音效们[c.名 as keyof typeof 音效们];
      expect(20 * Math.log10(c.增益 as number) + 定.峰值).toBeCloseTo(定.到, 3);
      expect(定.到).toBeLessThanOrEqual(-15);
    }
    expect(资产们.map((c) => c.帧)).toEqual([事.挖一, 事.挖二, 事.挖三, 事.填土, 僵尸过洞帧 - 僵尸吼提前, 事.挖开天窗]);
  });

  it('接 2-初入 一镜不切：同一个剖面机位、撤完了排；你站在坑那一格、朝东低头，段首就开始挥手挖', () => {
    for (let f = 0; f < 帧数; f++) {
      镜头(f).眼.forEach((v, i) => expect(v).toBeCloseTo(机位们.剖面.眼[i]!, 9));
      expect(剥(f)).toBe(剖面.剥排);
    }
    expect(镜头(0)).toEqual(机位在(1, 起 - 1));
    const 上一帧 = 你在(起 - 1);
    const s = 史蒂夫态(0);
    expect(上一帧.脚[0] - 剖面原点[0]).toBeCloseTo(s.x, 2);
    expect(上一帧.脚[1] - 剖面原点[1]).toBeCloseTo(0.5, 2);
    expect([上一帧.朝向, 上一帧.头]).toEqual([s.yaw, s.头]);
    expect([s.yaw, s.头]).toEqual([挖朝向, 头.挖]);
    expect(史蒂夫态(1).出手).toBeGreaterThan(0);
    expect(裂纹态(5)).not.toBeNull();
  });

  it('天：接着 2-初入 的下午，边挖边黑、填土那一拍黑透；快进翻到破晓，黎明铺开好几帧（不从黑跳到白），挖开天窗前就亮满；天上的刻不往回走', () => {
    expect(天刻(0)).toBe(天刻在(起));
    expect(天刻(0)).toBeGreaterThan(天刻在(起 - 1));
    expect(天亮(天刻(0))).toBe(1);
    expect(天亮(天刻(事.挖一))).toBeGreaterThan(0.8);
    expect(天亮(天刻(事.填土))).toBe(0);
    for (let f = 事.填土; f <= 黎明起; f++) expect(天亮(天刻(f))).toBe(0);
    // 快进里星星满亮
    expect(星亮(天刻(Math.round((快进起 + 黎明起) / 2)))).toBeCloseTo(0.5, 2);
    // 黎明：每帧天亮最多涨两成，中间那帧一半左右
    for (let f = 黎明起 + 1; f <= 亮满帧; f++) expect(天亮(天刻(f)) - 天亮(天刻(f - 1))).toBeLessThan(0.2);
    expect(天亮(天刻(黎明起 + 快进.黎明帧 / 2))).toBeCloseTo(0.5, 1);
    expect(天亮(天刻(亮满帧))).toBe(1);
    expect(亮满帧).toBeLessThan(事.挖开天窗);
    expect(星亮(天刻(事.挖开天窗)) ** 2).toBeLessThan(1 / 255);
    for (let f = 1; f < 帧数; f++) expect(天刻(f)).toBeGreaterThanOrEqual(天刻(f - 1));
  });

  it('僵尸：快进里从画面左边外面匀速走到右边外面，踩过洞顶时洞是封着的，天亮满以前走掉', () => {
    expect(僵尸态(快进起 - 1)).toBeNull();
    expect(僵尸态(快进起)?.x).toBe(僵尸.起x);
    expect(坑态(僵尸过洞帧).顶土).toBe(true);
    expect(Math.abs(僵尸态(僵尸过洞帧)!.x)).toBeLessThan(1);
    const 走完 = 事.挖开天窗 - 僵尸.止前;
    expect(僵尸态(走完)?.x).toBe(僵尸.止x);
    expect(僵尸态(走完 + 1)).toBeNull();
    expect(走完).toBeLessThanOrEqual(亮满帧);
  });

  it('挖三填一：三拍各挖掉一格、掉一格，填土以后头顶有土、两格高的洞装得下你，挖开天窗那一帧土没了', () => {
    expect(坑态(事.挖一 - 1)).toEqual({ 挖掉: 0, 顶土: false });
    expect(坑态(事.挖三)).toEqual({ 挖掉: 3, 顶土: false });
    expect(坑态(事.填土)).toEqual({ 挖掉: 3, 顶土: true });
    expect(坑态(事.挖开天窗)).toEqual({ 挖掉: 3, 顶土: false });
    expect(史蒂夫态(事.填土 - 1).z).toBe(-3);
    // 站在坑底那格泥土上
    const 坑列 = 剖面方块(坑态(事.填土 - 1)).filter((b) => b.位[0] === 剖面原点[0] - 0.5 && b.位[1] === 剖面原点[1]);
    expect(Math.max(...坑列.map((b) => b.位[2]))).toBe(地层.坑底);
    expect(坑列.find((b) => b.位[2] === 地层.坑底)?.状态).toBe('minecraft:dirt');
    // 头顶 z −3 + 1.8 低于填上的土的底面（z −1）
    expect(史蒂夫态(事.填土).z + 1.8).toBeLessThan(地层.草);
    // 裂纹：碎之前长满，碎的那一帧没有
    expect(裂纹态(事.挖二 - 1)?.级).toBe(9);
    expect(裂纹态(事.挖二)).toBeNull();
    expect(裂纹态(事.挖开天窗 - 1)?.格).toEqual(碎们[3]!.格);
    // 挖的出手：0 → ½ 三刻、½ → 1 一刻
    expect([0, 1, 2, 3, 3.5, 4].map(挖的出手)).toEqual([0, 1 / 6, 2 / 6, 0.5, 0.75, 0]);
    // 原版下落一格约 4.6 刻
    expect(下落(1).length - 1).toBe(5);
  });

  it('掉落物：碎了就掉，10 刻后捡起、3 刻飞完；你从捡起第一块起手里拿着土', () => {
    expect(捡起帧(0)).toBe(事.挖一 + 12);
    expect(掉落物们(事.挖一).length).toBe(1);
    expect(掉落物们(捡起帧(0) + 4).length).toBe(1); // 第一块飞完了，第二块还在
    expect(史蒂夫态(捡起帧(0) - 1).拿土).toBe(false);
    expect(史蒂夫态(捡起帧(0)).拿土).toBe(true);
    // 都在坑里那一列（x −0.5～0.5）、剖面以里（y ≥ 0）
    for (let f = 事.挖一; f < 帧数; f++)
      for (const p of 掉落物们(f)) {
        expect(Math.abs(p.位[0])).toBeLessThanOrEqual(0.5);
        expect(p.位[1]).toBeGreaterThanOrEqual(0);
      }
  });

  it('洞里的暗：封顶那段两格都暗、后墙比你暗；挖开天窗后天光从上往下一格一格照下去；后墙顶上那格洞顶开着时压暗', () => {
    for (let f = 0; f < 帧数; f++) {
      const 暗们 = 洞暗(f);
      if (f < 事.填土) {
        expect(暗们).toEqual([{ 前: 0, 后: 0 }, { 前: 0, 后: 0 }]);
        continue;
      }
      if (f < 事.挖开天窗) {
        for (const { 前, 后 } of 暗们) {
          expect(前).toBeGreaterThan(0.2);
          expect(后).toBeGreaterThan(0.4);
          expect(1 - (1 - 前) * (1 - 后)).toBeLessThan(1);
        }
        continue;
      }
      // 上面那格先亮
      expect(暗们[0]!.前).toBeLessThanOrEqual(暗们[1]!.前);
    }
    expect(洞暗(事.挖开天窗 + 洞里暗.光下帧)[0]).toEqual({ 前: 0, 后: 0 });
    expect(洞暗(事.挖开天窗 + 洞里暗.光下帧)[1]!.前).toBeGreaterThan(0);
    expect(顶墙暗(事.挖一 - 1)).toBe(0);
    expect(顶墙暗(事.挖一)).toBe(洞里暗.顶墙);
    expect(顶墙暗(事.填土)).toBe(0);
  });
});
