// 歌词艺术字的数据和排版：逐字时刻、拼音和 网格.ts 的词对得上，歌词字表收全了字，符文排得进字格、整句（长句拆两行）排得进画面，进出场和解码的时序。
// 字表和银河字母贴图在数据根里，没有就跳过那几条。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { png } from '@engine/model/贴图.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';
import { 字节路径, 读作品资产锁 } from '../../../pipeline/资产/资产锁.ts';
import { 句们 } from '../配乐/网格.ts';
import { 逐字问题 } from '../配乐/逐字.ts';
import { 分行, 拼音, 正片歌词行, 进场 } from './符文歌词数据.ts';
import { 做字源, 字状态, 字格, 拆拼音, 排一句, 排拼音, 符文歌词默认, 解码时段, type 时间样式 } from './符文排版.ts';

const 作品根 = path.resolve(import.meta.dirname, '..');
const 锁 = 读作品资产锁(作品根);
const 字节 = (id: string) => {
  const 条目 = 锁[id];
  return 条目 && fs.existsSync(字节路径(条目)) ? fs.readFileSync(字节路径(条目)) : null;
};
const 表字节 = 字节('字体/把回忆拼好给你/歌词字');
const sga字节 = 字节('贴图/界面/银河字母');

describe('歌词艺术字的数据', () => {
  it('逐字时刻：字数和词一样、递增、落在句里', () => {
    expect(逐字问题()).toEqual([]);
  });

  it('拼音：每句字数和词一样，只有 a～z', () => {
    for (const s of 句们) {
      expect(拼音[s.序]?.length, `第 ${s.序} 句`).toBe([...s.词].length);
      for (const 音 of 拼音[s.序]!) expect(音, `第 ${s.序} 句`).toMatch(/^[a-z]+$/);
    }
  });

  it('歌词文案.txt 和 网格.ts 的词一样（字表照它取）', () => {
    const 行们 = fs
      .readFileSync(path.join(作品根, '界面', '歌词文案.txt'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'));
    expect(行们).toEqual(句们.map((s) => s.词));
  });

  it('拆拼音：声母、韵母分开，y w 当声母，零声母不拆', () => {
    expect(拆拼音('zhuan')).toEqual(['zh', 'uan']);
    expect(拆拼音('xiang')).toEqual(['x', 'iang']);
    expect(拆拼音('wo')).toEqual(['w', 'o']);
    expect(拆拼音('ai')).toEqual(['ai']);
    expect(拆拼音('an')).toEqual(['an']);
  });

  it('正片歌词行：解码帧 = 逐字秒 × 24；入在首字前至少 0.3 秒（第 1 句 0.6 秒），在上一句末字后至少 最短留 帧', () => {
    const 行 = 正片歌词行(8);
    expect(行.解[11]).toBeCloseTo(27.75 * 24);
    expect(行.分行).toBe(7);
    expect(正片歌词行(1).入).toBe(Math.round((1.54 - 0.6) * 24));
    for (const s of 句们) {
      const 本 = 正片歌词行(s.序);
      const 上 = s.序 > 1 ? 正片歌词行(s.序 - 1) : null;
      if (上) expect(本.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(上.解[上.解.length - 1]! + 进场.最短留);
      // 第 9 句离第 8 句末字只有 0.21 秒，让给上一句的停留
      if (s.序 !== 9) expect(本.解[0]! - 本.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(进场.最短提前秒 * 24 - 0.5);
    }
  });

  it('分行：15 个字的句都拆了，拆开的两行都不空', () => {
    for (const s of 句们) {
      const n = [...s.词].length;
      if (n > 14) expect(分行[s.序], `第 ${s.序} 句「${s.词}」`).toBeDefined();
      const k = 分行[s.序];
      if (k === undefined) continue;
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(n);
    }
  });
});

describe.skipIf(!表字节 || !sga字节)('歌词艺术字的排版', () => {
  const sga = png(`data:image/png;base64,${sga字节!.toString('base64')}`);
  const 源 = 做字源(sga, JSON.parse(表字节!.toString('utf8')) as 字形表, '字体/把回忆拼好给你/歌词字');

  it('银河字母的字宽照原版（ascii_sga.png 量的）', () => {
    const 宽 = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((c) => [c, 源.符文(c).宽]));
    expect(宽).toEqual({ a: 5, b: 5, c: 2, d: 5, e: 5, f: 5, g: 3, h: 5, i: 1, j: 1, k: 5, l: 3, m: 5, n: 4, o: 4, p: 3, q: 5, r: 4, s: 2, t: 5, u: 5, v: 5, w: 5, x: 5, y: 3, z: 5 });
    for (const c of 'abcdefghijklmnopqrstuvwxyz') for (const [, y] of 源.符文(c).点) expect(y).toBeLessThan(7);
  });

  it('每句的字都在歌词字表里，步进 18 点', () => {
    for (const s of 句们) for (const 字 of s.词) expect(源.步进(字), 字).toBe(18);
  });

  it('符文排得进字格：伸出去最多 1 点（字间空 2 点），不越过上下', () => {
    for (const s of 句们)
      for (const 音 of 拼音[s.序]!) {
        const 摆 = 排拼音(源, 音);
        const 左 = Math.min(...摆.map((r) => r.x));
        const 右 = Math.max(...摆.map((r) => r.x + r.点阵.宽));
        expect(左, 音).toBeGreaterThanOrEqual(-1);
        expect(右, 音).toBeLessThanOrEqual(字格 + 1);
        for (const r of 摆) expect(r.y + 7, 音).toBeLessThanOrEqual(字格);
      }
  });

  it('默认样式下每行宽不过 1800 像素（左右各留 380）、描边还在画里；底部那句最后一行的字格下沿离底 边距；两行的第二行在第一行下 行距 点', () => {
    const 样 = 符文歌词默认;
    for (const s of 句们) {
      const { 格们, 行宽 } = 排一句(源, s.词, 样, 2560, 1440, 分行[s.序]);
      for (const w of 行宽) expect(w * 样.字点, `第 ${s.序} 句`).toBeLessThanOrEqual(1800);
      for (const g of 格们) {
        expect(g.x - 1).toBeGreaterThanOrEqual(0);
        expect((g.x + 字格 + 1) * 样.字点).toBeLessThanOrEqual(2560);
      }
    }
    const 下 = 排一句(源, '爱炙热的你却忘了爱自己', { ...样, 位置: '下' }, 2560, 1440);
    // 点格从左上角数，1440 不是 7 的倍数：底边距按整点取，比 边距 多出零头
    const 底点 = Math.floor(1440 / 样.字点) - Math.round(样.边距 / 样.字点);
    expect(下.格们[0]!.y + 字格).toBe(底点);
    const 两行 = 排一句(源, '将快乐全都收集将不开心全都淘汰', 样, 2560, 1440, 7);
    expect(两行.格们[0]!.y * 样.字点).toBe(样.边距);
    expect(两行.格们[7]!.y - 两行.格们[0]!.y).toBe(样.行距);
    expect(两行.行宽).toEqual([7 * 18 - 2, 8 * 18 - 2]);
    const 两行下 = 排一句(源, '将快乐全都收集将不开心全都淘汰', { ...样, 位置: '下' }, 2560, 1440, 7);
    expect(两行下.格们[14]!.y + 字格).toBe(底点);
  });
});

describe('歌词艺术字的时序', () => {
  const 样: 时间样式 = { 入帧: 3, 出帧: 3, 错开帧: 0.5, 解码帧: 5, 最短解码帧: 3, 落定提前: 1 };
  const 一 = { 词: '一二', 拼音: ['yi', 'er'], 入: 10, 解: [15, 25] };
  const 二 = { 词: '三', 拼音: ['san'], 入: 40, 解: [41] };

  it('入帧前看不见，入帧那一帧亮 1/入帧，第二个字晚 错开帧', () => {
    expect(字状态([一, 二], 0, 9, 样).map((s) => s.显)).toEqual([0, 0]);
    const s = 字状态([一, 二], 0, 10, 样);
    expect(s[0]!.显).toBeCloseTo(1 / 3);
    expect(s[1]!.显).toBeCloseTo(0.5 / 3);
  });

  it('解码：起唱前 落定提前 帧拼完，用 解码帧 帧', () => {
    expect(字状态([一, 二], 0, 9, 样)[0]!.解).toBe(0);
    expect(字状态([一, 二], 0, 11.5, 样)[0]!.解).toBeCloseTo(0.5);
    expect(字状态([一, 二], 0, 14, 样)[0]!.解).toBe(1);
    expect(字状态([一, 二], 0, 14, 样)[0]!.解后).toBe(0);
  });

  it('下一个字跟得紧时解码缩到间隔的 0.8，不少于 最短解码帧', () => {
    expect(解码时段({ 解: [10, 14, 16, 30] }, 样)).toEqual([
      { 起: 9 - 3.2, 完: 9 },
      { 起: 13 - 3, 完: 13 },
      { 起: 15 - 5, 完: 15 },
      { 起: 29 - 5, 完: 29 },
    ]);
  });

  it('下一句入帧前 出帧 帧退完；最后一句没有 收 一直留着', () => {
    expect(字状态([一, 二], 0, 36, 样).every((s) => s.显 === 1)).toBe(true);
    expect(字状态([一, 二], 0, 40, 样).every((s) => s.显 === 0)).toBe(true);
    expect(字状态([一, 二], 1, 500, 样)[0]!.显).toBe(1);
    expect(字状态([一, 二], 1, 500, 样, 100)[0]!.显).toBe(0);
  });

  it('最后一个字还没解完时，等它解完再退（最晚退到下一句入帧）', () => {
    const 挤 = { 词: '四', 拼音: ['si'], 入: 23, 解: [24] };
    // 一 的「二」25 起唱、24 才拼完，下一句 23 进：退场不从 23 − 3 = 20 起，等到 23（下一句入帧）
    expect(字状态([一, 挤], 0, 22, 样).every((s) => s.显 === 1)).toBe(true);
    expect(字状态([一, 挤], 0, 23, 样)[0]!.显).toBeLessThan(1);
  });

  it('正片 15 句、默认样式：上一句到下一句入帧时已经退完；每个字唱到时已经是汉字、拼完前没退场', () => {
    const 行们 = 句们.map((s) => 正片歌词行(s.序));
    行们.forEach((行, i) => {
      const 下 = 行们[i + 1];
      if (下) expect(字状态(行们, i, 下.入, 符文歌词默认).every((s) => s.显 === 0), `第 ${i + 1} 句「${行.词}」`).toBe(true);
      行.解.forEach((t, j) => {
        const s = 字状态(行们, i, Math.ceil(t), 符文歌词默认)[j]!;
        expect(s.解, `第 ${i + 1} 句第 ${j + 1} 个字`).toBe(1);
        // 第 9 句首字离第 8 句末字只有 0.21 秒：第 8 句先完整亮 2 帧再退，第 9 句的头一个字唱到时还在抖着亮
        if (i === 8 && j === 0) expect(s.显).toBeGreaterThan(0.5);
        else expect(s.显, `第 ${i + 1} 句第 ${j + 1} 个字`).toBe(1);
      });
    });
  });
});
