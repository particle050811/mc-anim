import { describe, expect, it } from 'vitest';
import { arrangeSegs, resolveEvents, resolveMoment, momentFrame } from './时间线.ts';
import { parseSongGrid, type SongMoment } from './歌网格.ts';

const axis = { fps: 24 };

describe('时间线：事件解成秒和帧', () => {
  it('秒、帧、接（加秒、加帧，可以接在后面才写的事件上）', () => {
    const eventTable = {
      a: { 在: { 秒: 1 } },
      b: { 在: { after: 'c', addSec: 0.5 } },
      c: { 在: { 帧: 30 } },
      d: { 在: { after: 'a', addFrames: 3 }, 依据: '示范' },
    };
    const r = resolveEvents(eventTable, axis);
    expect(r.a).toEqual({ 秒: 1, 帧: 24, 依据: '' });
    expect(r.b.秒).toBeCloseTo(1.75);
    expect(r.b.帧).toBe(42);
    expect(r.c).toEqual({ 秒: 1.25, 帧: 30, 依据: '' });
    expect(r.d).toMatchObject({ 帧: 27, 依据: '示范' });
  });

  it('接成环、接不存在的事件、帧不是整数都报错', () => {
    expect(() => resolveEvents({ a: { 在: { after: 'b' } }, b: { 在: { after: 'a' } } }, axis)).toThrow(/接成了环/);
    expect(() => resolveEvents({ a: { 在: { after: 'x' } } }, axis)).toThrow(/不在表里/);
    expect(() => momentFrame({ 帧: 1.5 }, {}, axis)).toThrow(/整数/);
  });

  it('扩展时刻没给 解析 就报错，给了按它换秒', () => {
    const t = { beat: 2 } as unknown as never;
    expect(() => resolveMoment(t, {}, axis)).toThrow(/没给 解析/);
    const resolveTime = parseSongGrid({ firstBeat: 0.1, 拍长: 0.5, 每小节拍数: 4 }, [{ 序: 1, leadIn: 0.9, 起: 1, 止: 2 }]);
    const songAxis = { fps: 24, resolveTime };
    const eventTable = { x: { 在: { beat: 2 } as SongMoment }, y: { 在: { measure: 1 } as SongMoment }, z: { 在: { 句: 1, 点: '开口' } as SongMoment } };
    const r = resolveEvents(eventTable, songAxis);
    expect([r.x.秒, r.y.秒, r.z.秒]).toEqual([1.1, 2.1, 0.9]);
    expect(() => resolveTime({ 句: 2, 点: '起' })).toThrow(/没有第 2 句/);
  });
});

describe('排段：一串首尾相接的窗口', () => {
  const eventTable = { 起: { 在: { 秒: 1 } }, 中: { 在: { 秒: 2 } }, end: { 在: { 秒: 3 } } };
  it('第一段要写起，后面不写起就接上一段；止可以是时刻、帧数或放完', () => {
    const r = arrangeSegs(
      {
        名: '串',
        时长: 4,
        segments: [
          { 名: '甲', 起: { after: '起', addSec: 0 }, 止: { after: '中' } },
          { 名: '乙', 止: { 帧数: 10 } },
          { 名: '丙', 止: '放完' },
        ],
      },
      eventTable,
      axis,
    );
    expect(r.map((w) => [w.名, w.起帧, w.止帧])).toEqual([
      ['甲', 24, 48],
      ['乙', 48, 58],
      ['丙', 58, 96],
    ]);
  });
  it('空了、重叠、超出时长、放完没给时长都报错', () => {
    expect(() => arrangeSegs({ 名: 's', segments: [{ 名: 'a', 起: { 秒: 0 }, 止: { 秒: 1 } }, { 名: 'b', 起: { 秒: 1.5 }, 止: { 秒: 2 } }] }, {}, axis)).toThrow(/中间空了 12 帧/);
    expect(() => arrangeSegs({ 名: 's', segments: [{ 名: 'a', 起: { 秒: 0 }, 止: { 秒: 1 } }, { 名: 'b', 起: { 秒: 0.5 }, 止: { 秒: 2 } }] }, {}, axis)).toThrow(/重叠了/);
    expect(() => arrangeSegs({ 名: 's', 时长: 1, segments: [{ 名: 'a', 起: { 秒: 0 }, 止: { 秒: 2 } }] }, {}, axis)).toThrow(/超出时间轴/);
    expect(() => arrangeSegs({ 名: 's', segments: [{ 名: 'a', 起: { 秒: 0 }, 止: '放完' }] }, {}, axis)).toThrow(/要给 时长/);
    expect(() => arrangeSegs({ 名: 's', segments: [{ 名: 'a', 止: { 秒: 1 } }] }, {}, axis)).toThrow(/要写 起/);
  });
});
