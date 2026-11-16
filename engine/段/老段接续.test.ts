import { describe, expect, it } from 'vitest';
import { checkOldSeg, continueOldSeg } from './老段接续.ts';
import { windowSeg } from './窗口段.ts';

describe('continueOldSeg：老场（defineSeg 写的）摆上场时间线，新段接得上', () => {
  const timeline = continueOldSeg({
    scene: '7-墙头追逐',
    legacySegs: [
      { key: '7-墙头', sec: 1.25 },
      { key: '7-音波', sec: 3.7 },
      { key: '7-上塔', sec: 1.2 },
    ],
    events: { 新起: { 在: { after: '7-上塔.止' } }, 新止: { 在: { after: '新起', addSec: 2 } } },
    sound: [{ asset: '音效/风', 在: '7-上塔.起', 增益: 0.5 }],
  });

  it('老段按清单顺序首尾相接；画幅默认 1280×720；带一张老段表', () => {
    expect(timeline.events['7-墙头.起'].sec).toBe(0);
    expect(timeline.events['7-音波.起'].sec).toBe(1.25);
    expect(timeline.events['7-上塔.止'].sec).toBeCloseTo(6.15);
    expect([timeline.width, timeline.height]).toEqual([1280, 720]);
    expect(timeline.legacySegs.map((x) => x.startSec)).toEqual([0, 1.25, 4.95]);
  });

  it('新段从老段的止起；场声音从老段里起的，新段只放落进来的那截', () => {
    const nextSeg = windowSeg(timeline, { start: '新起', end: '新止', soundTable: { asset: { '音效/风': { duration: 2 } }, lines: {} } });
    expect(nextSeg.sceneWindow.startSec).toBeCloseTo(6.15);
    expect(nextSeg.sec).toBeCloseTo(2);
    // 风 在 7-上塔 起（4.95 秒）放 2 秒：新段里还剩 0.8 秒，从文件第 1.2 秒接着放
    const [c] = nextSeg.sound!;
    expect(c).toMatchObject({ sec: 0, asset: '音效/风', name: '风', 增益: 0.5 });
    expect(c!.lines === undefined && [c!.长秒, c!.入点秒].map((x) => Math.round(x! * 1e9) / 1e9)).toEqual([0.8, 1.2]);
  });

  it('起秒 可以手给（老时间线里段间跳过一截的、有场窗口的）', () => {
    const resolved = continueOldSeg({ scene: '7-墙头追逐', legacySegs: [{ key: 'a', sec: 1 }, { key: 'b', sec: 1, startSec: 3 }] });
    expect(resolved.events['b.止'].sec).toBe(4);
  });

  it('重复、重名、段长不对、空表都报错', () => {
    expect(() => continueOldSeg({ scene: '7-墙头追逐', legacySegs: [{ key: 'a', sec: 1 }, { key: 'a', sec: 1 }] })).toThrow(/列了两次/);
    expect(() => continueOldSeg({ scene: '7-墙头追逐', legacySegs: [{ key: 'a', sec: 1 }], events: { 'a.止': { 在: { sec: 1 } } } as never })).toThrow(/重名/);
    expect(() => continueOldSeg({ scene: '7-墙头追逐', legacySegs: [{ key: 'a', sec: 0 }] })).toThrow(/正数/);
    expect(() => continueOldSeg({ scene: '7-墙头追逐', legacySegs: [] })).toThrow(/至少一个/);
  });

  it('核老段：抄的段长、场、画幅和老段的 段.ts 对', () => {
    const segments: Record<string, { scene: string; sec: number; width: number; height: number }> = {
      '7-墙头': { scene: '7-墙头追逐', sec: 1.25, width: 1280, height: 720 },
      '7-音波': { scene: '7-墙头追逐', sec: 3.75, width: 1280, height: 720 },
      '7-上塔': { scene: '7-收场', sec: 1.2, width: 1920, height: 720 },
    };
    expect(checkOldSeg(timeline, (k) => segments[k])).toEqual([
      '老段 7-音波 的段长：时间线里抄的 3.7 秒，段.ts 里 3.75 秒',
      '老段 7-上塔 是场 7-收场 的段，不在 7-墙头追逐',
      '老段 7-上塔 的画幅（1920×720）和场时间线（1280×720）不一样',
    ]);
    expect(checkOldSeg(timeline, () => undefined)[0]).toBe('老段 7-墙头 不在清单里');
  });
});
