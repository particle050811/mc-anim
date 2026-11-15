import { describe, expect, it } from 'vitest';
import { fps } from '../分镜.ts';
import { blowParams, calendarSize, calendarPageCount, fullPages, leaveSec, paperThickness, pageLayout, flyPose, flyingPages, flownPageCount } from './日历.ts';
import { findCell, weekdays, periods, timetableCells } from './课表数据.ts';

const blowWindow = { 起: 10, 止: 12 };

describe('风吹日历', () => {
  it('起风前停在 100，止 那一刻起停在 1；中间一路往下、不回头', () => {
    expect(calendarPageCount(9.9, blowWindow)).toBe(fullPages);
    expect(calendarPageCount(blowWindow.止, blowWindow)).toBe(1);
    expect(calendarPageCount(13, blowWindow)).toBe(1);
    let prevCount = fullPages;
    for (let i = 0; i < 480; i++) {
      const dayNum = calendarPageCount(blowWindow.起 + i / 240, blowWindow);
      expect(dayNum).toBeLessThanOrEqual(prevCount);
      expect(dayNum).toBeGreaterThanOrEqual(2);
      prevCount = dayNum;
    }
  });

  it('越掉越快：每页离开的间隔一页比一页短，最后一页（2）正好在 止 飞走', () => {
    for (let k = 2; k < fullPages - 1; k++) expect(leaveSec(k + 1, blowWindow) - leaveSec(k, blowWindow)).toBeLessThan(leaveSec(k, blowWindow) - leaveSec(k - 1, blowWindow) + 1e-12);
    expect(leaveSec(1, blowWindow)).toBe(blowWindow.起);
    expect(leaveSec(fullPages - 1, blowWindow)).toBeCloseTo(blowWindow.止);
    // 飞走几页 是 离开秒 的反函数：离开那一刻算飞走
    for (let k = 1; k < fullPages; k++) expect(flownPageCount(leaveSec(k, blowWindow) + 1e-9, blowWindow)).toBeGreaterThanOrEqual(k);
  });

  it('空中的纸：印的数比本子上的大、龄在 0～1，每秒新飞的不超过 每秒最多 太多（不糊成一团白）', () => {
    for (let t = blowWindow.起; t < blowWindow.止 + 0.5; t += 1 / fps) {
      const topCalendars = calendarPageCount(t, blowWindow);
      const flyPages = flyingPages(t, blowWindow);
      for (const x of flyPages) {
        expect(x.数).toBeGreaterThan(topCalendars);
        expect(x.age).toBeGreaterThanOrEqual(0);
        expect(x.age).toBeLessThan(1);
      }
      expect(flyPages.length).toBeLessThanOrEqual(Math.ceil(blowParams.flySec * blowParams.maxPerSec) + 2);
    }
  });

  it('飞姿往右上走，翻的高度在 1～页高；纸叠越吹越薄', () => {
    for (let age = 0; age <= 1; age += 0.05) {
      const s = flyPose(age, 0.5);
      expect(s.dx).toBeGreaterThanOrEqual(0);
      expect(s.dz).toBeGreaterThanOrEqual(0);
      expect(s.高).toBeGreaterThanOrEqual(1);
      expect(s.高).toBeLessThanOrEqual(calendarSize.pageHeight);
    }
    expect(paperThickness(fullPages)).toBe(calendarSize.paperMaxThickness);
    expect(paperThickness(1)).toBe(calendarSize.paperMinThickness);
  });

  it('每一页的大数字和「天」都在页面里', () => {
    for (let page = 1; page <= fullPages; page++) {
      const v = pageLayout(page);
      expect(v.数.x).toBeGreaterThanOrEqual(0);
      expect(v.天.x + v.天.宽).toBeLessThanOrEqual(calendarSize.宽);
      expect(v.数.y + v.数.高).toBeLessThanOrEqual(calendarSize.pageHeight);
    }
  });
});

describe('课表数据', () => {
  it('每一节每一天正好被一个格盖住（合并格不重叠、不漏）', () => {
    const coverage = periods.map(() => weekdays.map(() => 0));
    for (const g of timetableCells) for (let r = g.行; r < g.行 + g.rowSpan; r++) for (let c = g.列; c < g.列 + g.colSpan; c++) coverage[r]![c]! += 1;
    expect(coverage.flat().every((n) => n === 1)).toBe(true);
  });

  it('用户定的几处：晚自修只写自修、周六最后是周测、周日上午数学培优、周日早上留空', () => {
    expect(findCell('周一', '晚自修二').字).toBe('自修');
    expect(findCell('周六', '第9节').字).toBe('周测');
    expect(findCell('周日', '第4节').字).toBe('数学培优班');
    expect(findCell('周日', '第1节').字).toBe('');
    expect(findCell('周一', '第1节').字).toBe('语');
  });
});
