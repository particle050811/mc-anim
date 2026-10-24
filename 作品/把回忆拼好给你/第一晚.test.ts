import { describe, expect, it } from 'vitest';
import type { 声音cue, 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-第一晚/段.ts';
import {
  事,
  坑态,
  天刻,
  快进起,
  快进止,
  捡起帧,
  掉落物们,
  挖的出手,
  洞暗,
  碎们,
  聊天刻,
  聊天行们,
  裂纹态,
  镜头,
  史蒂夫态,
  死亡画面态,
  下落,
} from './段/2-第一晚/编排.ts';
import { 正片事件, 段窗口, 第几句, fps, 拍 } from './分镜.ts';
import { 天亮, 天体位置 } from './地点/天体.ts';
import { 光标, 地层, 死亡消息们, 界面缩放, 聊天宽, 近景, 近景天弧, 远景, 远景天弧, 音效们 } from './场/2-第一晚/参数.ts';
import { 近景地形 } from './场/2-第一晚/地形.ts';
import { 按钮框, 界面宽, 界面高, 在按钮上 } from './场/2-第一晚/界面布局.ts';

const 帧数 = 段.帧数;
/** 页面坐标 y（0 在顶）→ 剖面 z（格） */
const 页y到z = (镜: typeof 远景 | typeof 近景, y: number) => 镜.取景.中心[1] + ((360 - y) * 2) / 镜.取景.每格;
/** 歌词那一条的下沿（页面 y）：界面/符文排版.ts 的 符文歌词默认，边距 77 成片像素起、字点 7 × 16 点高，再加一点描边 */
const 歌词下沿页y = (77 + 7 * (16 + 1)) / 2;

describe('2-第一晚：第 2 句「祈愿小世界里不只有挫败」', () => {
  it('窗口从第 2 句首字到第 3 句首字（歌曲帧 119～201）', () => {
    const w = 段窗口('2-第一晚');
    expect([w.起帧, w.止帧]).toEqual([119, 201]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(2).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(第几句(3).起, 1);
    expect(帧数).toBe(82);
  });

  it('三稿的拍：4.79、5.22、5.65、6.07、6.50、6.92、7.35、7.78、8.20 都落在第 11～19 拍上（差不到半帧）', () => {
    const 对 = [
      [正片事件.死亡消息一, 4.79], [正片事件.死亡消息二, 5.22], [正片事件.摔死, 5.65], [正片事件.点重生, 6.07], [正片事件.挖一, 6.5],
      [正片事件.挖二, 6.92], [正片事件.挖三, 7.35], [正片事件.填土, 7.78], [正片事件.挖开天窗, 8.2],
    ] as const;
    对.forEach(([e, 秒], i) => {
      expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
      expect(e.秒).toBeCloseTo(拍(11 + i), 6);
    });
    // 第一条死亡消息在上一段（2-初入）的末尾弹出，这一段开头它已经在栏里
    expect(事.死亡消息一).toBeLessThan(0);
    expect(事.挖开天窗).toBeLessThan(帧数);
  });

  it('6.50 切近景，之后一镜不切', () => {
    for (let f = 0; f < 帧数; f++) expect(镜头(f)).toBe(f < 事.挖一 ? '远' : '近');
  });

  it('cue：原声铺满整段；音效都在段里、按实测峰值配到目标 dBFS；摔和死同一刻，挖、放土在碎、放的那一帧', () => {
    const 声 = (段.声音 ?? []).filter((c: 声音cue): c is 资产cue => c.台词 === undefined);
    const 原 = 声.find((c) => c.名 === '原声') as 资产cue;
    expect([原.帧, 原.帧数]).toEqual([0, 帧数]);
    const 资产们 = 声.filter((c) => c.名 !== '原声');
    for (const c of 资产们) {
      expect(c.帧).toBeGreaterThanOrEqual(0);
      expect(c.帧 + c.帧数).toBeLessThanOrEqual(帧数);
      const 定 = 音效们[c.名 as keyof typeof 音效们];
      if (!定) continue;
      expect(20 * Math.log10(c.增益 as number) + 定.峰值).toBeCloseTo(定.到, 3);
      expect(定.到).toBeLessThanOrEqual(-15);
    }
    const 在 = (名: string) => (资产们.find((c) => c.名 === 名) as 资产cue).帧;
    expect(在('摔')).toBe(事.摔死);
    expect(在('死')).toBe(事.摔死);
    expect(在('点')).toBe(事.点重生);
    expect([在('挖一'), 在('挖二'), 在('挖三'), 在('填土'), 在('挖开天窗')]).toEqual([事.挖一, 事.挖二, 事.挖三, 事.填土, 事.挖开天窗]);
    // 同一个文件不在同一帧起放两次（音效轨按帧当 key）
    const 键 = 资产们.map((c) => `${c.资产}@${c.帧}`);
    expect(new Set(键).size).toBe(键.length);
  });

  it('摔：从崖顶照原版下落，摔死那一拍正好落地；死后倒地、偏红，点重生后一帧在出生点出现', () => {
    expect(史蒂夫态(事.摔死 - 1).z).toBeGreaterThan(0.5);
    expect(史蒂夫态(事.摔死).z).toBe(0);
    expect(史蒂夫态(事.摔死).红).toBe(true);
    expect(史蒂夫态(事.点重生).倒).toBeGreaterThan(45);
    expect(史蒂夫态(事.点重生 + 1)).toMatchObject({ x: 0, z: 0, 红: false, 倒: 0 });
    // 段首他还在画面上沿以上（远景上沿 z 10.75），掉进画面的那几帧看得见
    expect(史蒂夫态(0).z).toBeGreaterThan(页y到z(远景, 0));
    // 原版下落一格约 4.6 刻
    expect(下落(1).length - 1).toBe(5);
  });

  it('死亡画面：摔死打开、点重生后一帧关；光标移到重生按钮上（指着），点下去变不能按', () => {
    expect(死亡画面态(事.摔死 - 1)).toBeNull();
    expect(死亡画面态(事.摔死)?.重生).toBe('平常');
    expect(死亡画面态(事.点重生 - 1)?.重生).toBe('指着');
    expect(死亡画面态(事.点重生)?.重生).toBe('不能按');
    expect(死亡画面态(事.点重生 + 1)).toBeNull();
    expect(在按钮上(0, ...光标.到)).toBe(true);
    expect([界面宽(), 界面高()]).toEqual([427, 240]);
    expect(按钮框(0)).toEqual({ x: 113, y: 132, w: 200, h: 20 });
  });

  it('聊天栏：三条死亡消息一拍一行；快进前都满亮，快进停时最后一行正好 200 刻（原版消失）', () => {
    expect(聊天行们.map((l) => l.text)).toEqual([...死亡消息们]);
    expect(聊天行们.map((l) => l.起刻)).toEqual([事.死亡消息一, 事.死亡消息二, 事.摔死].map((f) => (f * 20) / fps));
    for (const l of 聊天行们) expect(聊天刻(快进起 - 1) - l.起刻).toBeLessThan(180);
    expect(聊天刻(快进止) - 聊天行们[2]!.起刻).toBeCloseTo(200, 6);
    // 窄成 聊天宽 的底板盖不到近景的坑（坑在画面正中 x −0.5～0.5）
    expect(((聊天宽 + 12) * 界面缩放) / 2).toBeLessThan(640 - 近景.取景.每格 / 4);
  });

  it('挖三填一：三拍各挖掉一格、掉一格，填土以后头顶有土、两格高的洞装得下你，挖开天窗那一帧土没了', () => {
    expect(坑态(事.挖一 - 1)).toEqual({ 挖掉: 0, 顶土: false });
    expect(坑态(事.挖三)).toEqual({ 挖掉: 3, 顶土: false });
    expect(坑态(事.填土)).toEqual({ 挖掉: 3, 顶土: true });
    expect(坑态(事.挖开天窗)).toEqual({ 挖掉: 3, 顶土: false });
    expect(史蒂夫态(事.填土 - 1).z).toBe(-3);
    // 头顶 z −3 + 1.8 低于填上的土的底面（z −1）
    expect(史蒂夫态(事.填土).z + 1.8).toBeLessThan(地层.草);
    // 同一个状态同一个数组（方块拼搭 换数组就重建网格）
    expect(近景地形(坑态(50))).toBe(近景地形(坑态(51)));
    // 裂纹：碎之前长满，碎的那一帧没有
    expect(裂纹态(事.挖二 - 1)?.级).toBe(9);
    expect(裂纹态(事.挖二)).toBeNull();
    expect(裂纹态(事.挖开天窗 - 1)?.格).toEqual(碎们[3]!.格);
    // 挖的出手：0 → ½ 三刻、½ → 1 一刻
    expect([0, 1, 2, 3, 3.5, 4].map(挖的出手)).toEqual([0, 1 / 6, 2 / 6, 0.5, 0.75, 0]);
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

  it('天：快进前是夜（天亮 0），挖开天窗时满亮；天上的刻不往回走；洞里的暗只在封顶那段', () => {
    for (let f = 0; f < 快进起; f++) expect(天亮(天刻(f))).toBe(0);
    expect(天亮(天刻(事.挖开天窗))).toBe(1);
    for (let f = 1; f < 帧数; f++) expect(天刻(f)).toBeGreaterThanOrEqual(天刻(f - 1));
    for (let f = 0; f < 帧数; f++) {
      const a = 洞暗(f);
      if (f < 事.填土 || f >= 事.挖开天窗) expect(a).toBe(0);
      else expect(a).toBeGreaterThan(0.4);
      expect(a).toBeLessThan(1);
    }
  });

  it('太阳、月亮不进歌词那一条（本体 8 + 两圈光 = 12 个贴图像素见方，上沿 = 中心 + 6/16 格）', () => {
    for (let f = 0; f < 帧数; f++) {
      const 镜 = 镜头(f) === '远' ? 远景 : 近景;
      const 弧 = 镜头(f) === '远' ? 远景天弧 : 近景天弧;
      const 位 = 天体位置(天刻(f), 弧);
      for (const b of [位.太阳, 位.月亮]) expect(b.z + 6 / 16).toBeLessThan(页y到z(镜, 歌词下沿页y));
    }
  });
});
