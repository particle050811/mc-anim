import { describe, expect, it } from 'vitest';
import { statsBySegment, type SegmentRange } from '../bili/时间轴.ts';
import { comparisonRows, pickBothDropped, pickBothRetained } from '../平台/对照.ts';
import type { MatchedRow } from '../平台/图与排名.ts';
import { formatMinSec, douyinTitle, parseDouyin, type DouyinRawPackage } from './数据.ts';
import { first5sCompare, segmentEntryBeforeAfter } from './报告.ts';

const rawPack: DouyinRawPackage = {
  version: 1, platform: '抖音', fetchedAt: '2026-10-22T08:24:00Z', errors: [], requestCount: 1, stoppedByRiskControl: null,
  work: [{
    id: '1', title: '[Opus 5.5]应力转动 6 出征暮色 一开始\n第二行 #AI', durationMs: 9500, release: 1792503012,
    metrics: { view_count: '100', bounce_rate_2s: '0.194006', completion_rate_5s: '0.56', cover_show: '20' },
    retention: { ownWork: [{ key: '00:00', value: 1 }, { key: '00:03', value: 0.7 }, { key: '00:06', value: 0.5 }, { key: '00:09', value: 0.45 }], peerAuthors: [] },
    bounce: null, progress: { skipped: [{ key: '6', value: 0.1 }], rewatch: [] }, source: [{ key: 'homepage_hot', value: 0.98 }, { key: 'follow', value: 0.02 }], searchTerms: null,
  }],
};

describe('抖音解析', () => {
  it('MM:SS 换秒、指标字符串换数、标题取第一行、来源换中文名', () => {
    expect(formatMinSec('05:51')).toBe(351);
    expect(douyinTitle('应力转动 6 出征暮色 #AI')).toBe('应力转动 6 出征暮色');
    const [a] = parseDouyin(rawPack);
    expect(a!.title).toBe('[Opus 5.5]应力转动 6 出征暮色 一开始');
    expect(a!.duration).toBe(9.5);
    expect(a!.retention.map((p) => p.sec)).toEqual([0, 3, 6, 9]);
    expect(a!.metrics.两秒跳出率).toBeCloseTo(0.194);
    expect(a!.metrics.completionRate).toBeNull();
    expect(a!.source[0]).toEqual({ name: '推荐', share: 0.98 });
    expect(a!.skipped).toEqual([{ sec: 6, value: 0.1 }]);
  });
  it('2s 跳出、5s 完播和同账号其他作品比', () => {
    const [a] = parseDouyin(rawPack);
    const makeVariant = (id: string, bounceRate: number, completeRate: number) => ({ ...a!, id, metrics: { ...a!.metrics, 两秒跳出率: bounceRate, 五秒完播率: completeRate } });
    expect(first5sCompare(a!, [a!, makeVariant('b', 0.3, 0.5), makeVariant('c', 0.1, 0.7)])).toBe('2s 跳出 19.4%，好于其他 2 个作品中的 1 个（30.0%、10.0%）；5s 完播 56.0%，好于其他 2 个作品中的 1 个（50.0%、70.0%）');
    expect(first5sCompare(a!, [a!])).toBe('');
  });
});

const makeRanges = (startEndPairs: [number, number][]): SegmentRange[] => startEndPairs.map(([startSec, endSec], i) => ({ serial: `6-0${i + 1}`, key: `6-${i}`, name: `段${i}`, start: startSec, end: endSec }));

describe('进段前后和两平台对照', () => {
  it('段起点后 6 秒比前 6 秒掉得快 1.3 倍以上算陡降', () => {
    const curve = [{ sec: 0, retention: 1 }, { sec: 12, retention: 0.9 }, { sec: 18, retention: 0.6 }, { sec: 30, retention: 0.55 }];
    const segments = statsBySegment(makeRanges([[0, 12], [12, 30]]), curve, [], { headSec: 0, tailSec: 0 });
    const [c] = segmentEntryBeforeAfter(curve, segments);
    expect(c!.segment.serial).toBe('6-02');
    expect(c!.verdict).toBe('进段后陡降');
  });
  it('两边都高于本平台平均的是都掉人，都低于的是都留得住', () => {
    const segments = makeRanges([[0, 10], [10, 20], [20, 30], [30, 40]]);
    const summarizeRetention = (curve: { sec: number; retention: number }[]): MatchedRow => ({
      curve: { id: 'x', title: 'x', duration: 40, release: '', retention: curve, peerRetention: [], danmakuSec: [], danmaku: [] },
      deliveryName: '第6章', 窗: { headSec: 0, tailSec: 0 }, segment: statsBySegment(segments, curve, [], { headSec: 0, tailSec: 0 }),
    });
    const a = summarizeRetention([{ sec: 0, retention: 1 }, { sec: 10, retention: 0.5 }, { sec: 20, retention: 0.45 }, { sec: 30, retention: 0.3 }, { sec: 40, retention: 0.29 }]);
    const b = summarizeRetention([{ sec: 0, retention: 1 }, { sec: 10, retention: 0.6 }, { sec: 20, retention: 0.58 }, { sec: 30, retention: 0.5 }, { sec: 40, retention: 0.3 }]);
    const rows = comparisonRows(a, b);
    expect(rows.length).toBe(4);
    expect(pickBothDropped(rows).map((r) => r.segment.serial)).toEqual(['6-01']);
    expect(pickBothRetained(rows).map((r) => r.segment.serial)).toEqual(['6-02']);
  });
});
