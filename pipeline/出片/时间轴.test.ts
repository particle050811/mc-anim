import { describe, expect, it } from 'vitest';
import type { SoundTable } from '../../engine/段/声音助手.ts';
import { defineSeg, type AssetCue } from '../../engine/段/段定义.ts';
import { defineSceneTimeline, windowSeg } from '../../engine/段/窗口段.ts';
import { checkSoundSeams, seamSegOf } from '../段框架/声音接缝.ts';
import { computeTimeline, joinContinuations, timelineDoc, timelineFileName, type TimelineAudio } from './时间轴.ts';
import type { SourceSeg, WorkSource } from './作品源.ts';

const table: SoundTable = {
  asset: { '配乐/曲': { duration: 200, peakDb: -1 }, '音效/雷': { duration: 7, peakDb: -2 }, '音效/风': { duration: 2, peakDb: -6 }, '音效/滴': { duration: 0.3, peakDb: -3 } },
  lines: { '1-甲-你好': { voice: '配音/1-甲-你好', mouthOpen: 0.2, duration: 1.5 } },
};
const measure = (id: string) => table.asset[id];

// 场时间线：曲子从 1 秒起跨三段放到 9 秒，雷声 3 秒起放到文件完（跨进第二段）；第一段自己写一声被段尾截掉的风、一声放得完的滴
const scene = defineSceneTimeline({
  scene: '1-测试场',
  events: { begin: { 在: { sec: 0 } }, thunder: { 在: { sec: 3 } }, cutOne: { 在: { sec: 4 } }, cutTwo: { 在: { sec: 6.5 } }, finish: { 在: { sec: 10 } } },
  sound: [
    { asset: '配乐/曲', name: '曲', 在: { sec: 1 }, end: { sec: 9 }, 入点秒: 20 },
    { asset: '音效/雷', name: '雷', 在: 'thunder', peakDb: -10 },
  ],
});
const segA = windowSeg(scene, { start: 'begin', end: 'cutOne', soundTable: table, sound: ({ 放: play }) => [play('音效/风', 3.5, { name: '风' }), play('音效/滴', 1, { name: '滴' })] });
const segB = windowSeg(scene, { start: 'cutOne', end: 'cutTwo', soundTable: table, sound: ({ 放: play, 说: say }) => [play('音效/风', 2, { name: '故意截', cutReason: '硬切' }), say('1-甲-你好', 0.5)] });
const segC = windowSeg(scene, { start: 'cutTwo', end: 'finish', soundTable: table });
// 第四段是另一场的老写法段：没有场窗口
const segD = defineSeg({ scene: '2-别处', sec: 1, width: 1280, height: 720, terrain: [] });

const seg = (key: string, def: SourceSeg['def']): SourceSeg => ({ key, serial: key, def, soundTable: table });
const source = (motion: WorkSource['motion'] = null): WorkSource => ({
  work: '测试',
  segments: [seg('1-甲', segA), seg('1-乙', segB), seg('1-丙', segC), seg('2-丁', segD)],
  timelines: { '1-测试场': scene },
  motion,
  measure,
});

describe('成片时间轴', () => {
  it('段首尾相接、帧和秒对得上；片从中间一段起时从 0 算', () => {
    const t = computeTimeline(source(), ['1-甲', '1-乙', '1-丙', '2-丁'], 60);
    expect(t.segments.map((s) => [s.key, s.startFrame, s.frameCount])).toEqual([['1-甲', 0, 240], ['1-乙', 240, 150], ['1-丙', 390, 210], ['2-丁', 600, 60]]);
    t.segments.forEach((s, i) => {
      if (i) expect(s.startFrame).toBe(t.segments[i - 1]!.startFrame + t.segments[i - 1]!.frameCount);
      expect(s.startSec).toBeCloseTo(s.startFrame / 60, 6);
    });
    const part = computeTimeline(source(), ['1-乙', '1-丙'], 60);
    expect(part.segments.map((s) => s.startFrame)).toEqual([0, 150]);
    expect(() => computeTimeline(source(), ['1-甲', '1-丙'], 60)).toThrow(/不挨着/);
  });

  it('场声音每段一截、同一个 group、首尾相接、文件位置接得上', () => {
    const t = computeTimeline(source(), ['1-甲', '1-乙', '1-丙', '2-丁'], 60);
    const music = t.audio.filter((a) => a.name === '曲');
    expect(music.map((a) => a.segment)).toEqual(['1-甲', '1-乙', '1-丙']);
    expect(new Set(music.map((a) => a.group))).toEqual(new Set(['场声音:曲']));
    expect(music.every((a) => a.kind === '配乐')).toBe(true);
    for (let i = 1; i < music.length; i++) {
      expect(music[i]!.startSec).toBeCloseTo(music[i - 1]!.startSec + music[i - 1]!.durSec, 6);
      expect(music[i]!.inSec).toBeCloseTo(music[i - 1]!.inSec + music[i - 1]!.durSec, 6);
    }
    expect(music[0]!.startSec).toBe(1);
    expect(music.at(-1)!.startSec + music.at(-1)!.durSec).toBeCloseTo(9, 6);
    const thunder = t.audio.filter((a) => a.name === '雷');
    expect(thunder.map((a) => [a.segment, a.group, a.cutAtSegEnd])).toEqual([['1-甲', '场声音:雷', false], ['1-乙', '场声音:雷', false], ['1-丙', '场声音:雷', false]]);
    // 段里自己写的不算跨段
    expect(t.audio.find((a) => a.name === '滴')!.group).toBeNull();
  });

  it('cutAtSegEnd 和 anim check 的声音接缝检查判的一样；写了 cutReason 的照样标 true、带上原因', () => {
    const src = source();
    const t = computeTimeline(src, ['1-甲', '1-乙', '1-丙', '2-丁'], 60);
    const issues = checkSoundSeams(src.segments.map((s) => seamSegOf(s.key, s.def)), measure).filter((x) => x.baselineKey.endsWith('\t截掉'));
    const cut = t.audio.filter((a) => a.cutAtSegEnd && !a.cutReason).map((a) => `${a.segment}\t${a.name}\t截掉`);
    expect(cut.sort()).toEqual(issues.map((x) => x.baselineKey).sort());
    expect(cut).toEqual(['1-甲\t风\t截掉']);
    expect(t.audio.find((a) => a.name === '故意截')).toMatchObject({ cutAtSegEnd: true, cutReason: '硬切' });
    // 只出前两段：片尾那段接没接按清单里真正的下一段判，和整片一样
    const part = computeTimeline(src, ['1-甲', '1-乙'], 60);
    expect(part.audio.filter((a) => a.cutAtSegEnd).map((a) => a.name)).toEqual(['风', '故意截']);
  });

  it('段里自己写的声音下一段从段头接着放：认成同一组（接续）', () => {
    const a = defineSeg({ scene: 'x', sec: 2, width: 1, height: 1, terrain: [], sound: [{ sec: 1, asset: '音效/雷', name: '雷', 长秒: 1 }] });
    const b = defineSeg({ scene: 'x', sec: 2, width: 1, height: 1, terrain: [], sound: [{ sec: 0, asset: '音效/雷', name: '雷（接）', 长秒: 2, 入点秒: 1 } satisfies AssetCue] });
    const t = computeTimeline({ work: 'w', segments: [seg('甲', a), seg('乙', b)], timelines: {}, motion: null, measure }, ['甲', '乙'], 60);
    expect(t.audio.map((x) => [x.id, x.group, x.cutAtSegEnd])).toEqual([['甲/0', '接续:甲/0', false], ['乙/0', '接续:甲/0', true]]); // 乙 是片尾，雷声没放完
  });

  it('同一文件接着放的几截跨名字、跨段归成一组（战斗曲 → 战斗曲-齐放 → 下一段）', () => {
    const joined = defineSceneTimeline({
      scene: '1-测试场',
      events: { begin: { 在: { sec: 0 } }, cutOne: { 在: { sec: 4 } }, cutTwo: { 在: { sec: 6.5 } }, finish: { 在: { sec: 10 } } },
      sound: [
        { asset: '配乐/曲', name: '曲', 在: { sec: 1 }, end: { sec: 5 }, 入点秒: 20 },
        { asset: '配乐/曲', name: '曲-齐放', 在: { sec: 5 }, end: { sec: 9 }, 入点秒: 24 },
        // 同一文件、时间上也挨着，但文件位置跳了：不算接着放
        { asset: '配乐/曲', name: '曲-跳', 在: { sec: 9 }, end: { sec: 9.5 }, 入点秒: 60 },
      ],
    });
    const segs = [
      seg('1-甲', windowSeg(joined, { start: 'begin', end: 'cutOne', soundTable: table })),
      seg('1-乙', windowSeg(joined, { start: 'cutOne', end: 'cutTwo', soundTable: table })),
      seg('1-丙', windowSeg(joined, { start: 'cutTwo', end: 'finish', soundTable: table })),
    ];
    const t = computeTimeline({ work: 'w', segments: segs, timelines: { '1-测试场': joined }, motion: null, measure }, ['1-甲', '1-乙', '1-丙'], 60);
    const music = t.audio.filter((a) => a.asset === '配乐/曲').sort((a, b) => a.startSec - b.startSec);
    expect(music.map((a) => [a.segment, a.name, a.group])).toEqual([
      ['1-甲', '曲', '场声音:曲'],
      ['1-乙', '曲', '场声音:曲'],
      ['1-乙', '曲-齐放', '场声音:曲'],
      ['1-丙', '曲-齐放', '场声音:曲'],
      ['1-丙', '曲-跳', '场声音:曲-跳'],
    ]);
  });

  it('接着放的判定：起点差 1 毫秒内、文件位置差 2 毫秒内、同速率', () => {
    const item = (id: string, startSec: number, durSec: number, inSec: number, extra: Partial<TimelineAudio> = {}): TimelineAudio => ({
      id, segment: '甲', kind: '音效', name: id, asset: '音效/雷', startSec, durSec, inSec, rate: 1, loop: false,
      gainDb: 0, endGainDb: 0, fadeOutSec: null, group: null, fileDurSec: 7, cutAtSegEnd: false, cutReason: null, ...extra,
    });
    const run = (...xs: TimelineAudio[]) => (joinContinuations(xs), xs.map((x) => x.group));
    expect(run(item('a', 0, 1, 2), item('b', 1.0009, 1, 3.0019))).toEqual(['接续:a', '接续:a']);
    expect(run(item('a', 0, 1, 2), item('b', 1.002, 1, 3))).toEqual([null, null]); // 中间空了 2 毫秒
    expect(run(item('a', 0, 1, 2), item('b', 1, 1, 3.003))).toEqual([null, null]); // 文件跳了 3 毫秒
    expect(run(item('a', 0, 1, 2, { rate: 1.5 }), item('b', 1, 1, 3.5))).toEqual([null, null]); // 速率不同
    expect(run(item('a', 0, 1, 2, { rate: 1.5 }), item('b', 1, 1, 3.5, { rate: 1.5 }))).toEqual(['接续:a', '接续:a']);
    expect(run(item('a', 0, 1, 2), item('b', 1, 1, 3, { asset: '音效/风' }))).toEqual([null, null]);
    // 循环的绕回文件开头
    expect(run(item('a', 0, 8, 0, { loop: true }), item('b', 8, 1, 1, { loop: true }))).toEqual(['接续:a', '接续:a']);
    // 后一截原来的组整组并过来，前一截的组名不变
    expect(run(item('a', 0, 1, 2, { group: '场声音:甲' }), item('b', 1, 1, 3, { group: '场声音:乙' }), item('c', 2, 1, 4, { group: '场声音:乙' }))).toEqual(['场声音:甲', '场声音:甲', '场声音:甲']);
  });

  it('台词：按开口秒算起放、入点', () => {
    const t = computeTimeline(source(), ['1-甲', '1-乙'], 60);
    const line = t.audio.find((a) => a.kind === '台词')!;
    expect(line).toMatchObject({ segment: '1-乙', name: '1-甲-你好', asset: '1-甲-你好', startSec: 4.3, inSec: 0, gainDb: 0, fileDurSec: 1.5 });
  });

  it('事件换成成片秒，段缝上的只记一次；镜头按动作体检的切镜换成本片帧', () => {
    const cuts = [{ frame: 0, shot: '远' }, { frame: 300, shot: '近' }, { frame: 600, shot: '别处' }];
    const motion = { fps: 60, frames: 660, cuts, samples: [] };
    const t = computeTimeline(source(motion), ['1-乙', '1-丙'], 60);
    expect(t.markers.map((m) => [m.name, m.sec, m.segment])).toEqual([['cutOne', 0, '1-乙'], ['cutTwo', 2.5, '1-乙'], ['finish', 6, '1-丙']]);
    expect(t.shots.map((s) => [s.name, s.startFrame, s.segment])).toEqual([['远', 0, '1-乙'], ['近', 60, '1-乙']]);
    // 动作体检的帧数和整部作品对不上就不给镜头
    expect(computeTimeline(source({ ...motion, frames: 100 }), ['1-甲'], 60).shots).toEqual([]);
  });

  it('文件名跟着 mp4 名；头部的总帧数、秒', () => {
    expect(timelineFileName('雷声接缝修正.mp4')).toBe('雷声接缝修正.时间轴.json');
    expect(timelineFileName('成片-60帧-3840x2160.mp4')).toBe('成片-60帧-3840x2160.时间轴.json');
    const doc = timelineDoc({ work: '测试', film: '片', video: '片.mp4', fps: 60, code: null, stale: false, body: computeTimeline(source(), ['1-甲', '1-乙'], 60) });
    expect(doc).toMatchObject({ format: 'mc-anim-timeline', version: 1, frameCount: 390, durationSec: 6.5 });
  });
});
