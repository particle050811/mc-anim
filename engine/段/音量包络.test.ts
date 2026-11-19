import { describe, expect, it } from 'vitest';
import { cueGain, defineSeg, type AssetCue } from './段定义.ts';
import { makeSoundHelper } from './声音助手.ts';
import { applyEnvelopes, checkEnvelope, cueGainAt, envelopeGain, type GainEnvelope } from './音量包络.ts';
import { defineSceneTimeline, windowSeg } from './窗口段.ts';

const fromDb = (d: number) => 10 ** (d / 20);
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const cue = (o: Partial<AssetCue>): AssetCue => ({ sec: 0, asset: '音效/钟', name: '钟', 长秒: 1, ...o });
/** 段内第 k 帧（60 帧）上 cue 的增益，照 <SegSound> 的取法 */
const atFrame = (c: AssetCue, k: number) => cueGainAt(c, k / 60 - c.sec);

describe('音量包络', () => {
  const dip: GainEnvelope = [{ sec: 1, db: 0 }, { sec: 1.5, db: -6 }, { sec: 2, db: -6 }, { sec: 2.25, db: 0, curve: 'equalPowerIn' }];

  it('点之间按倍数插：半余弦、等功率淡入淡出；点外取头尾', () => {
    expect(envelopeGain(dip, 0)).toBe(1);
    expect(envelopeGain(dip, 1.25)).toBeCloseTo(1 + (fromDb(-6) - 1) * ease(0.5), 12);
    expect(envelopeGain(dip, 1.8)).toBeCloseTo(fromDb(-6), 12);
    expect(envelopeGain(dip, 9)).toBe(1);
    const fade: GainEnvelope = [{ sec: 0, db: -Infinity }, { sec: 1, db: 0, curve: 'equalPowerIn' }, { sec: 2, db: 0 }, { sec: 3, db: -Infinity, curve: 'equalPowerOut' }];
    expect(envelopeGain(fade, 0.3)).toBeCloseTo(Math.sin((Math.PI / 2) * 0.3), 12);
    expect(envelopeGain(fade, 2.3)).toBeCloseTo(Math.cos((Math.PI / 2) * 0.3), 12);
    expect(envelopeGain(fade, 3)).toBe(0);
    expect(() => checkEnvelope([{ sec: 1, db: 0 }, { sec: 0.5, db: 0 }], '试')).toThrow(/按秒排/);
  });

  it('整条落在常数区只乘一个数（倍数 1 原样返回），淡出秒留着', () => {
    const c = cue({ sec: 1.6, 长秒: 0.3, 增益: 0.5, fadeOutSec: 0.1 });
    expect(applyEnvelopes(c, [dip], 0)).toEqual({ ...c, 增益: Math.round(0.5 * fromDb(-6) * 1e6) / 1e6 });
    const before = cue({ sec: 0.2, 长秒: 0.7 });
    expect(applyEnvelopes(before, [dip], 0)).toBe(before);
  });

  it('碰到坡道：包络表只铺坡道那一截，格落在输出帧上（cue 起点不在帧上也对），每帧和公式一样；增益不动', () => {
    const c = cue({ sec: 0.9071, 长秒: 1.8, 增益: 0.5 });
    const out = applyEnvelopes(c, [dip], 0);
    expect(out.增益).toBe(0.5);
    expect(out.envelope!.startSec).toBeCloseTo(60 / 60 - 0.9071, 12);
    expect(out.envelope!.value.length).toBe(76); // 1 → 2.25 秒，中间保持的那截也在表里
    for (let k = Math.ceil(c.sec * 60); k / 60 < c.sec + c.长秒; k++) expect(atFrame(out, k)).toBeCloseTo(0.5 * envelopeGain(dip, k / 60), 6);
    expect(() => defineSeg({ scene: '核对', sec: 3, width: 1, height: 1, terrain: [], sound: [out] })).not.toThrow();
  });

  it('本来随时间变的（逐格增益、淡出秒）照旧，包络表乘在上面', () => {
    const perCell = cue({ sec: 1.2, 长秒: 0.5, 增益: { perSec: 24, value: Array.from({ length: 13 }, (_, i) => 1 - i / 24) } });
    const out = applyEnvelopes(perCell, [dip], 0);
    for (let k = 72; k < 102; k++) expect(atFrame(out, k)).toBeCloseTo(atFrame(perCell, k) * envelopeGain(dip, k / 60), 6);
    const faded = cue({ sec: 1.2, 长秒: 0.5, 增益: 0.8, fadeOutSec: 0.2 });
    const out2 = applyEnvelopes(faded, [dip], 0);
    expect(out2.fadeOutSec).toBe(0.2);
    for (let k = 72; k < 102; k++) expect(atFrame(out2, k)).toBeCloseTo(atFrame(faded, k) * envelopeGain(dip, k / 60), 6);
  });

  it('几条包络相乘；offsetSec 把包络的时间轴挪到段内秒', () => {
    const lift: GainEnvelope = [{ sec: 11.1, db: 0 }, { sec: 11.3, db: 3 }];
    const c = cue({ sec: 1, 长秒: 1.5 });
    const out = applyEnvelopes(c, [dip.map((p) => ({ ...p, sec: p.sec + 10 })), lift], 10);
    for (let k = 60; k < 150; k++) expect(atFrame(out, k)).toBeCloseTo(envelopeGain(dip, k / 60) * envelopeGain(lift, 10 + k / 60), 6);
    // 已带包络表的再乘一条：两张表的并
    const again = applyEnvelopes(out, [[{ sec: 2.4, db: 0 }, { sec: 2.45, db: -6 }]], 0);
    for (let k = 60; k < 150; k++) expect(atFrame(again, k)).toBeCloseTo(atFrame(out, k) * envelopeGain([{ sec: 2.4, db: 0 }, { sec: 2.45, db: -6 }], k / 60), 6);
    expect(cueGain(again, 0.5)).toBe(1);
  });

  it('放() 的 gainEnvelope：点是段内秒，乘在峰值算出的倍数上', () => {
    const { 放: play } = makeSoundHelper({ sec: 4, 表: { asset: { '配乐/歌': { duration: 10, peakDb: -6 } }, lines: {} } });
    const c = play('配乐/歌', 0.5, { peakDb: -12, gainEnvelope: [{ sec: 0.5, db: -Infinity }, { sec: 0.56, db: 0, curve: 'equalPowerIn' }] });
    expect(atFrame(c, 30)).toBe(0);
    expect(atFrame(c, 32)).toBeCloseTo(fromDb(-6) * Math.sin((Math.PI / 2) * (2 / 60 / 0.06)), 6);
    expect(atFrame(c, 120)).toBeCloseTo(fromDb(-6), 6);
  });
});

describe('场时间线的 gainAutomation', () => {
  const timeline = defineSceneTimeline({
    scene: '9-试场',
    events: { 开: { 在: { sec: 0 } }, 收: { 在: { sec: 2 } } },
    sound: [
      { asset: '配乐/底', name: '底乐', 在: '开', end: { 长秒: 3 }, 增益: 0.5 },
      { asset: '音效/风', name: '风', 在: '开', end: { 长秒: 3 }, 增益: 0.25 },
    ],
    gainAutomation: [
      { target: { names: ['底乐'] }, points: [{ 在: '收', db: 0 }, { 在: { after: '收', addSec: 0.5 }, db: -Infinity, curve: 'equalPowerOut' }] },
      { target: { kind: '非配乐' }, points: [{ 在: { sec: 0 }, db: -3 }] },
    ],
  });
  const table = { asset: { '配乐/底': { duration: 9 }, '音效/风': { duration: 9 }, '音效/钟': { duration: 1 } }, lines: {} };

  it('按名、按配乐/非配乐挑声音，场声音那截和段里 放() 的都乘；段缝两边接得上', () => {
    const a = windowSeg(timeline, { start: '开', end: { 长秒: 2.2 }, soundTable: table, sound: ({ 放: play }) => [play('音效/钟', 0.1, { 增益: 1 })] });
    const b = windowSeg(timeline, { start: { sec: 2.2 }, end: { 长秒: 0.8 }, soundTable: table });
    const byName = (s: typeof a, n: string) => s.sound!.find((c): c is AssetCue => c.lines === undefined && c.name === n)!;
    expect(byName(a, '钟').增益).toBeCloseTo(fromDb(-3), 6);
    expect(byName(a, '风').增益).toBeCloseTo(0.25 * fromDb(-3), 6);
    const music = (sec: number) => 0.5 * (sec < 2 ? 1 : sec >= 2.5 ? 0 : Math.cos((Math.PI / 2) * ((sec - 2) / 0.5)));
    for (let k = 0; k < 132; k++) expect(atFrame(byName(a, '底乐'), k)).toBeCloseTo(music(k / 60), 6);
    for (let k = 0; k < 48; k++) expect(atFrame(byName(b, '底乐'), k)).toBeCloseTo(music(2.2 + k / 60), 6);
  });
});
