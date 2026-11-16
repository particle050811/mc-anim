import { describe, expect, it } from 'vitest';
import { arrangeSegs, resolveEvents, resolveMoment, momentFrame } from './时间线.ts';
import { parseSongGrid, type SongMoment } from './歌网格.ts';

const axis = { fps: 24 };

describe('时间线：事件解成秒和帧', () => {
  it('秒、帧、接（加秒、加帧，可以接在后面才写的事件上）', () => {
    const eventTable = {
      a: { 在: { sec: 1 } },
      b: { 在: { after: 'c', addSec: 0.5 } },
      c: { 在: { frame: 30 } },
      d: { 在: { after: 'a', addFrames: 3 }, basis: '示范' },
    };
    const r = resolveEvents(eventTable, axis);
    expect(r.a).toEqual({ sec: 1, frame: 24, basis: '' });
    expect(r.b.sec).toBeCloseTo(1.75);
    expect(r.b.frame).toBe(42);
    expect(r.c).toEqual({ sec: 1.25, frame: 30, basis: '' });
    expect(r.d).toMatchObject({ frame: 27, basis: '示范' });
  });

  it('接成环、接不存在的事件、帧不是整数都报错', () => {
    expect(() => resolveEvents({ a: { 在: { after: 'b' } }, b: { 在: { after: 'a' } } }, axis)).toThrow(/接成了环/);
    expect(() => resolveEvents({ a: { 在: { after: 'x' } } }, axis)).toThrow(/不在表里/);
    expect(() => momentFrame({ frame: 1.5 }, {}, axis)).toThrow(/整数/);
  });

  it('扩展时刻没给 解析 就报错，给了按它换秒', () => {
    const t = { beat: 2 } as unknown as never;
    expect(() => resolveMoment(t, {}, axis)).toThrow(/没给 解析/);
    const resolveTime = parseSongGrid({ firstBeat: 0.1, beatSec: 0.5, beatsPerBar: 4 }, [{ 序: 1, leadIn: 0.9, 起: 1, 止: 2 }]);
    const songAxis = { fps: 24, resolveTime };
    const eventTable = { x: { 在: { beat: 2 } as SongMoment }, y: { 在: { measure: 1 } as SongMoment }, z: { 在: { 句: 1, points: '开口' } as SongMoment } };
    const r = resolveEvents(eventTable, songAxis);
    expect([r.x.sec, r.y.sec, r.z.sec]).toEqual([1.1, 2.1, 0.9]);
    expect(() => resolveTime({ 句: 2, points: '起' })).toThrow(/没有第 2 句/);
  });
});

describe('排段：一串首尾相接的窗口', () => {
  const eventTable = { 起: { 在: { sec: 1 } }, 中: { 在: { sec: 2 } }, end: { 在: { sec: 3 } } };
  it('第一段要写起，后面不写起就接上一段；止可以是时刻、帧数或放完', () => {
    const r = arrangeSegs(
      {
        name: '串',
        duration: 4,
        segments: [
          { name: '甲', start: { after: '起', addSec: 0 }, end: { after: '中' } },
          { name: '乙', end: { frameCount: 10 } },
          { name: '丙', end: '放完' },
        ],
      },
      eventTable,
      axis,
    );
    expect(r.map((w) => [w.name, w.起帧, w.止帧])).toEqual([
      ['甲', 24, 48],
      ['乙', 48, 58],
      ['丙', 58, 96],
    ]);
  });
  it('空了、重叠、超出时长、放完没给时长都报错', () => {
    expect(() => arrangeSegs({ name: 's', segments: [{ name: 'a', start: { sec: 0 }, end: { sec: 1 } }, { name: 'b', start: { sec: 1.5 }, end: { sec: 2 } }] }, {}, axis)).toThrow(/中间空了 12 帧/);
    expect(() => arrangeSegs({ name: 's', segments: [{ name: 'a', start: { sec: 0 }, end: { sec: 1 } }, { name: 'b', start: { sec: 0.5 }, end: { sec: 2 } }] }, {}, axis)).toThrow(/重叠了/);
    expect(() => arrangeSegs({ name: 's', duration: 1, segments: [{ name: 'a', start: { sec: 0 }, end: { sec: 2 } }] }, {}, axis)).toThrow(/超出时间轴/);
    expect(() => arrangeSegs({ name: 's', segments: [{ name: 'a', start: { sec: 0 }, end: '放完' }] }, {}, axis)).toThrow(/要给 时长/);
    expect(() => arrangeSegs({ name: 's', segments: [{ name: 'a', end: { sec: 1 } }] }, {}, axis)).toThrow(/要写 起/);
  });
});
