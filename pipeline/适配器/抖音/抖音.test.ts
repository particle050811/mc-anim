import { describe, expect, it } from 'vitest';
import { statsBySegment, type SegmentRange } from '../bili/时间轴.ts';
import { comparisonRows, pickBothDropped, pickBothRetained } from '../平台/对照.ts';
import type { MatchedRow } from '../平台/图与排名.ts';
import { formatMinSec, douyinTitle, parseDouyin, type DouyinRawPackage } from './数据.ts';
import { first5sCompare, segmentEntryBeforeAfter } from './报告.ts';

const rawPack: DouyinRawPackage = {
  版本: 1, 平台: '抖音', 取于: '2026-10-22T08:24:00Z', 错误: [], 请求数: 1, 停于风控: null,
  作品: [{
    id: '1', 标题: '[Opus 5.5]应力转动 6 出征暮色 一开始\n第二行 #AI', 时长毫秒: 9500, 发布: 1792503012,
    指标: { view_count: '100', bounce_rate_2s: '0.194006', completion_rate_5s: '0.56', cover_show: '20' },
    留存: { 本作: [{ key: '00:00', value: 1 }, { key: '00:03', value: 0.7 }, { key: '00:06', value: 0.5 }, { key: '00:09', value: 0.45 }], 同类作者: [] },
    跳出: null, 进度: { 跳过: [{ key: '6', value: 0.1 }], 回看: [] }, 来源: [{ key: 'homepage_hot', value: 0.98 }, { key: 'follow', value: 0.02 }], 搜索词: null,
  }],
};

describe('抖音解析', () => {
  it('MM:SS 换秒、指标字符串换数、标题取第一行、来源换中文名', () => {
    expect(formatMinSec('05:51')).toBe(351);
    expect(douyinTitle('应力转动 6 出征暮色 #AI')).toBe('应力转动 6 出征暮色');
    const [a] = parseDouyin(rawPack);
    expect(a!.标题).toBe('[Opus 5.5]应力转动 6 出征暮色 一开始');
    expect(a!.时长).toBe(9.5);
    expect(a!.留存.map((p) => p.秒)).toEqual([0, 3, 6, 9]);
    expect(a!.指标.两秒跳出率).toBeCloseTo(0.194);
    expect(a!.指标.completionRate).toBeNull();
    expect(a!.来源[0]).toEqual({ 名: '推荐', share: 0.98 });
    expect(a!.跳过).toEqual([{ 秒: 6, 值: 0.1 }]);
  });
  it('2s 跳出、5s 完播和同账号其他作品比', () => {
    const [a] = parseDouyin(rawPack);
    const makeVariant = (id: string, bounceRate: number, completeRate: number) => ({ ...a!, id, 指标: { ...a!.指标, 两秒跳出率: bounceRate, 五秒完播率: completeRate } });
    expect(first5sCompare(a!, [a!, makeVariant('b', 0.3, 0.5), makeVariant('c', 0.1, 0.7)])).toBe('2s 跳出 19.4%，好于其他 2 个作品中的 1 个（30.0%、10.0%）；5s 完播 56.0%，好于其他 2 个作品中的 1 个（50.0%、70.0%）');
    expect(first5sCompare(a!, [a!])).toBe('');
  });
});

const makeRanges = (startEndPairs: [number, number][]): SegmentRange[] => startEndPairs.map(([startSec, endSec], i) => ({ 编号: `6-0${i + 1}`, 键: `6-${i}`, 名: `段${i}`, 起: startSec, 止: endSec }));

describe('进段前后和两平台对照', () => {
  it('段起点后 6 秒比前 6 秒掉得快 1.3 倍以上算陡降', () => {
    const curve = [{ 秒: 0, 留存: 1 }, { 秒: 12, 留存: 0.9 }, { 秒: 18, 留存: 0.6 }, { 秒: 30, 留存: 0.55 }];
    const segments = statsBySegment(makeRanges([[0, 12], [12, 30]]), curve, [], { headSec: 0, tailSec: 0 });
    const [c] = segmentEntryBeforeAfter(curve, segments);
    expect(c!.段.编号).toBe('6-02');
    expect(c!.verdict).toBe('进段后陡降');
  });
  it('两边都高于本平台平均的是都掉人，都低于的是都留得住', () => {
    const segments = makeRanges([[0, 10], [10, 20], [20, 30], [30, 40]]);
    const summarizeRetention = (curve: { 秒: number; 留存: number }[]): MatchedRow => ({
      curve: { id: 'x', 标题: 'x', 时长: 40, 发布: '', 留存: curve, peerRetention: [], danmakuSec: [], 弹幕: [] },
      deliveryName: '第6章', 窗: { headSec: 0, tailSec: 0 }, 段: statsBySegment(segments, curve, [], { headSec: 0, tailSec: 0 }),
    });
    const a = summarizeRetention([{ 秒: 0, 留存: 1 }, { 秒: 10, 留存: 0.5 }, { 秒: 20, 留存: 0.45 }, { 秒: 30, 留存: 0.3 }, { 秒: 40, 留存: 0.29 }]);
    const b = summarizeRetention([{ 秒: 0, 留存: 1 }, { 秒: 10, 留存: 0.6 }, { 秒: 20, 留存: 0.58 }, { 秒: 30, 留存: 0.5 }, { 秒: 40, 留存: 0.3 }]);
    const rows = comparisonRows(a, b);
    expect(rows.length).toBe(4);
    expect(pickBothDropped(rows).map((r) => r.段.编号)).toEqual(['6-01']);
    expect(pickBothRetained(rows).map((r) => r.段.编号)).toEqual(['6-02']);
  });
});
