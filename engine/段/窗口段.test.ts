import { describe, expect, it } from 'vitest';
import { defineSeg } from './段定义.ts';
import { defineSceneTimeline, isFrameworkSeg, windowSeg, defaultSegFormat } from './窗口段.ts';
import { parseSongGrid, type SongMoment } from './歌网格.ts';

const timeline = defineSceneTimeline({
  场: '9-试场',
  事件: {
    开门: { 在: { 秒: 1 } },
    进门: { 在: { after: '开门', addSec: 0.5 } },
    关门: { 在: { 帧: 180 } },
  },
});

describe('场时间线', () => {
  it('画幅不给就用 defaultSegFormat；事件解成场时间线的秒（帧 按 60 帧一秒）', () => {
    expect([timeline.宽, timeline.高]).toEqual([defaultSegFormat.宽, defaultSegFormat.高]);
    expect(timeline.事件.进门.秒).toBe(1.5);
    expect(timeline.事件.关门.秒).toBe(3);
  });
  it('扩展时刻（歌网格）', () => {
    const songTimeline = defineSceneTimeline({ 场: '核对', resolveTime: parseSongGrid({ firstBeat: 0, 拍长: 0.5, 每小节拍数: 4 }), 事件: { a: { 在: { measure: 1 } as SongMoment } } });
    expect(songTimeline.事件.a.秒).toBe(2);
  });
});

describe('窗口段：段.ts 里不写段键、段长、画幅', () => {
  it('窗口取事件，段长、场窗口、事件的段内秒都推出来；声音回调拿到段内事件秒', () => {
    const seg = windowSeg(timeline, {
      起: '开门',
      止: '关门',
      soundTable: { 资产: { '音效/门': { 时长: 0.5, 峰值: 0 } }, 台词: {} },
      声音: ({ 放: play, 说: say, 事件: events }) => [play('音效/门', events.开门), say('9-甲-你好', events.进门 + 0.02)],
    });
    expect(seg).toMatchObject({ 场: '9-试场', 秒: 2, 宽: 1280, 高: 720, 地形: [], sceneWindow: { startSec: 1, endSec: 3 }, framework: '窗口段' });
    expect(seg.eventSec).toEqual({ 开门: 0, 进门: 0.5, 关门: 2 });
    expect(seg.声音).toEqual([
      { 秒: 0, 资产: '音效/门', 名: '门', 长秒: 0.5 },
      { 秒: 0.52, 台词: '9-甲-你好' },
    ]);
    expect(isFrameworkSeg(seg)).toBe(true);
    expect(isFrameworkSeg(defineSeg({ 场: '核对', 秒: 1, 宽: 1, 高: 1, 地形: [] }))).toBe(false);
    expect(isFrameworkSeg(defineSeg({ 场: '核对', 秒: 1, 宽: 1, 高: 1, 地形: [], 声音: [{ 秒: 0, 台词: '甲' }] }))).toBe(true);
  });
  it('止可以给长秒、也可以直接给时刻；窗口对齐到 1/60 秒；连续、地形、叠层原样带上', () => {
    const seg = windowSeg(timeline, { 起: '进门', 止: { 长秒: 0.5 }, continuous: true, 地形: ['甲'], 叠层: [{ 名: '字', entry: '叠层字.tsx' }] });
    expect(seg).toMatchObject({ 秒: 0.5, sceneWindow: { startSec: 1.5, endSec: 2 }, continuous: true, 地形: ['甲'] });
    expect(windowSeg(timeline, { 起: { 秒: 0 }, 止: { after: '开门', addFrames: 2 } }).秒).toBeCloseTo(62 / 60);
    // 0.4 秒不在 1/60 秒格上的取整到格
    expect(windowSeg(timeline, { 起: { 秒: 0 }, 止: { 秒: 0.404 } }).秒).toBeCloseTo(24 / 60);
  });
  it('事件不存在、窗口空或反、超出时长、cue 越过段尾都报错', () => {
    expect(() => windowSeg(timeline, { 起: '没有' as '开门', 止: '关门' })).toThrow(/没有事件「没有」/);
    expect(() => windowSeg(timeline, { 起: '关门', 止: '开门', 名: '试' })).toThrow(/试的窗口 \[3, 1\) 秒是空的或反了/);
    const shortTimeline = defineSceneTimeline({ 场: '9-试场', 时长: 2, 事件: { a: { 在: { 秒: 0 } }, b: { 在: { 秒: 3 } } } });
    expect(() => windowSeg(shortTimeline, { 起: 'a', 止: 'b' })).toThrow(/超出场时间线/);
    expect(() => windowSeg(timeline, { 起: '开门', 止: '关门', 声音: ({ 说: say }) => [say('9-甲-你好', 2.5)] })).toThrow(/秒要在段内/);
  });
});
