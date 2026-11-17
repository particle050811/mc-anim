// 歌词艺术字的数据和排版：逐字时刻、拼音和 网格.ts 的词对得上，歌词字表收全了字，整句（照逐句排版表断行、分屏）排得进画面，进出场和拼字的时序，
// 符文怎么分块、怎么飞（不出歌词那一条）、同时飞几枚，五个关键词的效果。
// 字表和银河字母贴图由 vitest 按资产锁读（pipeline/资产/vitest插件.ts）。时序那几条的帧号是 60 fps 的（写的是 24 fps 时那一刻 × 2.5）。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { png } from '@engine/model/贴图.ts';
import type { GlyphTable } from '@库/界面/像素字表.ts';
import lyricFontRaw from 'asset:字体/把回忆拼好给你/歌词字';
import sgaPng from 'asset:贴图/界面/银河字母';
import { sentences } from '../配乐/网格.ts';
import { perCharIssues } from '../配乐/逐字.ts';
import { fps, legacyFrameSec, mainCutEvents } from '../分镜.ts';
import { beatGrid } from '../配乐/网格.ts';
import { brightEffect, brightTier, instantEffect, instantBlock, putDownBlock, fireworkSparks } from './歌词字效.ts';
import { splitLayout } from '../场/2-门口/分屏参数.ts';
import { keywords, splitLine, splitYield, pushGap, lyricLayoutTable, lyricBox } from './歌词排版表.ts';
import { pinyin, mainCutLyricLine, entryParams } from './符文歌词数据.ts';
import { splitBlocks, tileCount, glyphSeed, runeScale, flyBlocks, flyPos, flyParams } from './符文拼字.ts';
import { makeGlyphSource, mergeStyle, charStates, glyphCell, layoutLine, runeLyricDefault, decodeTimeSpans, staggerDist, type TimeStyle } from './符文排版.ts';

const workRoot = path.resolve(import.meta.dirname, '..');

describe('歌词艺术字的数据', () => {
  it('逐字时刻：字数和词一样、递增、落在句里', () => {
    expect(perCharIssues()).toEqual([]);
  });

  it('拼音：每句字数和词一样，只有 a～z', () => {
    for (const s of sentences) {
      expect(pinyin[s.序]?.length, `第 ${s.序} 句`).toBe([...s.text].length);
      for (const syllable of pinyin[s.序]!) expect(syllable, `第 ${s.序} 句`).toMatch(/^[a-z]+$/);
    }
  });

  it('歌词文案.txt 和 网格.ts 的词一样（字表照它取）', () => {
    const lines = fs
      .readFileSync(path.join(workRoot, '界面', '歌词文案.txt'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'));
    expect(lines).toEqual(sentences.map((s) => s.text));
  });

  it('正片歌词行：解码帧 = 逐字秒 × fps；入在首字前至少 0.3 秒（第 1 句 0.6 秒），在上一句末字后至少 最短留秒', () => {
    const lyricLine = mainCutLyricLine(8);
    expect(lyricLine.charTimes[11]).toBeCloseTo(27.75 * fps);
    expect(lyricLine.序).toBe(8);
    expect(lyricLine.版?.lineBreaks).toEqual([7]);
    expect(mainCutLyricLine(1).入).toBe(Math.round((1.54 - 0.6) * fps));
    for (const s of sentences) {
      const current = mainCutLyricLine(s.序);
      const prevLine = s.序 > 1 ? mainCutLyricLine(s.序 - 1) : null;
      if (prevLine) expect(current.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(prevLine.charTimes[prevLine.charTimes.length - 1]! + entryParams.minHoldSec * fps);
      // 第 9 句离第 8 句末字只有 0.21 秒，让给上一句的停留
      if (s.序 !== 9) expect(current.charTimes[0]! - current.入, `第 ${s.序} 句`).toBeGreaterThanOrEqual(entryParams.minLeadSec * fps - 0.5);
    }
  });

  it('排版表：每句都有一项；15 个字的句都断了行，断行递增、每段不空；各段 的个数和段数一样', () => {
    for (const s of sentences) {
      const lineLayout = lyricLayoutTable[s.序];
      expect(lineLayout, `第 ${s.序} 句`).toBeDefined();
      const n = [...s.text].length;
      if (n > 14) expect(lineLayout!.lineBreaks?.length, `第 ${s.序} 句「${s.text}」`).toBeGreaterThan(0);
      (lineLayout!.lineBreaks ?? []).forEach((k, i, a) => {
        expect(k).toBeGreaterThan(a[i - 1] ?? 0);
        expect(k).toBeLessThan(n);
      });
      if (lineLayout!.segments) expect(lineLayout!.segments.length, `第 ${s.序} 句`).toBe((lineLayout!.lineBreaks ?? []).length + 1);
    }
  });

  it('关键词：五句各有一个，词在句里，刹那在世界碎掉那一拍裂、时差晚半拍', () => {
    expect(Object.keys(keywords).map(Number)).toEqual([3, 10, 11, 13, 14]);
    for (const lineIndex of [3, 10, 11, 13, 14]) {
      const lyricLine = mainCutLyricLine(lineIndex, 100);
      const wordEffect = lyricLine.wordEffect!;
      expect([...lyricLine.text].slice(wordEffect.从, wordEffect.dest + 1).join('')).toBe(keywords[lineIndex]!.word);
      if (wordEffect.effect === '刹那') expect(wordEffect.shatterFrame).toBe(mainCutEvents.worldShatters.frame - 100);
      if (wordEffect.effect === '时差') expect(wordEffect.halfBeat).toBeCloseTo((beatGrid.beatSec / 2) * fps);
    }
    expect(mainCutLyricLine(1).wordEffect).toBeUndefined();
  });
});

describe('歌词艺术字的排版', () => {
  const sga = png(sgaPng);
  const glyphSource = makeGlyphSource(sga, lyricFontRaw as unknown as GlyphTable, '字体/把回忆拼好给你/歌词字');

  it('银河字母的字宽照原版（ascii_sga.png 量的）', () => {
    const glyphWidths = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((c) => [c, glyphSource.rune(c).width]));
    expect(glyphWidths).toEqual({ a: 5, b: 5, c: 2, d: 5, e: 5, f: 5, g: 3, h: 5, i: 1, j: 1, k: 5, l: 3, m: 5, n: 4, o: 4, p: 3, q: 5, r: 4, s: 2, t: 5, u: 5, v: 5, w: 5, x: 5, y: 3, z: 5 });
    for (const c of 'abcdefghijklmnopqrstuvwxyz') for (const [, y] of glyphSource.rune(c).points) expect(y).toBeLessThan(7);
  });

  it('每句的字都在歌词字表里，步进 18 点', () => {
    for (const s of sentences) for (const char of s.text) expect(glyphSource.advance(char), char).toBe(18);
  });

  it('默认样式加排版表：每行宽不过 1800 像素（左右各留 380）、描边还在画里；底部那句最后一行的字格下沿离底 边距；两行的第二行在第一行下 行距 点', () => {
    const style = runeLyricDefault;
    for (const s of sentences) {
      const lineLayout = lyricLayoutTable[s.序];
      const mergedStyle = mergeStyle(style, lineLayout);
      const { glyphs, lineWidth: lineWidths } = layoutLine(glyphSource, s.text, mergedStyle, 2560, 1440, lineLayout);
      for (const w of lineWidths) expect(w * mergedStyle.glyphScale, `第 ${s.序} 句`).toBeLessThanOrEqual(1800);
      for (const g of glyphs) {
        expect(g.x - 1).toBeGreaterThanOrEqual(0);
        expect((g.x + glyphCell + 1) * mergedStyle.glyphScale).toBeLessThanOrEqual(2560);
      }
    }
    const bottomLine = layoutLine(glyphSource, '爱炙热的你却忘了爱自己', { ...style, 位置: '下' }, 2560, 1440);
    // 点格从左上角数，1440 不是 7 的倍数：底边距按整点取，比 边距 多出零头
    const bottomRow = Math.floor(1440 / style.glyphScale) - Math.round(style.margin / style.glyphScale);
    expect(bottomLine.glyphs[0]!.y + glyphCell).toBe(bottomRow);
    const twoLines = layoutLine(glyphSource, '将快乐全都收集将不开心全都淘汰', style, 2560, 1440, { lineBreaks: [7] });
    expect(twoLines.glyphs[0]!.y * style.glyphScale).toBe(style.margin);
    expect(twoLines.glyphs[7]!.y - twoLines.glyphs[0]!.y).toBe(style.lineGap);
    expect(twoLines.lineWidth).toEqual([7 * 18 - 2, 8 * 18 - 2]);
    const twoLinesBottom = layoutLine(glyphSource, '将快乐全都收集将不开心全都淘汰', { ...style, 位置: '下' }, 2560, 1440, { lineBreaks: [7] });
    expect(twoLinesBottom.glyphs[14]!.y + glyphCell).toBe(bottomRow);
  });

  it('逐句排版（核查 10-24：每句按意思排，不是一律一行顶在上面）：第 3、11 句照旧顶上居中一行；第 2、6、9 句在底部、第 12 句在中段；第 7 句被光柱劈开，两半同一行、缝在画面正中', () => {
    const style = runeLyricDefault;
    const layout = (lineIndex: number) => {
      const s = sentences.find((x) => x.序 === lineIndex)!;
      const lineLayout = lyricLayoutTable[lineIndex]!;
      return { ...layoutLine(glyphSource, s.text, mergeStyle(style, lineLayout), 2560, 1440, lineLayout), n: [...s.text].length };
    };
    for (const lineIndex of [3, 11]) {
      const { glyphs, n } = layout(lineIndex);
      expect(glyphs[0]!.x, `第 ${lineIndex} 句`).toBe(Math.round((2560 / 7 - (n * 18 - 2)) / 2));
      expect(new Set(glyphs.map((g) => g.y))).toEqual(new Set([11]));
    }
    const bottomRow = Math.floor(1440 / style.glyphScale) - Math.round(style.margin / style.glyphScale);
    for (const lineIndex of [2, 6, 9]) expect(Math.max(...layout(lineIndex).glyphs.map((g) => g.y)) + glyphCell, `第 ${lineIndex} 句`).toBe(bottomRow);
    // 第 12 句：上沿在画面 1/7 以下、下沿在一半以上（她坐在床沿，头在画面上半）
    const twelve = layout(12).glyphs;
    expect(Math.min(...twelve.map((g) => g.y)) * style.glyphScale).toBeGreaterThan(1440 / 7);
    expect((Math.max(...twelve.map((g) => g.y)) + glyphCell) * style.glyphScale).toBeLessThan(720);
    // 第 7 句：前 5 个字一段、后 6 个字一段，同一行；两段字格之间 拨开缝 点，缝的中线在画面正中（点格取整差半点）
    const { glyphs: cells, lineWidth: lineWidths } = layout(7);
    expect(new Set(cells.map((g) => g.y))).toEqual(new Set([11]));
    const seamLeft = cells[0]!.x + lineWidths[0]!;
    const seamRight = cells[5]!.x;
    expect(seamRight - seamLeft).toBeGreaterThanOrEqual(pushGap - 1);
    expect(Math.abs(((seamLeft + seamRight) / 2) * style.glyphScale - 1280)).toBeLessThanOrEqual(style.glyphScale);
  });

  it('歌词框：和 排一句 排出来的字格（连描边）一样大', () => {
    for (const s of sentences) {
      const lineLayout = lyricLayoutTable[s.序]!;
      const mergedStyle = mergeStyle(runeLyricDefault, lineLayout);
      const { glyphs } = layoutLine(glyphSource, s.text, mergedStyle, 2560, 1440, lineLayout);
      const box = lyricBox(s.text, lineLayout);
      expect(box.left * 2560, `第 ${s.序} 句`).toBeCloseTo((Math.min(...glyphs.map((g) => g.x)) - 1) * mergedStyle.glyphScale, 6);
      expect(box.下 * 1440, `第 ${s.序} 句`).toBeCloseTo((Math.max(...glyphs.map((g) => g.y)) + glyphCell + 1) * mergedStyle.glyphScale, 6);
    }
  });

  it('错落：两行各自居中后上一行往左、下一行往右各让 错距 的一半；左、右对齐对着整块的边', () => {
    const text = '将快乐全都收集将不开心全都淘汰';
    const refGlyphs = layoutLine(glyphSource, text, runeLyricDefault, 2560, 1440, { lineBreaks: [7] }).glyphs;
    const staggeredCells = layoutLine(glyphSource, text, runeLyricDefault, 2560, 1440, { lineBreaks: [7], textAlign: '错落' }).glyphs;
    expect(staggeredCells[0]!.x - refGlyphs[0]!.x).toBe(-staggerDist / 2);
    expect(staggeredCells[7]!.x - refGlyphs[7]!.x).toBe(staggerDist / 2);
    const leftAlignGlyphs = layoutLine(glyphSource, text, runeLyricDefault, 2560, 1440, { lineBreaks: [7], textAlign: '左' }).glyphs;
    expect(leftAlignGlyphs[0]!.x).toBe(leftAlignGlyphs[7]!.x);
    const rightAlignedCells = layoutLine(glyphSource, text, runeLyricDefault, 2560, 1440, { lineBreaks: [7], textAlign: '右' }).glyphs;
    expect(rightAlignedCells[6]!.x).toBe(rightAlignedCells[14]!.x);
  });

  it('分屏两句（第 13、14 句）：一段在左屏、一段在右屏，同一行，连描边离分屏线（成片 1280～1288）都还有 分屏让 − 2 点（取整），两段只画在自己那一屏；第 14 句左段在左屏太阳右边（第14句.test：太阳右沿在页面 392 以左）', () => {
    const style = runeLyricDefault;
    expect(splitLine).toEqual([splitLayout.serverWidth / 1280, (splitLayout.serverWidth + splitLayout.lineWidth) / 1280]);
    for (const lineIndex of [13, 14]) {
      const s = sentences.find((x) => x.序 === lineIndex)!;
      const lineLayout = lyricLayoutTable[lineIndex]!;
      const { glyphs, lineWidth: lineWidths } = layoutLine(glyphSource, s.text, mergeStyle(style, lineLayout), 2560, 1440, lineLayout);
      const k = lineLayout.lineBreaks![0]!;
      const leftSegmentRight = (glyphs[0]!.x + lineWidths[0]! + 1) * style.glyphScale;
      const rightSegmentLeft = (glyphs[k]!.x - 1) * style.glyphScale;
      expect(1280 - leftSegmentRight, `第 ${lineIndex} 句`).toBeGreaterThanOrEqual((splitYield - 2) * style.glyphScale);
      expect(rightSegmentLeft - 1288, `第 ${lineIndex} 句`).toBeGreaterThanOrEqual((splitYield - 2) * style.glyphScale);
      expect(new Set(glyphs.map((g) => g.y)).size).toBe(1);
      expect(glyphs[0]!.y).toBe(11);
      for (const g of glyphs.slice(0, k)) expect([g.界![0], g.界![1] * style.glyphScale]).toEqual([0, expect.closeTo(1280)]);
      for (const g of glyphs.slice(k)) expect([g.界![0] * style.glyphScale, g.界![1] * style.glyphScale]).toEqual([expect.closeTo(1288), expect.closeTo(2560)]);
    }
    const fourteen = layoutLine(glyphSource, '也为你骗自己放下', runeLyricDefault, 2560, 1440, lyricLayoutTable[14]);
    expect((fourteen.glyphs[0]!.x - 1) * runeLyricDefault.glyphScale).toBeGreaterThanOrEqual(392 * 2);
  });

  it('第 1 句断两行、右对齐放在左半：上行「我们都是」、下行「渺小真实存在」，上沿照旧；连描边右沿在页面 665 以左（2-初入 推近的樱花林左沿约 670），上行左沿在页面 340 以右（2-选择世界 搜索框光标右沿约 333）', () => {
    const lineLayout = lyricLayoutTable[1]!;
    const dotSize = runeLyricDefault.glyphScale;
    const { glyphs, lineWidth: lineWidths } = layoutLine(glyphSource, '我们都是渺小真实存在', runeLyricDefault, 2560, 1440, lineLayout);
    expect(glyphs.slice(0, 4).every((g) => g.y === 11)).toBe(true);
    expect(glyphs.slice(4).every((g) => g.y === 11 + runeLyricDefault.lineGap)).toBe(true);
    expect(glyphs[0]!.x + lineWidths[0]!).toBe(glyphs[4]!.x + lineWidths[1]!);
    expect((glyphs[4]!.x + lineWidths[1]! + 1) * dotSize).toBeLessThanOrEqual(665 * 2);
    expect((glyphs[0]!.x - 1) * dotSize).toBeGreaterThanOrEqual(340 * 2);
  });

  it('分块：每个字的点一个不落、不重地分进 2～3 块（点少于 60 的 2 块），块按书写顺序排', () => {
    for (const s of sentences)
      for (const char of s.text) {
        const glyph = glyphSource.hanChar(char);
        const chunks = splitBlocks(char, glyph);
        expect(chunks.length, char).toBe(Math.min(tileCount(glyph.points.length), glyph.points.length));
        expect(chunks.length).toBe(glyph.points.length < 60 ? 2 : 3);
        const cellKeys = chunks.flatMap((b) => b.points.map(([x, y]) => `${x},${y}`));
        expect(new Set(cellKeys).size, char).toBe(glyph.points.length);
        expect(cellKeys.length, char).toBe(glyph.points.length);
        for (let k = 1; k < chunks.length; k++) expect(chunks[k]!.心[1] * 2 + chunks[k]!.心[0]).toBeGreaterThanOrEqual(chunks[k - 1]!.心[1] * 2 + chunks[k - 1]!.心[0]);
      }
  });

  it('符文飞的路线：顶上那行的符文（按 符文倍 画）不出画面上沿、往下最多伸出字格 下伸 点（不压下面的画面），落定前 1/24 秒离落点不到半个字（原版那条线最后一段才落下去）', () => {
    for (const s of sentences) {
      const lyricLine = mainCutLyricLine(s.序);
      const timeSpans = decodeTimeSpans(lyricLine, runeLyricDefault);
      [...s.text].forEach((char, j) => {
        const chunks = splitBlocks(char, glyphSource.hanChar(char));
        const flights = flyBlocks(chunks, lyricLine.pinyin[j]!, { ...timeSpans[j]!, 入: lyricLine.入 + j * runeLyricDefault.staggerSec * fps }, runeLyricDefault.flySec, glyphSeed(s.序, j));
        flights.forEach((flight, k) => {
          for (let f = Math.ceil(flight.start); f < flight.landTime; f++) {
            const pos = flyPos(flight, f)!;
            const topY = chunks[k]!.心[1] + pos[1] - 3.5 * runeScale;
            expect(topY, `第 ${s.序} 句「${char}」第 ${k} 块`).toBeGreaterThanOrEqual(-flyParams.topGap - 0.5);
            expect(topY + 7 * runeScale).toBeLessThanOrEqual(glyphCell + flyParams.extendDown + 0.5);
          }
          const endPos = flyPos(flight, flight.landTime - legacyFrameSec(1) * fps);
          if (endPos && (flight.landTime - flight.start) / fps >= flyParams.minFlySec) expect(Math.hypot(endPos[0], endPos[1]), `第 ${s.序} 句「${char}」`).toBeLessThan(8);
        });
      });
    }
  });
  it('手机上看得出是拼成的（核查 10-24）：全片同时在飞的符文最多 7 枚；除了句首挤着的字，每个字拼了一半的样子至少停 拼字秒 − 1/24 秒', () => {
    const lyricLines = sentences.map((s) => mainCutLyricLine(s.序));
    // 按 24 fps 那些时刻数（每 1/24 秒一次，同改 60 fps 以前）。60 fps 多出来的中间帧里第 8 句有一帧（歌曲帧 1521）
    // 一枚还差一点落定、一枚刚起飞，叠成 8 枚，只有 1/60 秒
    const frameStep = legacyFrameSec(1) * fps;
    const inFlight: Map<number, number> = new Map();
    lyricLines.forEach((lyricLine, i) => {
      const timeSpans = decodeTimeSpans(lyricLine, runeLyricDefault);
      [...lyricLine.text].forEach((char, j) => {
        const enterFrame = lyricLine.入 + j * runeLyricDefault.staggerSec * fps;
        const flights = flyBlocks(splitBlocks(char, glyphSource.hanChar(char)), lyricLine.pinyin[j]!, { ...timeSpans[j]!, 入: enterFrame }, runeLyricDefault.flySec, glyphSeed(i + 1, j));
        for (const flight of flights) for (let k = Math.ceil(flight.start / frameStep); k * frameStep < flight.landTime; k++) inFlight.set(k, (inFlight.get(k) ?? 0) + 1);
        // 句首的字进场晚（首飞秒），拼字缩短；其余的字整 拼字秒
        if (timeSpans[j]!.start > enterFrame + runeLyricDefault.firstFlySec * fps) expect(timeSpans[j]!.end - timeSpans[j]!.start, `第 ${i + 1} 句「${char}」`).toBeCloseTo(runeLyricDefault.assembleSec * fps, 9);
      });
    });
    expect(Math.max(...inFlight.values())).toBeLessThanOrEqual(7);
  });
});

describe('歌词艺术字的时序', () => {
  // 60 fps 帧：入 7.5、出 7.5、错开 1.25、拼字 17.5、首飞 10、落定提前 2.5、飞 22.5
  const timeStyle: TimeStyle = { enterSec: legacyFrameSec(3), exitSec: legacyFrameSec(3), staggerSec: legacyFrameSec(0.5), assembleSec: legacyFrameSec(7), firstFlySec: legacyFrameSec(4), settleLeadSec: legacyFrameSec(1), flySec: legacyFrameSec(9) };
  const firstWord = { text: '一二', pinyin: ['yi', 'er'], 入: 25, charTimes: [62.5, 75] };
  const second = { text: '三', pinyin: ['san'], 入: 100, charTimes: [115] };

  it('入帧前看不见，入帧那一帧已经走了一帧，第二个字晚 错开秒', () => {
    expect(charStates([firstWord, second], 0, 22.5, timeStyle).map((s) => s.shown)).toEqual([0, 0]);
    expect(charStates([firstWord, second], 0, 24, timeStyle).map((s) => s.shown)).toEqual([0, 0]);
    const s = charStates([firstWord, second], 0, 25, timeStyle);
    expect(s[0]!.shown).toBeCloseTo(1 / 60 / timeStyle.enterSec);
    expect(s[1]!.shown).toBe(0);
    // 第二个字 入 在 25 + 错开秒 × 60 = 26.25
    expect(charStates([firstWord, second], 0, 27, timeStyle)[1]!.shown).toBeCloseTo((0.75 / 60 + 1 / 60) / timeStyle.enterSec);
  });

  it('拼字：起唱前 落定提前秒 拼齐，第一块落定在那之前 拼字秒；和前一个字叠着拼（不再按两字间隔缩短）', () => {
    expect(decodeTimeSpans(firstWord, timeStyle)).toEqual([
      { start: 60 - 17.5, end: 60 },
      { start: 72.5 - 17.5, end: 72.5 },
    ]);
    expect(charStates([firstWord, second], 0, 57.5, timeStyle)[0]!.afterSolve).toBe(-2.5);
    expect(charStates([firstWord, second], 0, 60, timeStyle)[0]!.afterSolve).toBe(0);
  });

  it('句首的字进场晚：第一块不早于进场后 首飞秒，挤到拼齐那一帧为止', () => {
    expect(decodeTimeSpans({ 入: 25, charTimes: [42.5, 50, 35] }, timeStyle)).toEqual([
      { start: 35, end: 40 },
      { start: 36.25, end: 47.5 },
      { start: 32.5, end: 32.5 },
    ]);
  });

  it('下一句入帧前 出秒 退完；最后一句没有 收 一直留着', () => {
    expect(charStates([firstWord, second], 0, 90, timeStyle).every((s) => s.shown === 1)).toBe(true);
    expect(charStates([firstWord, second], 0, 100, timeStyle).every((s) => s.shown === 0)).toBe(true);
    expect(charStates([firstWord, second], 1, 1250, timeStyle)[0]!.shown).toBe(1);
    expect(charStates([firstWord, second], 1, 1250, timeStyle, 250)[0]!.shown).toBe(0);
  });

  it('最后一个字还没拼完时，等它拼完再退（最晚退到下一句入帧）', () => {
    const squeeze = { text: '四', pinyin: ['si'], 入: 70, charTimes: [82.5] };
    // 一 的「二」75 起唱、72.5 才拼完，下一句 70 进：退场不从 70 − 7.5 = 62.5 起，等到 70（下一句入帧）
    expect(charStates([firstWord, squeeze], 0, 67.5, timeStyle).every((s) => s.shown === 1)).toBe(true);
    expect(charStates([firstWord, squeeze], 0, 70, timeStyle)[0]!.shown).toBeLessThan(1);
  });

  it('正片 15 句、默认样式：上一句到下一句入帧时已经退完；每个字唱到时已经拼齐、拼完前没退场', () => {
    const lyricLines = sentences.map((s) => mainCutLyricLine(s.序));
    lyricLines.forEach((lyricLine, i) => {
      const nextLine = lyricLines[i + 1];
      if (nextLine) expect(charStates(lyricLines, i, nextLine.入, runeLyricDefault).every((s) => s.shown === 0), `第 ${i + 1} 句「${lyricLine.text}」`).toBe(true);
      lyricLine.charTimes.forEach((t, j) => {
        const s = charStates(lyricLines, i, Math.ceil(t), runeLyricDefault)[j]!;
        expect(s.afterSolve, `第 ${i + 1} 句第 ${j + 1} 个字`).toBeGreaterThanOrEqual(0);
        // 第 9 句首字离第 8 句末字只有 0.21 秒：第 8 句先完整亮 2/24 秒再退，第 9 句的头一个字唱到时还在抖着亮
        if (i === 8 && j === 0) expect(s.shown).toBeGreaterThan(0.5);
        else expect(s.shown, `第 ${i + 1} 句第 ${j + 1} 个字`).toBe(1);
      });
    });
  });

  it('符文：落定按块的顺序排满 起～完（第一块 起、最后一块 完），起飞不早于这个字进场，来不及飞的直接落定', () => {
    const chunks = [{ points: [[0, 0]] as const, 心: [0, 0] as const }, { points: [[1, 1]] as const, 心: [1, 1] as const }, { points: [[2, 2]] as const, 心: [2, 2] as const }];
    const flights = flyBlocks(chunks, 'ni', { start: 50, end: 60, 入: 25 }, legacyFrameSec(8), 1);
    expect(flights.map((x) => x.landTime)).toEqual([50, 55, 60]);
    expect(flights.map((x) => x.start)).toEqual([30, 35, 40]);
    expect(flights.map((x) => x.letter)).toEqual(['n', 'i', 'n']);
    const lateItems = flyBlocks(chunks, 'ni', { start: 50, end: 60, 入: 47.5 }, legacyFrameSec(8), 1);
    expect(lateItems.map((x) => x.start)).toEqual([50, 47.5, 47.5]);
    expect(flyPos(flights[0]!, 27.5)).toBeNull();
    expect(flyPos(flights[0]!, 50)).toBeNull();
    expect(flyPos(flights[0]!, 30)![0]).toBe(flights[0]!.dx);
  });
});

describe('五个关键词的效果', () => {
  it('光明：拼齐前不亮，拼齐头 闪秒 两档、之后一档；每档 2 点', () => {
    expect([22.5, 25, 32.5, 35, 75].map((f) => brightTier(f, 25))).toEqual([0, 2, 2, 1, 1]);
    expect(brightEffect.bandWidth).toBe(2);
    expect(brightEffect.tierColors.length).toBe(2);
  });

  it('烟花：拼齐前没有火花；从词外沿炸开往四面散开，1/4 秒后都离中心远了', () => {
    expect(fireworkSparks(22.5, 25, 5)).toEqual([]);
    const sparks = fireworkSparks(25, 25, 5, [18, 9]);
    expect(sparks.length).toBe(24);
    for (const s of sparks) expect((s.x / 18) ** 2 + (s.y / 9) ** 2).toBeCloseTo(1, 5);
    const laterSparks = fireworkSparks(40, 25, 5);
    expect(laterSparks.length).toBeGreaterThan(0);
    for (const s of laterSparks) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(5);
    expect(new Set(laterSparks.map((s) => Math.sign(Math.round(s.x)))).size).toBeGreaterThan(1);
    expect(fireworkSparks(100, 25, 5)).toEqual([]);
  });

  it('刹那：这个字拼齐才冻住（先闪、再冰）；裂那一帧各块往外让 裂开 点、闪一下，停 1/24 秒后往下掉', () => {
    expect(instantBlock(22.5, 25, 50, [3, -2], 1).ice).toBe(0);
    expect(instantBlock(25, 25, 50, [3, -2], 1)).toEqual({ dx: 0, dy: 0, ice: 1 });
    expect(instantBlock(30, 25, 50, [3, -2], 1)).toEqual({ dx: 0, dy: 0, ice: 2 });
    expect(instantBlock(50, 25, 50, [3, -2], 1)).toEqual({ dx: instantEffect.crackOpen, dy: -instantEffect.crackOpen, ice: 1 });
    expect(instantBlock(52.5, 25, 50, [3, -2], 1).ice).toBe(2);
    const dropOffsets = [55, 60, 65].map((f) => instantBlock(f, 25, 50, [3, -2], 1).dy);
    expect(dropOffsets[1]!).toBeGreaterThan(dropOffsets[0]!);
    expect(dropOffsets[2]!).toBeGreaterThan(dropOffsets[1]! + 3);
  });

  it('刹那在成片里（核查 10-24）：「刹」拼齐到裂开冻着 10/24 秒以上；整句开始退场那一帧，每一块都已经往下掉出一个字高', () => {
    const lyricLines = sentences.map((s) => mainCutLyricLine(s.序));
    const lyricLine = lyricLines[10]!;
    const wordEffect = lyricLine.wordEffect!;
    expect(wordEffect.effect).toBe('刹那');
    const timeSpans = decodeTimeSpans(lyricLine, runeLyricDefault);
    const shatterFrame = mainCutEvents.worldShatters.frame;
    expect((shatterFrame - timeSpans[wordEffect.从]!.end) / fps).toBeGreaterThanOrEqual(legacyFrameSec(10));
    // 第 12 句让聊天、切进卧室才进，第 11 句照原来的时刻（收）退，不跟着拖到接缝
    const fadeOutStart = lyricLine.收!;
    expect(fadeOutStart).toBeLessThan(lyricLines[11]!.入 - runeLyricDefault.exitSec * fps);
    // 退场的渐变按秒连着算，起头前 1/24 秒那一刻还整句亮着
    expect(charStates(lyricLines, 10, fadeOutStart - legacyFrameSec(1) * fps, runeLyricDefault).every((s) => s.shown === 1)).toBe(true);
    expect(charStates(lyricLines, 10, fadeOutStart + runeLyricDefault.exitSec * fps, runeLyricDefault).every((s) => s.shown === 0)).toBe(true);
    for (let j = wordEffect.从; j <= wordEffect.dest; j++)
      for (let k = 0; k < 8; k++) expect(instantBlock(fadeOutStart, timeSpans[j]!.end, shatterFrame, [1, 0], glyphSeed(11, j) * 8 + k).dy, `第 ${j} 个字`).toBeGreaterThanOrEqual(glyphCell);
  });

  it('放下：拼齐后停一下，再往下、往左（风从右往左）飘，颜色从白换到樱花粉', () => {
    expect(putDownBlock(27.5, 25, 1)).toEqual({ dx: 0, dy: 0, 色: 0 });
    const fallingBlock = putDownBlock(75, 25, 1);
    expect(fallingBlock.dy).toBeGreaterThan(10);
    expect(fallingBlock.dx).toBeLessThan(0);
    expect(fallingBlock.色).toBe(2);
  });
});
