// 歌词艺术字的数据和排版：逐字时刻、拼音和 网格.ts 的词对得上，歌词字表收全了字，整句（照逐句排版表断行、分屏）排得进画面，进出场和拼字的时序，
// 符文怎么分块、怎么飞（不出歌词那一条）、同时飞几枚，五个关键词的效果。
// 字表和银河字母贴图在数据根里，没有就跳过那几条。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { png } from '@engine/model/贴图.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';
import { 字节路径, 读作品资产锁 } from '../../../pipeline/资产/资产锁.ts';
import { 句们 } from '../配乐/网格.ts';
import { 逐字问题 } from '../配乐/逐字.ts';
import { 正片事件 } from '../分镜.ts';
import { 网格 } from '../配乐/网格.ts';
import { 光明, 光明档数, 刹那, 刹那块, 放下块, 烟花火花 } from './歌词字效.ts';
import { 分屏版式 } from '../场/2-门口/分屏参数.ts';
import { 关键词们, 分屏线, 分屏让, 歌词排版表 } from './歌词排版表.ts';
import { 拼音, 正片歌词行, 进场 } from './符文歌词数据.ts';
import { 分块, 块数, 字种, 符文倍, 飞们, 飞位, 飞法 } from './符文拼字.ts';
import { 做字源, 合样式, 字状态, 字格, 排一句, 符文歌词默认, 解码时段, 错距, type 时间样式 } from './符文排版.ts';

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

  it('正片歌词行：解码帧 = 逐字秒 × 24；入在首字前至少 0.3 秒（第 1 句 0.6 秒），在上一句末字后至少 最短留 帧', () => {
    const 行 = 正片歌词行(8);
    expect(行.解[11]).toBeCloseTo(27.75 * 24);
    expect(行.序).toBe(8);
    expect(行.版?.断行).toEqual([7]);
    expect(正片歌词行(1).入).toBe(Math.round((1.54 - 0.6) * 24));
    for (const s of 句们) {
      const 本 = 正片歌词行(s.序);
      const 上 = s.序 > 1 ? 正片歌词行(s.序 - 1) : null;
      if (上) expect(本.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(上.解[上.解.length - 1]! + 进场.最短留);
      // 第 9 句离第 8 句末字只有 0.21 秒，让给上一句的停留
      if (s.序 !== 9) expect(本.解[0]! - 本.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(进场.最短提前秒 * 24 - 0.5);
    }
  });

  it('排版表：每句都有一项；15 个字的句都断了行，断行递增、每段不空；各段 的个数和段数一样', () => {
    for (const s of 句们) {
      const 版 = 歌词排版表[s.序];
      expect(版, `第 ${s.序} 句`).toBeDefined();
      const n = [...s.词].length;
      if (n > 14) expect(版!.断行?.length, `第 ${s.序} 句「${s.词}」`).toBeGreaterThan(0);
      (版!.断行 ?? []).forEach((k, i, a) => {
        expect(k).toBeGreaterThan(a[i - 1] ?? 0);
        expect(k).toBeLessThan(n);
      });
      if (版!.各段) expect(版!.各段.length, `第 ${s.序} 句`).toBe((版!.断行 ?? []).length + 1);
    }
  });

  it('关键词：五句各有一个，词在句里，刹那在世界碎掉那一拍裂、时差晚半拍', () => {
    expect(Object.keys(关键词们).map(Number)).toEqual([3, 10, 11, 13, 14]);
    for (const 序 of [3, 10, 11, 13, 14]) {
      const 行 = 正片歌词行(序, 100);
      const 效 = 行.字效!;
      expect([...行.词].slice(效.从, 效.到 + 1).join('')).toBe(关键词们[序]!.词);
      if (效.效 === '刹那') expect(效.裂).toBe(正片事件.第11句碎裂.帧 - 100);
      if (效.效 === '时差') expect(效.半拍).toBeCloseTo((网格.拍长 / 2) * 24);
    }
    expect(正片歌词行(1).字效).toBeUndefined();
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

  it('默认样式加排版表：每行宽不过 1800 像素（左右各留 380）、描边还在画里；底部那句最后一行的字格下沿离底 边距；两行的第二行在第一行下 行距 点', () => {
    const 样 = 符文歌词默认;
    for (const s of 句们) {
      const 版 = 歌词排版表[s.序];
      const 合 = 合样式(样, 版);
      const { 格们, 行宽 } = 排一句(源, s.词, 合, 2560, 1440, 版);
      for (const w of 行宽) expect(w * 合.字点, `第 ${s.序} 句`).toBeLessThanOrEqual(1800);
      for (const g of 格们) {
        expect(g.x - 1).toBeGreaterThanOrEqual(0);
        expect((g.x + 字格 + 1) * 合.字点).toBeLessThanOrEqual(2560);
      }
    }
    const 下 = 排一句(源, '爱炙热的你却忘了爱自己', { ...样, 位置: '下' }, 2560, 1440);
    // 点格从左上角数，1440 不是 7 的倍数：底边距按整点取，比 边距 多出零头
    const 底点 = Math.floor(1440 / 样.字点) - Math.round(样.边距 / 样.字点);
    expect(下.格们[0]!.y + 字格).toBe(底点);
    const 两行 = 排一句(源, '将快乐全都收集将不开心全都淘汰', 样, 2560, 1440, { 断行: [7] });
    expect(两行.格们[0]!.y * 样.字点).toBe(样.边距);
    expect(两行.格们[7]!.y - 两行.格们[0]!.y).toBe(样.行距);
    expect(两行.行宽).toEqual([7 * 18 - 2, 8 * 18 - 2]);
    const 两行下 = 排一句(源, '将快乐全都收集将不开心全都淘汰', { ...样, 位置: '下' }, 2560, 1440, { 断行: [7] });
    expect(两行下.格们[14]!.y + 字格).toBe(底点);
  });

  it('一行居中的句和改排版表前一样（第 2、3、5～7、9～12 句位置照旧：那几场按这一条让开了画面）', () => {
    const 样 = 符文歌词默认;
    for (const 序 of [2, 3, 5, 6, 7, 9, 10, 11, 12]) {
      const s = 句们.find((x) => x.序 === 序)!;
      const { 格们 } = 排一句(源, s.词, 合样式(样, 歌词排版表[序]), 2560, 1440, 歌词排版表[序]);
      const w = [...s.词].length * 18 - 2;
      expect(格们[0]!.x, `第 ${序} 句`).toBe(Math.round((2560 / 7 - w) / 2));
      expect(格们[0]!.y).toBe(11);
    }
  });

  it('错落：两行各自居中后上一行往左、下一行往右各让 错距 的一半；左、右对齐对着整块的边', () => {
    const 词 = '将快乐全都收集将不开心全都淘汰';
    const 中 = 排一句(源, 词, 符文歌词默认, 2560, 1440, { 断行: [7] }).格们;
    const 错 = 排一句(源, 词, 符文歌词默认, 2560, 1440, { 断行: [7], 对齐: '错落' }).格们;
    expect(错[0]!.x - 中[0]!.x).toBe(-错距 / 2);
    expect(错[7]!.x - 中[7]!.x).toBe(错距 / 2);
    const 左 = 排一句(源, 词, 符文歌词默认, 2560, 1440, { 断行: [7], 对齐: '左' }).格们;
    expect(左[0]!.x).toBe(左[7]!.x);
    const 右 = 排一句(源, 词, 符文歌词默认, 2560, 1440, { 断行: [7], 对齐: '右' }).格们;
    expect(右[6]!.x).toBe(右[14]!.x);
  });

  it('分屏两句（第 13、14 句）：一段在左屏、一段在右屏，同一行，连描边离分屏线（成片 1280～1288）都还有 分屏让 − 2 点（取整），两段只画在自己那一屏；第 14 句左段在左屏太阳右边（第14句.test：太阳右沿在页面 392 以左）', () => {
    const 样 = 符文歌词默认;
    expect(分屏线).toEqual([分屏版式.服务器宽 / 1280, (分屏版式.服务器宽 + 分屏版式.线宽) / 1280]);
    for (const 序 of [13, 14]) {
      const s = 句们.find((x) => x.序 === 序)!;
      const 版 = 歌词排版表[序]!;
      const { 格们, 行宽 } = 排一句(源, s.词, 合样式(样, 版), 2560, 1440, 版);
      const k = 版.断行![0]!;
      const 左段右 = (格们[0]!.x + 行宽[0]! + 1) * 样.字点;
      const 右段左 = (格们[k]!.x - 1) * 样.字点;
      expect(1280 - 左段右, `第 ${序} 句`).toBeGreaterThanOrEqual((分屏让 - 2) * 样.字点);
      expect(右段左 - 1288, `第 ${序} 句`).toBeGreaterThanOrEqual((分屏让 - 2) * 样.字点);
      expect(new Set(格们.map((g) => g.y)).size).toBe(1);
      expect(格们[0]!.y).toBe(11);
      for (const g of 格们.slice(0, k)) expect([g.界![0], g.界![1] * 样.字点]).toEqual([0, expect.closeTo(1280)]);
      for (const g of 格们.slice(k)) expect([g.界![0] * 样.字点, g.界![1] * 样.字点]).toEqual([expect.closeTo(1288), expect.closeTo(2560)]);
    }
    const 十四 = 排一句(源, '也为你骗自己放下', 符文歌词默认, 2560, 1440, 歌词排版表[14]);
    expect((十四.格们[0]!.x - 1) * 符文歌词默认.字点).toBeGreaterThanOrEqual(392 * 2);
  });

  it('第 1 句断两行、错落：上行「我们都是」、下行「渺小真实存在」，上沿照旧', () => {
    const 版 = 歌词排版表[1]!;
    const { 格们 } = 排一句(源, '我们都是渺小真实存在', 符文歌词默认, 2560, 1440, 版);
    expect(格们.slice(0, 4).every((g) => g.y === 11)).toBe(true);
    expect(格们.slice(4).every((g) => g.y === 11 + 符文歌词默认.行距)).toBe(true);
  });

  it('分块：每个字的点一个不落、不重地分进 2～3 块（点少于 60 的 2 块），块按书写顺序排', () => {
    for (const s of 句们)
      for (const 字 of s.词) {
        const 阵 = 源.汉字(字);
        const 块们 = 分块(字, 阵);
        expect(块们.length, 字).toBe(Math.min(块数(阵.点.length), 阵.点.length));
        expect(块们.length).toBe(阵.点.length < 60 ? 2 : 3);
        const 全 = 块们.flatMap((b) => b.点.map(([x, y]) => `${x},${y}`));
        expect(new Set(全).size, 字).toBe(阵.点.length);
        expect(全.length, 字).toBe(阵.点.length);
        for (let k = 1; k < 块们.length; k++) expect(块们[k]!.心[1] * 2 + 块们[k]!.心[0]).toBeGreaterThanOrEqual(块们[k - 1]!.心[1] * 2 + 块们[k - 1]!.心[0]);
      }
  });

  it('符文飞的路线：顶上那行的符文（按 符文倍 画）不出画面上沿、往下最多伸出字格 下伸 点（不压下面的画面），落定前最后一帧离落点不到半个字（原版那条线最后一段才落下去）', () => {
    for (const s of 句们) {
      const 行 = 正片歌词行(s.序);
      const 时段 = 解码时段(行, 符文歌词默认);
      [...s.词].forEach((字, j) => {
        const 块们 = 分块(字, 源.汉字(字));
        const 飞 = 飞们(块们, 行.拼音[j]!, { ...时段[j]!, 入: 行.入 + j * 符文歌词默认.错开帧 }, 符文歌词默认.飞帧, 字种(s.序, j));
        飞.forEach((一, k) => {
          for (let f = Math.ceil(一.起); f < 一.落; f++) {
            const 位 = 飞位(一, f)!;
            const 顶 = 块们[k]!.心[1] + 位[1] - 3.5 * 符文倍;
            expect(顶, `第 ${s.序} 句「${字}」第 ${k} 块`).toBeGreaterThanOrEqual(-飞法.顶空 - 0.5);
            expect(顶 + 7 * 符文倍).toBeLessThanOrEqual(字格 + 飞法.下伸 + 0.5);
          }
          const 末 = 飞位(一, Math.ceil(一.落) - 1);
          if (末 && 一.落 - 一.起 >= 飞法.最短) expect(Math.hypot(末[0], 末[1]), `第 ${s.序} 句「${字}」`).toBeLessThan(8);
        });
      });
    }
  });
  it('手机上看得出是拼成的（核查 10-24）：全片同时在飞的符文最多 7 枚；除了句首挤着的字，每个字拼了一半的样子至少停 拼字帧 − 1 帧', () => {
    const 行们 = 句们.map((s) => 正片歌词行(s.序));
    const 飞着: Map<number, number> = new Map();
    行们.forEach((行, i) => {
      const 时段 = 解码时段(行, 符文歌词默认);
      [...行.词].forEach((字, j) => {
        const 入 = 行.入 + j * 符文歌词默认.错开帧;
        const 飞 = 飞们(分块(字, 源.汉字(字)), 行.拼音[j]!, { ...时段[j]!, 入 }, 符文歌词默认.飞帧, 字种(i + 1, j));
        for (const 一 of 飞) for (let f = Math.ceil(一.起); f < 一.落; f++) 飞着.set(f, (飞着.get(f) ?? 0) + 1);
        // 句首的字进场晚（首飞帧），拼字缩短；其余的字整 拼字帧
        if (时段[j]!.起 > 入 + 符文歌词默认.首飞帧) expect(时段[j]!.完 - 时段[j]!.起, `第 ${i + 1} 句「${字}」`).toBe(符文歌词默认.拼字帧);
      });
    });
    expect(Math.max(...飞着.values())).toBeLessThanOrEqual(7);
  });
});

describe('歌词艺术字的时序', () => {
  const 样: 时间样式 = { 入帧: 3, 出帧: 3, 错开帧: 0.5, 拼字帧: 7, 首飞帧: 4, 落定提前: 1, 飞帧: 9 };
  const 一 = { 词: '一二', 拼音: ['yi', 'er'], 入: 10, 解: [25, 30] };
  const 二 = { 词: '三', 拼音: ['san'], 入: 40, 解: [46] };

  it('入帧前看不见，入帧那一帧亮 1/入帧，第二个字晚 错开帧', () => {
    expect(字状态([一, 二], 0, 9, 样).map((s) => s.显)).toEqual([0, 0]);
    const s = 字状态([一, 二], 0, 10, 样);
    expect(s[0]!.显).toBeCloseTo(1 / 3);
    expect(s[1]!.显).toBeCloseTo(0.5 / 3);
  });

  it('拼字：起唱前 落定提前 帧拼齐，第一块落定在那之前 拼字帧；和前一个字叠着拼（不再按两字间隔缩短）', () => {
    expect(解码时段(一, 样)).toEqual([
      { 起: 24 - 7, 完: 24 },
      { 起: 29 - 7, 完: 29 },
    ]);
    expect(字状态([一, 二], 0, 23, 样)[0]!.解后).toBe(-1);
    expect(字状态([一, 二], 0, 24, 样)[0]!.解后).toBe(0);
  });

  it('句首的字进场晚：第一块不早于进场后 首飞帧，挤到拼齐那一帧为止', () => {
    expect(解码时段({ 入: 10, 解: [17, 20, 14] }, 样)).toEqual([
      { 起: 14, 完: 16 },
      { 起: 14.5, 完: 19 },
      { 起: 13, 完: 13 },
    ]);
  });

  it('下一句入帧前 出帧 帧退完；最后一句没有 收 一直留着', () => {
    expect(字状态([一, 二], 0, 36, 样).every((s) => s.显 === 1)).toBe(true);
    expect(字状态([一, 二], 0, 40, 样).every((s) => s.显 === 0)).toBe(true);
    expect(字状态([一, 二], 1, 500, 样)[0]!.显).toBe(1);
    expect(字状态([一, 二], 1, 500, 样, 100)[0]!.显).toBe(0);
  });

  it('最后一个字还没拼完时，等它拼完再退（最晚退到下一句入帧）', () => {
    const 挤 = { 词: '四', 拼音: ['si'], 入: 28, 解: [33] };
    // 一 的「二」30 起唱、29 才拼完，下一句 28 进：退场不从 28 − 3 = 25 起，等到 28（下一句入帧）
    expect(字状态([一, 挤], 0, 27, 样).every((s) => s.显 === 1)).toBe(true);
    expect(字状态([一, 挤], 0, 28, 样)[0]!.显).toBeLessThan(1);
  });

  it('正片 15 句、默认样式：上一句到下一句入帧时已经退完；每个字唱到时已经拼齐、拼完前没退场', () => {
    const 行们 = 句们.map((s) => 正片歌词行(s.序));
    行们.forEach((行, i) => {
      const 下 = 行们[i + 1];
      if (下) expect(字状态(行们, i, 下.入, 符文歌词默认).every((s) => s.显 === 0), `第 ${i + 1} 句「${行.词}」`).toBe(true);
      行.解.forEach((t, j) => {
        const s = 字状态(行们, i, Math.ceil(t), 符文歌词默认)[j]!;
        expect(s.解后, `第 ${i + 1} 句第 ${j + 1} 个字`).toBeGreaterThanOrEqual(0);
        // 第 9 句首字离第 8 句末字只有 0.21 秒：第 8 句先完整亮 2 帧再退，第 9 句的头一个字唱到时还在抖着亮
        if (i === 8 && j === 0) expect(s.显).toBeGreaterThan(0.5);
        else expect(s.显, `第 ${i + 1} 句第 ${j + 1} 个字`).toBe(1);
      });
    });
  });

  it('符文：落定按块的顺序排满 起～完（第一块 起、最后一块 完），起飞不早于这个字进场，来不及飞的直接落定', () => {
    const 块们 = [{ 点: [[0, 0]] as const, 心: [0, 0] as const }, { 点: [[1, 1]] as const, 心: [1, 1] as const }, { 点: [[2, 2]] as const, 心: [2, 2] as const }];
    const 飞 = 飞们(块们, 'ni', { 起: 20, 完: 24, 入: 10 }, 8, 1);
    expect(飞.map((x) => x.落)).toEqual([20, 22, 24]);
    expect(飞.map((x) => x.起)).toEqual([12, 14, 16]);
    expect(飞.map((x) => x.字母)).toEqual(['n', 'i', 'n']);
    const 晚 = 飞们(块们, 'ni', { 起: 20, 完: 24, 入: 19 }, 8, 1);
    expect(晚.map((x) => x.起)).toEqual([20, 19, 19]);
    expect(飞位(飞[0]!, 11)).toBeNull();
    expect(飞位(飞[0]!, 20)).toBeNull();
    expect(飞位(飞[0]!, 12)![0]).toBe(飞[0]!.dx);
  });
});

describe('五个关键词的效果', () => {
  it('光明：拼齐前不亮，拼齐头 闪帧 帧两档、之后一档；每档 2 点', () => {
    expect([9, 10, 13, 14, 30].map((f) => 光明档数(f, 10))).toEqual([0, 2, 2, 1, 1]);
    expect(光明.档宽).toBe(2);
    expect(光明.档色们.length).toBe(2);
  });

  it('烟花：拼齐前没有火花；从词外沿炸开往四面散开，几帧后都离中心远了', () => {
    expect(烟花火花(9, 10, 5)).toEqual([]);
    const 头 = 烟花火花(10, 10, 5, [18, 9]);
    expect(头.length).toBe(24);
    for (const s of 头) expect((s.x / 18) ** 2 + (s.y / 9) ** 2).toBeCloseTo(1, 5);
    const 后 = 烟花火花(16, 10, 5);
    expect(后.length).toBeGreaterThan(0);
    for (const s of 后) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(5);
    expect(new Set(后.map((s) => Math.sign(Math.round(s.x)))).size).toBeGreaterThan(1);
    expect(烟花火花(40, 10, 5)).toEqual([]);
  });

  it('刹那：这个字拼齐才冻住（先闪、再冰）；裂那一帧各块往外让 裂开 点、闪一下，停一帧后往下掉', () => {
    expect(刹那块(9, 10, 20, [3, -2], 1).冰).toBe(0);
    expect(刹那块(10, 10, 20, [3, -2], 1)).toEqual({ dx: 0, dy: 0, 冰: 1 });
    expect(刹那块(12, 10, 20, [3, -2], 1)).toEqual({ dx: 0, dy: 0, 冰: 2 });
    expect(刹那块(20, 10, 20, [3, -2], 1)).toEqual({ dx: 刹那.裂开, dy: -刹那.裂开, 冰: 1 });
    expect(刹那块(21, 10, 20, [3, -2], 1).冰).toBe(2);
    const 掉 = [22, 24, 26].map((f) => 刹那块(f, 10, 20, [3, -2], 1).dy);
    expect(掉[1]!).toBeGreaterThan(掉[0]!);
    expect(掉[2]!).toBeGreaterThan(掉[1]! + 3);
  });

  it('刹那在成片里（核查 10-24）：「刹」拼齐到裂开冻着 10 帧以上；整句开始退场那一帧，每一块都已经往下掉出一个字高', () => {
    const 行们 = 句们.map((s) => 正片歌词行(s.序));
    const 行 = 行们[10]!;
    const 效 = 行.字效!;
    expect(效.效).toBe('刹那');
    const 时段 = 解码时段(行, 符文歌词默认);
    const 裂 = 正片事件.第11句碎裂.帧;
    expect(裂 - 时段[效.从]!.完).toBeGreaterThanOrEqual(10);
    // 整句从下一句入帧前 出帧 帧退（字状态）
    const 退起 = 行们[11]!.入 - 符文歌词默认.出帧;
    expect(字状态(行们, 10, 退起 - 1, 符文歌词默认).every((s) => s.显 === 1)).toBe(true);
    for (let j = 效.从; j <= 效.到; j++)
      for (let k = 0; k < 8; k++) expect(刹那块(退起, 时段[j]!.完, 裂, [1, 0], 字种(11, j) * 8 + k).dy, `第 ${j} 个字`).toBeGreaterThanOrEqual(字格);
  });

  it('放下：拼齐后停一下，再往下、往左（风从右往左）飘，颜色从白换到樱花粉', () => {
    expect(放下块(11, 10, 1)).toEqual({ dx: 0, dy: 0, 色: 0 });
    const 后 = 放下块(30, 10, 1);
    expect(后.dy).toBeGreaterThan(10);
    expect(后.dx).toBeLessThan(0);
    expect(后.色).toBe(2);
  });
});
