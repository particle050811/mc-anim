import { describe, expect, it } from 'vitest';
import type { TimelineAudio, TimelineBody, TimelineSegment } from './时间轴.ts';
import type { MotionFrames } from './作品源.ts';
import { compareSnapshots, contentChanged, formatImpact, motionEpsilon } from './影响面.ts';
import type { Snapshot } from './影响面源.ts';

const fps = 60;
/** 按段长（帧）首尾相接排段 */
const segs = (lens: [string, number][]): TimelineSegment[] => {
  let f = 0;
  return lens.map(([key, n]) => {
    const s = { key, serial: key, startSec: f / fps, durSec: n / fps, startFrame: f, frameCount: n };
    f += n;
    return s;
  });
};
/** 段内 localSec 起放的一截声音 */
const cue = (seg: TimelineSegment, name: string, localSec: number, extra: Partial<TimelineAudio> = {}): TimelineAudio => ({
  id: `${seg.key}/${name}`, segment: seg.key, kind: '音效', name, asset: `音效/${name}`, startSec: seg.startSec + localSec, durSec: 1, inSec: 0, rate: 1, loop: false,
  gainDb: -10, endGainDb: -10, fadeOutSec: null, group: null, fileDurSec: 5, cutAtSegEnd: false, cutReason: null, ...extra,
});
const snap = (label: string, body: Partial<TimelineBody> & { segments: TimelineSegment[] }, motion: MotionFrames | null = null): Snapshot => ({
  label, body: { shots: [], markers: [], audio: [], ...body }, motion,
});
const cmp = (a: Snapshot, b: Snapshot) => compareSnapshots(a, b, { work: '测试', fps });

describe('改动影响面', () => {
  it('前面一段变短：后面的段报成一串整体前移，按段内时间对齐后不算内容变了', () => {
    const o = segs([['甲', 600], ['乙', 300], ['丙', 300]]);
    const n = segs([['甲', 549], ['乙', 300], ['丙', 300]]);
    const rep = cmp(
      snap('旧', { segments: o, audio: [cue(o[1]!, '风', 1), cue(o[2]!, '雷', 2)], shots: [{ name: '近', startSec: o[2]!.startSec, startFrame: o[2]!.startFrame, segment: '丙' }] }),
      snap('新', { segments: n, audio: [cue(n[1]!, '风', 1), cue(n[2]!, '雷', 2)], shots: [{ name: '近', startSec: n[2]!.startSec, startFrame: n[2]!.startFrame, segment: '丙' }] }),
    );
    expect(rep.shifts).toEqual([{ keys: ['乙', '丙'], shiftSec: -0.85, shiftFrames: -51, cause: ['甲 段长 −0.85 秒'] }]);
    const by = Object.fromEntries(rep.segments.map((s) => [s.key, s]));
    expect(by['甲']).toMatchObject({ durDeltaFrames: -51, shiftFrames: 0 });
    expect([by['乙']!, by['丙']!].map(contentChanged)).toEqual([false, false]);
    const text = formatImpact(rep);
    expect(text[0]).toContain('段长变了 1 段，整体平移 2 段');
    expect(text).toContain('乙（成片 9.15–14.15 秒，原 10.00–15.00）：平移以外没变');
  });

  it('声音：挪了、入点、增益、截断位置；改名的配成一对，不算一删一增', () => {
    const [s] = segs([['甲', 600]]);
    const rep = cmp(
      snap('旧', { segments: [s!], audio: [
        cue(s!, '脚步', 2), cue(s!, '雷声', 6, { durSec: 4, cutAtSegEnd: true }), cue(s!, '曲', 0, { kind: '配乐', inSec: 20, gainDb: -11 }), cue(s!, '滴', 3, { gainDb: -10.02 }),
      ] }),
      snap('新', { segments: [s!], audio: [
        cue(s!, '脚步', 1.5), cue(s!, '雷声', 6, { durSec: 3, cutAtSegEnd: true }), cue(s!, '曲', 0, { kind: '配乐', inSec: 20.85, gainDb: -10.8 }), cue(s!, '滴', 3),
        { ...cue(s!, '雷声', 6, { durSec: 3, cutAtSegEnd: true }), name: '现身雷声' },
      ].filter((a, i) => i !== 1) }),
    );
    const audio = Object.fromEntries(rep.segments[0]!.audio.map((a) => [a.name, a]));
    expect(audio['脚步']!.details).toEqual(['起点挪了 −0.500 秒（段内 2.000 → 1.500）']);
    expect(audio['曲']!.details).toEqual(['入点 20.000 → 20.850 秒', '起点增益 -11.0 dB → -10.8 dB']);
    expect(audio['现身雷声']).toMatchObject({ change: '改', details: ['改名「雷声」→「现身雷声」', '长 4.000 → 3.000 秒', '段尾截断的位置变了：截在文件第 4.00 → 3.00 秒'] });
    expect(audio['雷声']).toBeUndefined();
    // 0.05 dB 以内的增益差不报
    expect(audio['滴']).toBeUndefined();
    // 终端里配乐、截断排在前面
    const lines = formatImpact(rep).filter((l) => l.startsWith('  声音'));
    expect(lines.map((l) => l.split('（')[0])).toEqual(['  声音改 曲', '  声音改 现身雷声', '  声音改 脚步']);
  });

  it('声音增删，同名几条按段内起点最近的配', () => {
    const [s] = segs([['甲', 600]]);
    const rep = cmp(
      snap('旧', { segments: [s!], audio: [cue(s!, '脚步', 1), cue(s!, '脚步', 3), cue(s!, '脚步', 5)] }),
      snap('新', { segments: [s!], audio: [cue(s!, '脚步', 1), cue(s!, '脚步', 5.1), cue(s!, '钟', 2)] }),
    );
    expect(rep.segments[0]!.audio.map((a) => [a.change, a.name, a.localSec])).toEqual([['增', '钟', 2], ['删', '脚步', 3], ['改', '脚步', 5.1]]);
  });

  it('切镜：挪了、增、删按段内帧比', () => {
    const [s] = segs([['甲', 600]]);
    const shot = (name: string, frame: number) => ({ name, startSec: frame / fps, startFrame: frame, segment: '甲' });
    const rep = cmp(snap('旧', { segments: [s!], shots: [shot('远', 0), shot('近', 300), shot('特写', 500)] }), snap('新', { segments: [s!], shots: [shot('远', 0), shot('近', 330), shot('侧', 450)] }));
    expect(rep.segments[0]!.shots.map((x) => [x.change, x.name, x.localSec])).toEqual([['挪', '近', 5.5], ['增', '侧', 7.5], ['删', '特写', 8.333]]);
    expect(rep.segments[0]!.shots[0]!.details).toContain('+0.500 秒（30 帧');
  });

  it('动作轨：按段内帧对齐比，小于 1e-4 格的不算；报每镜每轨的最大偏移和区间', () => {
    const o = segs([['甲', 60], ['乙', 120]]);
    const n = segs([['甲', 30], ['乙', 120]]);
    // 乙段内第 g 帧机位在 x=g；新的一边第 60–89 帧多偏 0.5 格，别处只有浮点尾数
    const frames = (segsOf: TimelineSegment[], bump: boolean): MotionFrames => {
      const total = segsOf.at(-1)!.startFrame + segsOf.at(-1)!.frameCount;
      const samples = Array.from({ length: total }, (_, f) => {
        const g = f - segsOf[1]!.startFrame;
        const x = g < 0 ? 0 : g + (bump && g >= 60 && g < 90 ? 0.5 : bump ? motionEpsilon / 2 : 0);
        return { shot: g < 0 ? '一' : '二', points: { camera: [x, 0, 0] as [number, number, number] } };
      });
      return { fps, frames: total, cuts: [], samples };
    };
    const rep = cmp(snap('旧', { segments: o }, frames(o, false)), snap('新', { segments: n }, frames(n, true)));
    const b = rep.segments.find((s) => s.key === '乙')!;
    expect(b.shiftFrames).toBe(-30);
    expect(b.motion).toEqual([{ shot: '二', track: 'camera', maxOffset: 0.5, atLocalSec: 1, atFilmSec: 1.5, firstLocalSec: 1, lastLocalSec: 1.483, frames: 30, onlyOneSide: false }]);
    // 段长变了的只比两边都有的前 0.5 秒，甲 里没偏
    expect(rep.segments.find((s) => s.key === '甲')!.motion).toEqual([]);
  });

  it('段增删：后面的段平移原因写上；没变化时一行说没有变化', () => {
    const o = segs([['甲', 60], ['乙', 60]]);
    const n = segs([['甲', 60], ['新', 30], ['乙', 60]]);
    const rep = cmp(snap('旧', { segments: o }), snap('新', { segments: n }));
    expect(rep.segments.map((s) => [s.key, s.status])).toEqual([['甲', '在'], ['新', '增'], ['乙', '在']]);
    expect(rep.shifts).toEqual([{ keys: ['乙'], shiftSec: 0.5, shiftFrames: 30, cause: ['新 是新加的（0.50 秒）'] }]);
    expect(formatImpact(cmp(snap('旧', { segments: o }), snap('新', { segments: o })))[0]).toMatch(/没有变化$/);
  });
});
