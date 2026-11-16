import { describe, expect, it } from 'vitest';
import { cueGain, type AssetCue } from './段定义.ts';
import { sceneSoundPosition, sceneSoundTailSec, sceneSoundSlice, type ResolvedSceneSound } from './场声音.ts';
import { startCollect, endCollect } from './声音助手.ts';
import { defineSceneTimeline, windowSeg } from './窗口段.ts';

const windSound: ResolvedSceneSound = { asset: '音效/风', name: '风', startSec: 1.25, 入点秒: 0.25, 速率: 1.25, peakDb: -12 };
const windAudio = { duration: 3, peakDb: -6 };

/** 照 <SegSound> 的放法（段画面.tsx）：段内第 t 秒落在哪条 cue、放到文件第几秒、增益多少；没有声音给 null */
const placeCues = (cues: readonly AssetCue[], t: number, duration: number) => {
  const c = cues.find((x) => x.sec <= t + 1e-9 && t < x.sec + x.长秒 - 1e-9);
  if (!c) return null;
  const sec = (c.入点秒 ?? 0) + (t - c.sec) * (c.速率 ?? 1);
  return { sec: c.循环 ? sec % duration : sec, 增益: cueGain(c, t - c.sec) };
};

/** 把场时间线切成几段窗口，每 1/60 秒比「各段的那截」和「一口气放完」 */
const compareByTick = (sceneSound: ResolvedSceneSound, info: { duration: number; peakDb?: number }, cutPoints: readonly number[]) => {
  const endSec = sceneSoundTailSec(sceneSound, info);
  const boundaries = [0, ...cutPoints, endSec + 0.5];
  const wholeGain = (T: number) => {
    const g = sceneSound.增益 ?? (sceneSound.peakDb !== undefined ? 10 ** ((sceneSound.peakDb - info.peakDb!) / 20) : 1);
    return sceneSound.fadeOutSec ? g * Math.min(1, (endSec - T) / sceneSound.fadeOutSec) : g;
  };
  let compared = 0;
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const span = { startSec: boundaries[i]!, endSec: boundaries[i + 1]! };
    const cues = sceneSoundSlice(sceneSound, span, info);
    for (let k = Math.ceil(span.startSec * 60 - 1e-9); k / 60 < span.endSec - 1e-9; k++) {
      const T = k / 60;
      const actual = placeCues(cues, T - span.startSec, info.duration);
      if (T < sceneSound.startSec - 1e-9 || T >= endSec - 1e-9) {
        expect(actual, `第 ${T} 秒不该有声`).toBeNull();
        continue;
      }
      expect(actual, `第 ${T} 秒该有声`).not.toBeNull();
      const expected = sceneSoundPosition(sceneSound, info, T);
      const timeDiffSec = Math.abs(actual!.sec - expected);
      expect(Math.min(timeDiffSec, info.duration - timeDiffSec), `第 ${T} 秒`).toBeLessThanOrEqual(1e-6);
      expect(actual!.增益, `第 ${T} 秒`).toBeCloseTo(wholeGain(T), 5);
      compared++;
    }
  }
  expect(compared).toBeGreaterThan(0);
};

describe('场声音那截：上段起、下段接着放，每一刻和一口气放完一样', () => {
  it('不循环：切点前后位置、增益都一样（带入点秒、变速）', () => {
    expect(sceneSoundTailSec(windSound, windAudio)).toBeCloseTo(1.25 + (3 - 0.25) / 1.25);
    compareByTick(windSound, windAudio, [1.7]);
    compareByTick(windSound, windAudio, [1.3, 1.35, 2.1, 2.15]);
  });
  it('切在声音开头、末尾上也对；不沾边的窗口没有 cue', () => {
    const endSec = sceneSoundTailSec(windSound, windAudio);
    compareByTick(windSound, windAudio, [1.25, endSec - 0.05, endSec]);
    expect(sceneSoundSlice(windSound, { startSec: 0, endSec: 1.25 }, windAudio)).toEqual([]);
    expect(sceneSoundSlice(windSound, { startSec: endSec, endSec: endSec + 0.2 }, windAudio)).toEqual([]);
  });
  it('后一段那截的 cue：从段首放，入点秒 = 原入点 + 已放的秒 × 速率', () => {
    const [c] = sceneSoundSlice(windSound, { startSec: 1.75, endSec: 2.5 }, windAudio);
    expect(c).toEqual({ sec: 0, asset: '音效/风', name: '风', 长秒: 0.75, 入点秒: 0.25 + 0.5 * 1.25, 速率: 1.25, 增益: expect.any(Number) });
    expect(sceneSoundSlice(windSound, { startSec: 0, endSec: 1.75 }, windAudio)[0]).toMatchObject({ sec: 1.25, 长秒: 0.5, 入点秒: 0.25 });
  });
  it('淡出按整个声音的尾算：尾在本截里用 淡出秒，尾在后面的段里写逐格增益', () => {
    const fadeOutSound = { ...windSound, fadeOutSec: 0.5 };
    const endSec = sceneSoundTailSec(fadeOutSound, windAudio);
    compareByTick(fadeOutSound, windAudio, [endSec - 0.2]);
    compareByTick(fadeOutSound, windAudio, [1.7, endSec - 0.8]);
    expect(typeof sceneSoundSlice(fadeOutSound, { startSec: 0, endSec: 1.7 }, windAudio)[0]!.增益).toBe('number');
    expect(sceneSoundSlice(fadeOutSound, { startSec: 1.7, endSec: endSec }, windAudio)[0]).toMatchObject({ fadeOutSec: 0.5 });
    expect(sceneSoundSlice(fadeOutSound, { startSec: 1.7, endSec: endSec - 0.2 }, windAudio)[0]!.增益).toMatchObject({ perSec: 60 });
  });
  it('止秒截短', () => {
    const short = { ...windSound, endSec: 1.9 };
    compareByTick(short, windAudio, [1.7]);
    expect(sceneSoundTailSec(short, windAudio)).toBe(1.9);
  });
  it('循环：从文件中间接上时拆成放到文件尾、再从头循环两条', () => {
    const ambientSound: ResolvedSceneSound = { asset: '音效/雨', name: '雨', startSec: 0.2, endSec: 8, 循环: true, 增益: 0.5 };
    const info = { duration: 1.01 };
    compareByTick(ambientSound, info, [2, 2.05, 5]);
    const cuesInWindow = sceneSoundSlice(ambientSound, { startSec: 2, endSec: 5 }, info);
    const loopPos = 1.8 % 1.01;
    const roundFine = (x: number) => Math.round(x * 1e9) / 1e9;
    expect(cuesInWindow.map((c) => [roundFine(c.sec), roundFine(c.长秒), Boolean(c.循环), roundFine(c.入点秒 ?? 0)])).toEqual([
      [0, roundFine(1.01 - loopPos), false, roundFine(loopPos)],
      [roundFine(1.01 - loopPos), roundFine(3 - (1.01 - loopPos)), true, 0],
    ]);
    // 段首正好在文件头：一条循环到底
    const wholeLoop = { ...ambientSound, startSec: 0 };
    expect(sceneSoundSlice(wholeLoop, { startSec: 0, endSec: 4 }, { duration: 1 }).map((c) => c.循环)).toEqual([true]);
    expect(sceneSoundSlice(wholeLoop, { startSec: 2, endSec: 4 }, { duration: 1 })).toEqual([{ sec: 0, asset: '音效/雨', name: '雨', 长秒: 2, 循环: true, 增益: 0.5 }]);
  });
  it('峰值、响度、增益只能给一个；入点秒到了文件尾报错', () => {
    expect(() => sceneSoundSlice({ ...windSound, 增益: 2 }, { startSec: 0, endSec: 3 }, windAudio)).toThrow(/只能给一个/);
    expect(() => sceneSoundSlice({ ...windSound, 入点秒: 3 }, { startSec: 0, endSec: 3 }, windAudio)).toThrow(/文件尾/);
  });
});

describe('场时间线的 声音 + 窗口段', () => {
  const timeline = defineSceneTimeline({
    scene: '9-试场',
    events: { 开场: { 在: { sec: 0 } }, 起风: { 在: { sec: 1 } }, 切: { 在: { sec: 2 } }, 收: { 在: { sec: 4 } } },
    sound: [
      { asset: '音效/风', 在: '起风', peakDb: -12 },
      { asset: '配乐/底', name: '底乐', 在: '开场', end: '收', 循环: true, 增益: 0.3, fadeOutSec: 0.25 },
    ],
  });
  const soundTable = { asset: { '音效/风': { duration: 3, peakDb: -6 }, '配乐/底': { duration: 1.5 } }, lines: {} };

  it('起止解成场时间线的秒；每段自动带上自己窗口里的那截，排在段自己的 cue 后面', () => {
    expect(timeline.sound).toEqual([
      { asset: '音效/风', name: '风', startSec: 1, peakDb: -12 },
      { asset: '配乐/底', name: '底乐', startSec: 0, endSec: 4, 循环: true, 增益: 0.3, fadeOutSec: 0.25 },
    ]);
    const beforeCut = windowSeg(timeline, { start: '开场', end: '切', soundTable: soundTable, sound: ({ 放: play }) => [play('音效/风', 0, { name: '先吹一下', 长秒: 0.1 })] });
    const cutWindow = windowSeg(timeline, { start: '切', end: '收', soundTable: soundTable });
    expect(beforeCut.sound!.map((c) => c.lines === undefined && [c.name, c.sec, c.长秒, c.入点秒 ?? 0])).toEqual([
      ['先吹一下', 0, 0.1, 0],
      ['风', 1, 1, 0],
      ['底乐', 0, 2, 0],
    ]);
    expect(cutWindow.sound!.map((c) => c.lines === undefined && [c.name, c.sec, c.长秒, c.入点秒 ?? 0])).toEqual([
      ['风', 0, 2, 1],
      ['底乐', 0, 1, 0.5],
      ['底乐', 1, 1, 0],
    ]);
    // 底乐 的淡出落在下段最后一条里
    expect(cutWindow.sound!.at(-1)).toMatchObject({ 增益: 0.3, fadeOutSec: 0.25 });
  });
  it('excludeSceneSound：全不放或按名挑；段没有自己的 cue、也没有场声音时不写 声音', () => {
    expect(windowSeg(timeline, { start: '切', end: '收', soundTable: soundTable, excludeSceneSound: true }).sound).toBeUndefined();
    expect(windowSeg(timeline, { start: '切', end: '收', soundTable: soundTable, excludeSceneSound: ['底乐'] }).sound!.map((c) => c.lines === undefined && c.name)).toEqual(['风']);
  });
  it('收集模式：场声音也记进要过的 id；表里没有就先不出 cue', () => {
    const collected = startCollect();
    try {
      const seg = windowSeg(timeline, { start: '切', end: '收' });
      expect(seg.sound).toBeUndefined();
      expect([...collected].sort()).toEqual(['配乐/底', '音效/风']);
    } finally {
      endCollect();
    }
    expect(() => windowSeg(timeline, { start: '切', end: '收' })).toThrow(/跑 anim cues/);
  });
  it('一定不沾边的（起在窗口后）不查表', () => {
    const earlySeg = windowSeg(timeline, { start: '开场', end: { 长秒: 0.5 }, soundTable: { asset: { '配乐/底': { duration: 1.5 } }, lines: {} } });
    expect(earlySeg.sound!.map((c) => c.lines === undefined && c.name)).toEqual(['底乐']);
  });
  it('重名、循环不给止、窗口反了都报错', () => {
    expect(() => defineSceneTimeline({ scene: '9-试', events: { a: { 在: { sec: 0 } } }, sound: [{ asset: '音效/x', 在: 'a' }, { asset: '音效/x', 在: { sec: 1 } }] })).toThrow(/重名「x」/);
    expect(() => defineSceneTimeline({ scene: '9-试', events: { a: { 在: { sec: 0 } } }, sound: [{ asset: '音效/x', 在: 'a', 循环: true }] })).toThrow(/要给 end/);
    expect(() => defineSceneTimeline({ scene: '9-试', events: { a: { 在: { sec: 1 } } }, sound: [{ asset: '音效/x', 在: 'a', end: { sec: 0 } }] })).toThrow(/空的或反了/);
  });
});
