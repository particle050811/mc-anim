// 平台数据分析报告里抖音的一节和抖音的建议。抖音刷到就自动播，观众没主动选：第一看前 5 秒（2s 跳出、5s 完播、前几档留存），
// 开头几秒的画面就是「封面」；5 秒后的留存才更说明内容。留存 3 秒一档，能看单个段进段前后有没有陡降。
import { dropPer10s, retentionAt, type SegmentStat } from '../bili/时间轴.ts';
import { openingWindowCompare, saggingSegments, perSegmentSection, windowTable, segNames, versionNote, retainedSegments, percent, fmtSecClock, type MatchedRow } from '../平台/图与排名.ts';
import type { DouyinWork } from './数据.ts';

/** 段起点前后各 6 秒的在场每 10 秒流失；后/前 > 1.3 算进段后陡降（留存本来随时间放缓，持平就已经略高于趋势） */
export type SegmentEntryCheck = { segment: SegmentStat; 前: number; 后: number; verdict: string };
export const segmentEntryBeforeAfter = (curve: DouyinWork['retention'], segments: SegmentStat[], fromSec = 3, endSec = 90, halfWindow = 6): SegmentEntryCheck[] =>
  segments.filter((s) => s.start >= fromSec + halfWindow && s.start <= endSec).map((s) => {
    const before = dropPer10s(curve, s.start - halfWindow, s.start);
    const lossAfter = dropPer10s(curve, s.start, s.start + halfWindow);
    const afterRatio = lossAfter / before;
    const verdict = !Number.isFinite(afterRatio) ? '—' : afterRatio > 1.3 ? '进段后陡降' : afterRatio < 0.77 ? '进段后放缓' : '和进段前持平';
    return { segment: s, 前: before, 后: lossAfter, verdict };
  });

const segmentEntryTable = (checks: SegmentEntryCheck[]) =>
  ['| 段 | 起 | 进段前 6 秒 | 进段后 6 秒 | 判断 |\n|---|---|---|---|---|', ...checks.map((c) => `| ${c.segment.serial} ${c.segment.name} | ${fmtSecClock(c.segment.start)}（${c.segment.start.toFixed(1)}） | ${percent(c.前)} | ${percent(c.后)} | ${c.verdict} |`)].join('\n');

/** 前 5 秒：3 秒、5 秒（插值）、6 秒处的留存，和同类作者参考线 */
const first5sText = (work: DouyinWork) => {
  const m = work.metrics;
  const retentionText = [3, 5, 6].map((t) => `${t} 秒 ${percent(retentionAt(work.retention, t))}${work.peerRetention.length ? `（同类作者 ${percent(retentionAt(work.peerRetention, t))}）` : ''}`).join('，');
  return `2s 跳出率 ${percent(m.两秒跳出率)}，5s 完播率 ${percent(m.五秒完播率)}；留存 ${retentionText}。`;
};

/** 2s 跳出、5s 完播和同账号其他作品比（平台给旧作品也有这两个指标，留存曲线却只给近期作品） */
export const first5sCompare = (work: DouyinWork, works: DouyinWork[]) => {
  const others = works.filter((a) => a.id !== work.id);
  const judgeMetric = (k: '两秒跳出率' | '五秒完播率', lowerIsBetter: boolean) => {
    const values = others.map((a) => a.metrics[k]).filter((v): v is number => v !== null);
    const ownValue = work.metrics[k];
    if (ownValue === null || values.length < 2) return null;
    const betterCount = values.filter((v) => (lowerIsBetter ? ownValue < v : ownValue > v)).length;
    return `${k === '两秒跳出率' ? '2s 跳出' : '5s 完播'} ${percent(ownValue)}，好于其他 ${values.length} 个作品中的 ${betterCount} 个（${values.map((v) => percent(v)).join('、')}）`;
  };
  return [judgeMetric('两秒跳出率', true), judgeMetric('五秒完播率', false)].filter(Boolean).join('；');
};

const topBuckets = (buckets: { sec: number; value: number }[], segments: SegmentStat[], n = 3) =>
  [...buckets].sort((a, b) => b.value - a.value).slice(0, n).map((d) => `${fmtSecClock(d.sec - 6)}–${fmtSecClock(d.sec + 6)}（${percent(d.value)}，${segNames(segments, d.sec - 6, d.sec + 6)}）`).join('；');

export const douyinAdvice = (matched: MatchedRow<DouyinWork>[], works: DouyinWork[] = []) => {
  const out: string[] = [];
  for (const x of matched) {
    const { curve: work, segment: segments } = x;
    const m = work.metrics;
    const peer5sRetention = work.peerRetention.length ? retentionAt(work.peerRetention, 5) : NaN;
    const own5sRetention = retentionAt(work.retention, 5);
    out.push(`**开头 5 秒（抖音的「封面」）**：2s 跳出 ${percent(m.两秒跳出率)}、5s 完播 ${percent(m.五秒完播率)}${Number.isFinite(peer5sRetention) ? `，5 秒留存 ${percent(own5sRetention)}，${own5sRetention >= peer5sRetention ? '不低于' : '低于'}同类作者参考线 ${percent(peer5sRetention)}` : ''}${first5sCompare(work, works) ? `；${first5sCompare(work, works)}` : ''}。开头「${segments[0]?.name ?? ''}」要在头 2 秒给出动作或冲突，不要先铺环境。`);
    const steep = segmentEntryBeforeAfter(work.retention, segments).filter((c) => c.verdict === '进段后陡降');
    if (steep.length) out.push(`**进段后陡降**：${steep.map((c) => `${c.segment.serial} ${c.segment.name}（进段前每 10 秒走 ${percent(c.前)}，进段后 ${percent(c.后)}）`).join('、')}，看这些段的头几秒是不是节奏断了。`);
    const sluggish = saggingSegments(segments, work.retention);
    if (sluggish.length) out.push(`**可能拖沓的段**：${sluggish.map((s) => `${s.serial} ${s.name}（每 10 秒走 ${percent(s.relDropPer10s)}）`).join('、')}。`);
    if (work.skipped.length) out.push(`**观众拖进度条跳过最多**：${topBuckets(work.skipped, segments)}。`);
    const retained = retainedSegments(segments, work.retention);
    if (retained.length) out.push(`**留得住的段**：${retained.map((s) => `${s.serial} ${s.name}（每 10 秒走 ${percent(s.relDropPer10s)}）`).join('、')}，可以剪 1～2 秒放到开头当钩子。`);
  }
  return out;
};

export const douyinSection = (works: DouyinWork[], matched: MatchedRow<DouyinWork>[], packageInfo: { fetchedAt: string; requestCount: number; file: string; note?: string }, imageNames: Map<string, string>) => {
  const metricTable = [
    '| 作品 | 时长 | 播放 | 2s 跳出 | 5s 完播 | 平均播放 | 平均播放占比 | 完播率 | 封面点击率（曝光） | 点赞率 | 涨粉 |\n|---|---|---|---|---|---|---|---|---|---|---|',
    ...works.map((a) => {
      const m = a.metrics;
      return `| ${a.title} | ${fmtSecClock(a.duration)} | ${m.plays} | ${percent(m.两秒跳出率)} | ${percent(m.五秒完播率)} | ${m.avgViewSec?.toFixed(1) ?? '—'} 秒 | ${percent(m.avgViewShare)} | ${percent(m.completionRate)} | ${percent(m.coverClickRate)}（${m.coverExposure ?? '—'}） | ${percent(m.likeRate, 2)} | ${m.newFans} |`;
    }),
  ].join('\n');
  const segmentSection = matched
    .map((x) => {
      const { curve: work } = x;
      const note = versionNote(x);
      const segmentEntryChecks = segmentEntryBeforeAfter(work.retention, x.segment);
      return `### ${work.title} ↔ 交付 ${x.deliveryName}
${note ? `\n> **版本提示**：${note}\n` : ''}
图：\`${imageNames.get(work.id)}\`

**先看前 5 秒**：${first5sText(work)}${first5sCompare(work, works) ? `和同账号其他作品比：${first5sCompare(work, works)}。` : ''}流量来源：${work.source.map((s) => `${s.name} ${percent(s.share)}`).join('、') || '—'}。

**开头各时段和同账号其他作品比**：${works.filter((a) => a.retention.length > 2).length > 1 ? `\n\n${windowTable(x, openingWindowCompare(work, works))}` : `同账号其他作品${works.length > 1 ? '平台没给留存曲线（只给近期作品）' : '没有数据'}，没有逐段基线，开头窗是否合适不确定。`}

**进段前后**（3 秒一档，看段开头有没有异常陡降；前 90 秒内起的段）：

${segmentEntryTable(segmentEntryChecks)}

${perSegmentSection(x)}
- 拖进度条跳过最多的档（12 秒一档）：${work.skipped.length ? topBuckets(work.skipped, x.segment) : '—'}
- 回看最多的档：${work.rewatch.length ? topBuckets(work.rewatch, x.segment) : '—'}
- 看完后常搜：${work.searchAfterWatch.map((k) => `「${k.keyword}」${percent(k.share)}`).join('、') || '—'}`;
    })
    .join('\n\n');
  return `## 抖音

数据：\`${packageInfo.file}\`（取于 ${packageInfo.fetchedAt}${packageInfo.requestCount ? `，${packageInfo.requestCount} 次请求` : ''}）。${packageInfo.note ? `${packageInfo.note}。` : ''}抖音刷到就自动播放，观众没有主动选：**前 5 秒**（2s 跳出、5s 完播、前几档留存）是第一指标，开头几秒的画面就是「封面」，开头流失主要反映开场钩子；5 秒后的留存才更说明内容。留存 3 秒一档；图上的灰色虚线是平台给的同类作者参考线，只作参考、不参与计算。

### 各作品指标

${metricTable}

${segmentSection || '没有作品对上本地交付。'}`;
};
