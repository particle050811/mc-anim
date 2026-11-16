import { describe, expect, it } from 'vitest';
import { defineSeg } from './段定义.ts';
import { defineSceneTimeline, isFrameworkSeg, windowSeg, defaultSegFormat } from './窗口段.ts';
import { parseSongGrid, type SongMoment } from './歌网格.ts';

const timeline = defineSceneTimeline({
  scene: '9-试场',
  events: {
    开门: { 在: { sec: 1 } },
    进门: { 在: { after: '开门', addSec: 0.5 } },
    关门: { 在: { frame: 180 } },
  },
});

describe('场时间线', () => {
  it('画幅不给就用 defaultSegFormat；事件解成场时间线的秒（帧 按 60 帧一秒）', () => {
    expect([timeline.width, timeline.height]).toEqual([defaultSegFormat.width, defaultSegFormat.height]);
    expect(timeline.events.进门.sec).toBe(1.5);
    expect(timeline.events.关门.sec).toBe(3);
  });
  it('扩展时刻（歌网格）', () => {
    const songTimeline = defineSceneTimeline({ scene: '核对', resolveTime: parseSongGrid({ firstBeat: 0, beatSec: 0.5, beatsPerBar: 4 }), events: { a: { 在: { measure: 1 } as SongMoment } } });
    expect(songTimeline.events.a.sec).toBe(2);
  });
});

describe('窗口段：段.ts 里不写段键、段长、画幅', () => {
  it('窗口取事件，段长、场窗口、事件的段内秒都推出来；声音回调拿到段内事件秒', () => {
    const seg = windowSeg(timeline, {
      start: '开门',
      end: '关门',
      soundTable: { asset: { '音效/门': { duration: 0.5, peakDb: 0 } }, lines: {} },
      sound: ({ 放: play, 说: say, events: events }) => [play('音效/门', events.开门), say('9-甲-你好', events.进门 + 0.02)],
    });
    expect(seg).toMatchObject({ scene: '9-试场', sec: 2, width: 1280, height: 720, terrain: [], sceneWindow: { startSec: 1, endSec: 3 }, framework: '窗口段' });
    expect(seg.eventSec).toEqual({ 开门: 0, 进门: 0.5, 关门: 2 });
    expect(seg.sound).toEqual([
      { sec: 0, asset: '音效/门', name: '门', 长秒: 0.5 },
      { sec: 0.52, lines: '9-甲-你好' },
    ]);
    expect(isFrameworkSeg(seg)).toBe(true);
    expect(isFrameworkSeg(defineSeg({ scene: '核对', sec: 1, width: 1, height: 1, terrain: [] }))).toBe(false);
    expect(isFrameworkSeg(defineSeg({ scene: '核对', sec: 1, width: 1, height: 1, terrain: [], sound: [{ sec: 0, lines: '甲' }] }))).toBe(true);
  });
  it('止可以给长秒、也可以直接给时刻；窗口对齐到 1/60 秒；连续、地形、叠层原样带上', () => {
    const seg = windowSeg(timeline, { start: '进门', end: { 长秒: 0.5 }, continuous: true, terrain: ['甲'], overlay: [{ name: '字', entry: '叠层字.tsx' }] });
    expect(seg).toMatchObject({ sec: 0.5, sceneWindow: { startSec: 1.5, endSec: 2 }, continuous: true, terrain: ['甲'] });
    expect(windowSeg(timeline, { start: { sec: 0 }, end: { after: '开门', addFrames: 2 } }).sec).toBeCloseTo(62 / 60);
    // 0.4 秒不在 1/60 秒格上的取整到格
    expect(windowSeg(timeline, { start: { sec: 0 }, end: { sec: 0.404 } }).sec).toBeCloseTo(24 / 60);
  });
  it('事件不存在、窗口空或反、超出时长、cue 越过段尾都报错', () => {
    expect(() => windowSeg(timeline, { start: '没有' as '开门', end: '关门' })).toThrow(/没有事件「没有」/);
    expect(() => windowSeg(timeline, { start: '关门', end: '开门', name: '试' })).toThrow(/试的窗口 \[3, 1\) 秒是空的或反了/);
    const shortTimeline = defineSceneTimeline({ scene: '9-试场', duration: 2, events: { a: { 在: { sec: 0 } }, b: { 在: { sec: 3 } } } });
    expect(() => windowSeg(shortTimeline, { start: 'a', end: 'b' })).toThrow(/超出场时间线/);
    expect(() => windowSeg(timeline, { start: '开门', end: '关门', sound: ({ 说: say }) => [say('9-甲-你好', 2.5)] })).toThrow(/秒要在段内/);
  });
});
