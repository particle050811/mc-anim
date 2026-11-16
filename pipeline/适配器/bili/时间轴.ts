// 把 B 站稿件对到本地交付（时长差 ≤1.5 秒，标题里的章号落在交付「第a-b章」范围内优先），再把留存和弹幕按段切开。
// 留存曲线只有约 18 档，段比档短时段内是线性插值；开头窗内的流失不记到段上（见 按段统计）。
import fs from 'node:fs';
import path from 'node:path';
import type { RetentionPoint, Submission } from './数据.ts';

/** 交付 manifest.json 里这里用到的几项（各版本都有；直接读原 JSON） */
export type DeliveryManifest = { name: string; fps: number; durationSec: number; completed?: string; segment: { serial?: string | null; key: string; frameCount: number; filmStartFrame: number }[] };
export type Delivery = { 目录: string; m: DeliveryManifest };
export type SegmentRange = { serial: string; key: string; name: string; start: number; end: number };
export type SegmentStat = SegmentRange & {
  retentionIn: number;
  retentionOut: number;
  /** 段内流失的百分点（占全部观众） */
  dropOff: number;
  /** 计入排名的起点：开头窗之后的部分（段跨窗时只算窗后） */
  countStart: number;
  /** 计入排名的终点：结尾窗之前 */
  countEnd: number;
  /** 整段落在开头窗内，不参与排名 */
  inHeadWindow: boolean;
  /** 整段落在结尾窗内，不参与排名 */
  inTailWindow: boolean;
  /** 计入的部分不到半档：数值只是所在档的平均，不参与排名 */
  tooShort: boolean;
  /** 在场观众每 10 秒流失的比例（只算 [计起, 计止]），跨段可比；开头窗内、结尾窗内的段是 NaN */
  relDropPer10s: number;
  danmaku: number;
  danmakuPer10s: number;
};

export const readDeliveryList = (deliveryDir: string): Delivery[] =>
  (fs.existsSync(deliveryDir) ? fs.readdirSync(deliveryDir) : [])
    .map((n) => path.join(deliveryDir, n))
    .filter((d) => fs.existsSync(path.join(d, 'manifest.json')))
    .map((d) => ({ 目录: d, m: JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')) }))
    .filter((x) => typeof x.m.durationSec === 'number' && Array.isArray(x.m.segment));

/** 交付名「第6-7章」→ [6, 7]；不是这种名字返回 null */
export const chapterRange = (chapterName: string): [number, number] | null => {
  const m = /^第(\d+)(?:-(\d+))?章$/.exec(chapterName);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
};

/** 标题里独立出现的数字（「应力转动 6 出征暮色」→ [6]，「应力转动（1-3）」→ [1, 3]） */
export const titleNumbers = (title: string) => [...title.matchAll(/(?<!\d)\d{1,3}(?!\d)/g)].map((m) => Number(m[0]));

export const matchDelivery = (submission: Pick<Submission, 'title' | 'duration'>, deliveries: Delivery[], toleranceSec = 1.5): Delivery | null => {
  const candidates = deliveries.filter((x) => Math.abs(x.m.durationSec - submission.duration) <= toleranceSec);
  const score = (x: Delivery) => {
    const r = chapterRange(x.m.name);
    const chapterMatch = r !== null && titleNumbers(submission.title).some((n) => n >= r[0] && n <= r[1]);
    return (chapterMatch ? 2 : 0) + (r ? 1 : 0);
  };
  candidates.sort((a, b) => score(b) - score(a) || (b.m.completed ?? '').localeCompare(a.m.completed ?? ''));
  return candidates[0] && score(candidates[0]) >= 2 ? candidates[0] : null;
};

export const segmentRanges = (m: DeliveryManifest): SegmentRange[] =>
  m.segment.map((s) => ({
    serial: s.serial ?? s.key,
    key: s.key,
    name: s.key.replace(/^\d+-/, ''),
    start: s.filmStartFrame / m.fps,
    end: (s.filmStartFrame + s.frameCount) / m.fps,
  }));

/** 留存曲线在 t 秒处的值（线性插值；超出末档取末档） */
export const retentionAt = (curve: RetentionPoint[], t: number) => {
  if (!curve.length) return NaN;
  if (t <= curve[0]!.sec) return curve[0]!.retention;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (t <= b.sec) return a.retention + ((b.retention - a.retention) * (t - a.sec)) / (b.sec - a.sec || 1);
  }
  return curve.at(-1)!.retention;
};

/** 在场观众在 [起, 止] 内每 10 秒流失的比例 */
export const dropPer10s = (curve: RetentionPoint[], startSec: number, endSec: number) => {
  const startRetention = retentionAt(curve, startSec);
  return endSec > startSec && startRetention > 0 ? 1 - Math.pow(retentionAt(curve, endSec) / startRetention, 10 / (endSec - startSec)) : NaN;
};

/** 留存曲线相邻两档的间隔（中位） */
export const binWidth = (curve: RetentionPoint[]) => {
  const gaps = curve.slice(1).map((p, i) => p.sec - curve[i]!.sec).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0;
};

/** 默认开头窗：推荐流「刷到就划走」集中在开头，这段时间的流失不记到任何段头上（窗长是假设，报告里用同账号其他稿件检验） */
export const defaultOpeningWindow = 40;
/** 默认结尾窗：最后一个段和最后 30 秒取较长的；看出要结束就走是正常的，不记到段上（用户 10-22 定） */
export const defaultEndingWindow = (segments: SegmentRange[]) => Math.max(30, segments.length ? segments.at(-1)!.end - segments.at(-1)!.start : 0);
export type EdgeWindow = { headSec: number; tailSec: number };

export const statsBySegment = (segments: SegmentRange[], curve: RetentionPoint[], danmakuSec: number[], edgeWindow?: Partial<EdgeWindow>): SegmentStat[] => {
  const filmLength = segments.at(-1)?.end ?? 0;
  const openingWindow = edgeWindow?.headSec ?? defaultOpeningWindow;
  const endingWindow = edgeWindow?.tailSec ?? defaultEndingWindow(segments);
  // 末档落在片子结尾时那一档是「放完了」，结尾窗比它短时也不能把它摊到最后几段上
  const last = curve.at(-1);
  const playedOut = last && curve.length > 2 && last.sec >= filmLength - 1 && last.retention < curve.at(-2)!.retention / 2;
  const effectiveEnd = Math.min(filmLength - endingWindow, playedOut ? curve.at(-2)!.sec : Infinity);
  const width = binWidth(curve);
  return segments.map((s, i) => {
    const lengthSec = Math.max(s.end - s.start, 1e-6);
    const startRetention = retentionAt(curve, s.start);
    const endRetention = retentionAt(curve, s.end);
    const isLastSegment = i === segments.length - 1;
    const danmakuCount = danmakuSec.filter((t) => t >= s.start && (t < s.end || (isLastSegment && t <= s.end))).length;
    const countStart = Math.max(s.start, openingWindow);
    const countEnd = Math.min(s.end, effectiveEnd);
    const inHeadWindow = countStart >= s.end;
    const inTailWindow = !inHeadWindow && countStart >= countEnd;
    const relLoss = inHeadWindow || inTailWindow ? NaN : dropPer10s(curve, countStart, countEnd);
    const tooShort = countEnd - countStart < width / 2;
    return { ...s, retentionIn: startRetention, retentionOut: endRetention, dropOff: startRetention - endRetention, countStart, countEnd, inHeadWindow, inTailWindow, tooShort, relDropPer10s: relLoss, danmaku: danmakuCount, danmakuPer10s: (danmakuCount * 10) / lengthSec };
  });
};

/** 弹幕按 bin 秒分箱计数 */
export const danmakuDensity = (danmakuSec: number[], duration: number, bin = 5) => {
  const n = Math.max(1, Math.ceil(duration / bin));
  const bins = new Array<number>(n).fill(0);
  for (const t of danmakuSec) bins[Math.min(n - 1, Math.max(0, Math.floor(t / bin)))]!++;
  return bins.map((c, i) => ({ start: i * bin, 数: c }));
};

/** 排名的单位：够长的段单独一个；连续的短段（不到半档）合成一组，攒够半档再算（没攒够就并进后面的段），免得短段拿到的只是所在档的平均 */
export type RankUnit = { serial: string; name: string; start: number; end: number; countStart: number; countEnd: number; segKeys: string[]; relDropPer10s: number };
export const rankUnits = (segments: SegmentStat[], curve: RetentionPoint[]) => {
  const halfBin = binWidth(curve) / 2;
  const eligible = segments.filter((s) => !s.inHeadWindow && !s.inTailWindow);
  const units: RankUnit[] = [];
  const makeUnit = (segGroup: SegmentStat[]): RankUnit => {
    const a = segGroup[0]!;
    const b = segGroup.at(-1)!;
    return {
      serial: segGroup.length > 1 ? `${a.serial}～${b.serial}` : a.serial,
      name: segGroup.length > 1 ? `${a.name}～${b.name}` : a.name,
      start: a.start, end: b.end, countStart: a.countStart, countEnd: b.countEnd,
      segKeys: segGroup.map((s) => s.key),
      relDropPer10s: dropPer10s(curve, a.countStart, b.countEnd),
    };
  };
  let segGroup: SegmentStat[] = [];
  const groupLength = () => (segGroup.length ? segGroup.at(-1)!.countEnd - segGroup[0]!.countStart : 0);
  for (const s of eligible) {
    if (!s.tooShort) {
      // 没攒够半档的短段并进后面这个够长的段，不单独成一组
      units.push(makeUnit([...segGroup, s]));
      segGroup = [];
      continue;
    }
    segGroup.push(s);
    if (groupLength() >= halfBin) {
      units.push(makeUnit(segGroup));
      segGroup = [];
    }
  }
  if (segGroup.length && groupLength() >= halfBin / 2) units.push(makeUnit(segGroup));
  const mean = eligible.length ? dropPer10s(curve, eligible[0]!.countStart, eligible.at(-1)!.countEnd) : NaN;
  return { units: units.filter((u) => Number.isFinite(u.relDropPer10s)), mean };
};
