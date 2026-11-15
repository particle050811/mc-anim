import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importData, latestData, retentionCurve, parsePackage, type RawBundle, type Submission } from './数据.ts';
import { openingWindowCompare, versionNote } from '../平台/图与排名.ts';
import { matchDelivery, defaultEndingWindow, rankUnits, statsBySegment, titleNumbers, dropPer10s, retentionAt, segmentRanges, chapterRange, type Delivery } from './时间轴.ts';

const makeRawPack = (fetchedAt: string): RawBundle => ({
  版本: 1,
  取于: fetchedAt,
  请求数: 3,
  错误: [],
  停于风控: null,
  稿件: [
    {
      bvid: 'BV1',
      标题: '应力转动 6 出征暮色',
      时长: 40,
      发布: 1792500116,
      对比: { stat: { play: 100, full_play_ratio: 1850, tm_rate: 769, tm_rate_med: 593, crash_rate: 2740, total_new_attention_cnt: 7 } },
      总览: null,
      播放分析: null,
      分P: [{ cid: 1, 标题: 'p1', 时长: 40, 留存: { viewer_quit: [{ duration_key: 20, num: 6000 }, { duration_key: 40, num: 3000 }] }, 弹幕: [{ progress: 25500, msg: 'b' }, { progress: 5000, msg: 'a' }] }],
      评论: [],
    },
  ],
});

const Delivery = (deliveryName: string, durationSec: number, completedAt = ''): Delivery => ({
  目录: `/x/${deliveryName}`,
  m: { 名: deliveryName, 时长秒: durationSec, 完成: completedAt, 帧率: 24, 段: [] },
});

describe('解析', () => {
  it('万分制换成比例，留存补上 0 秒 100%，弹幕按毫秒换秒并排序', () => {
    const [s] = parsePackage(makeRawPack('2026-10-22T07:58:00Z'));
    expect(s!.指标.completionRate).toBeCloseTo(0.185);
    expect(s!.指标.coverCtr).toBeCloseTo(0.0769);
    expect(s!.median.coverCtr).toBeCloseTo(0.0593);
    expect(s!.指标.newFans).toBe(7);
    expect(s!.留存).toEqual([{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: 0.6 }, { 秒: 40, 留存: 0.3 }]);
    expect(s!.danmakuSec).toEqual([5, 25.5]);
  });
  it('同类曲线外推出来的负值丢掉', () => {
    expect(retentionCurve([{ duration_key: 20, num: 100 }, { duration_key: 40, num: -5 }]).map((p) => p.秒)).toEqual([0, 20]);
  });
});

describe('对时间轴', () => {
  it('章范围和标题数字', () => {
    expect(chapterRange('第6-7章')).toEqual([6, 7]);
    expect(chapterRange('冒烟')).toBeNull();
    expect(titleNumbers('应力转动（1-3）-初入世界')).toEqual([1, 3]);
    expect(titleNumbers('seedance2.0')).toEqual([2, 0]);
  });
  it('时长差 1.5 秒内、标题章号落在交付范围里才算对上；同时长的比对交付不选', () => {
    const deliveries = [Delivery('重组A1-比对', 354.7, '2026-10-22'), Delivery('第6-7章', 354.7, '2026-10-21'), Delivery('第8章', 354.9)];
    expect(matchDelivery({ 标题: '应力转动 6 出征暮色', 时长: 355 }, deliveries)?.m.名).toBe('第6-7章');
    expect(matchDelivery({ 标题: '应力转动5-粉碎奸商', 时长: 355 }, deliveries)).toBeNull();
    expect(matchDelivery({ 标题: '应力转动 6 出征暮色', 时长: 300 }, deliveries)).toBeNull();
  });
  it('段按帧换秒，留存插值、段内流失和弹幕落段', () => {
    const segments = segmentRanges({ ...Delivery('第6章', 40).m, 段: [
      { 编号: '6-01', 键: '6-进入森林', 帧数: 240, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-斩娜迦', 帧数: 720, 全片起帧: 240 },
    ] });
    expect(segments.map((s) => [s.名, s.起, s.止])).toEqual([['进入森林', 0, 10], ['斩娜迦', 10, 40]]);
    const [s] = parsePackage(makeRawPack('2026-10-22T07:58:00Z'));
    expect(retentionAt(s!.留存, 10)).toBeCloseTo(0.8);
    // 曲线末档落在片子结尾（放完了）时那一档不算，这里给到 60 秒让 40 秒前都有效
    const curve = [...s!.留存, { 秒: 60, 留存: 0 }];
    const segmentStats = statsBySegment(segments, curve, s!.danmakuSec, { headSec: 0, tailSec: 0 });
    expect(segmentStats[0]!.dropOff).toBeCloseTo(0.2);
    expect(segmentStats[0]!.弹幕).toBe(1);
    expect(segmentStats[1]!.弹幕).toBe(1);
    expect(segmentStats[1]!.relDropPer10s).toBeCloseTo(1 - Math.pow(0.3 / 0.8, 10 / 30));
  });
  it('开头窗内的流失不记到段上：整段在窗内标窗内、不排名，跨窗的段只算窗后部分', () => {
    const segments = segmentRanges({ ...Delivery('第6章', 40).m, 段: [
      { 编号: '6-01', 键: '6-进入森林', 帧数: 240, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-斩娜迦', 帧数: 720, 全片起帧: 240 },
    ] });
    const [s] = parsePackage(makeRawPack('2026-10-22T07:58:00Z'));
    const segmentStats = statsBySegment(segments, [...s!.留存, { 秒: 60, 留存: 0 }], [], { headSec: 20, tailSec: 0 });
    expect(segmentStats[0]!.inHeadWindow).toBe(true);
    expect(segmentStats[0]!.relDropPer10s).toBeNaN();
    expect(segmentStats[1]!.inHeadWindow).toBe(false);
    expect(segmentStats[1]!.countStart).toBe(20);
    // 只算 20–40 秒：0.6 → 0.3
    expect(segmentStats[1]!.relDropPer10s).toBeCloseTo(1 - Math.sqrt(0.5));
    expect(dropPer10s(s!.留存, 20, 40)).toBeCloseTo(1 - Math.sqrt(0.5));
    // 段内流失（占全部观众）照旧按整段算
    expect(segmentStats[1]!.dropOff).toBeCloseTo(0.5);
  });
  it('末档落在片子结尾、人几乎走光（放完了）时，那一档按结尾窗算，不排名', () => {
    const segments = segmentRanges({ ...Delivery('第6章', 40).m, 段: [
      { 编号: '6-01', 键: '6-a', 帧数: 600, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-b', 帧数: 360, 全片起帧: 600 },
    ] });
    const [s] = parsePackage(makeRawPack('2026-10-22T07:58:00Z'));
    const segmentStats = statsBySegment(segments, [s!.留存[0]!, s!.留存[1]!, { 秒: 40, 留存: 0.05 }], [], { headSec: 0, tailSec: 0 });
    expect(segmentStats[0]!.countEnd).toBe(20);
    expect(segmentStats[1]!.inTailWindow).toBe(true);
    expect(segmentStats[1]!.relDropPer10s).toBeNaN();
  });
  it('结尾窗默认取最后一个段和 30 秒的较长者，窗内的段不排名', () => {
    const segments = segmentRanges({ ...Delivery('第6章', 100).m, 段: [
      { 编号: '6-01', 键: '6-a', 帧数: 1200, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-b', 帧数: 720, 全片起帧: 1200 },
      { 编号: '6-03', 键: '6-c', 帧数: 480, 全片起帧: 1920 },
    ] });
    expect(defaultEndingWindow(segments)).toBe(30);
    expect(defaultEndingWindow(segments.slice(0, 2))).toBe(30);
    const curve = [{ 秒: 0, 留存: 1 }, { 秒: 50, 留存: 0.5 }, { 秒: 100, 留存: 0.4 }];
    const segmentStats = statsBySegment(segments, curve, [], { headSec: 0 });
    expect(segmentStats[1]!.countEnd).toBe(70);
    expect(segmentStats[2]!.inTailWindow).toBe(true);
  });
});

describe('排名单元', () => {
  it('连续的短段（不到半档）合成一组，攒够半档再算；平均按窗后到片尾档前', () => {
    const curve = [{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: 0.8 }, { 秒: 40, 留存: 0.6 }, { 秒: 60, 留存: 0.5 }, { 秒: 64, 留存: 0 }];
    const segments = segmentRanges({ ...Delivery('第6章', 64).m, 段: [
      { 编号: '6-01', 键: '6-a', 帧数: 480, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-b', 帧数: 120, 全片起帧: 480 },
      { 编号: '6-03', 键: '6-c', 帧数: 120, 全片起帧: 600 },
      { 编号: '6-04', 键: '6-d', 帧数: 816, 全片起帧: 720 },
    ] });
    const { units, mean } = rankUnits(statsBySegment(segments, curve, [], { headSec: 0, tailSec: 0 }), curve);
    expect(units.map((u) => u.编号)).toEqual(['6-01', '6-02～6-03', '6-04']);
    expect(units[1]!.segKeys).toEqual(['6-b', '6-c']);
    expect(mean).toBeCloseTo(dropPer10s(curve, 0, 60));
  });
});

describe('报告', () => {
  const makeSubmission = (bvid: string, duration: number, retention: { 秒: number; 留存: number }[]) => ({ ...parsePackage(makeRawPack('2026-10-22T07:58:00Z'))[0]!, bvid, id: bvid, 时长: duration, 留存: retention }) as Submission;
  it('开头时段和同账号其他稿件同一时段比，可比稿件不到 3 个写不确定', () => {
    const subject = makeSubmission('A', 100, [{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: 0.5 }, { 秒: 100, 留存: 0.1 }]);
    const makePeer = (b: string, r: number) => makeSubmission(b, 60, [{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: r }, { 秒: 60, 留存: 0.2 }]);
    const [c] = openingWindowCompare(subject, [subject, makePeer('B', 0.8), makePeer('C', 0.7), makePeer('D', 0.6)]);
    expect(c!.others.length).toBe(3);
    expect(c!.verdict).toBe('高于所有其他作品');
    expect(openingWindowCompare(subject, [subject, makePeer('B', 0.8)])[0]!.verdict).toMatch(/不确定/);
  });
  it('稿件发布早于交付完成时提示版本', () => {
    const s = parsePackage(makeRawPack('2026-10-22T07:58:00Z'))[0]!;
    expect(versionNote({ curve: s, deliveryName: '第6章', deliveryDoneAt: '2027-01-01T00:00:00Z', 窗: { headSec: 40, tailSec: 30 }, 段: [] })).toMatch(/更早的剪辑/);
    expect(versionNote({ curve: s, deliveryName: '第6章', deliveryDoneAt: '2026-01-01T00:00:00Z', 窗: { headSec: 40, tailSec: 30 }, 段: [] })).toBeNull();
  });
});

describe('导入', () => {
  it('按取数时间（UTC）建目录、挪走原文件、不覆盖；最新按取于', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-bili-'));
    const writeFile = (relPath: string, fetchedAt: string) => {
      const f = path.join(root, relPath);
      fs.writeFileSync(f, JSON.stringify(makeRawPack(fetchedAt)));
      return f;
    };
    const platformDir = path.join(root, '平台');
    const a = writeFile('a.json', '2026-10-22T07:58:30Z');
    expect(importData(a, platformDir).目标).toBe(path.join(platformDir, '1022-0758', '数据.json'));
    expect(fs.existsSync(a)).toBe(false);
    expect(() => importData(writeFile('b.json', '2026-10-22T07:58:10Z'), platformDir)).toThrow(/不覆盖/);
    importData(writeFile('c.json', '2026-10-23T01:00:00Z'), platformDir);
    expect(latestData(platformDir).包.取于).toBe('2026-10-23T01:00:00Z');
    fs.rmSync(root, { recursive: true });
  });
});
