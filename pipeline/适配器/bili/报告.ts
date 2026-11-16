// 平台数据分析报告里 B 站的一节和 B 站的建议。B 站是先看封面标题、点进来才播：第一指标是封标点击率；
// 点进来的人已经主动选过一次，开头流失更说明开头没兑现封面标题的承诺。
import type { Submission } from './数据.ts';
import { danmakuMin, mostDanmakuSegments, openingWindowCompare, saggingSegments, perSegmentSection, windowTable, segNames, versionNote, retainedSegments, percent, fmtSecClock, type MatchedRow } from '../平台/图与排名.ts';

const metricTable = (submissions: Submission[]) => {
  const tableHeader = '| 稿件 | 时长 | 播放 | 封标超过同类 | 封标点击率 | 3 秒跳出 | 完播率 | 互动率 | 播转粉 | 游客占比 | 点赞 | 投币 | 收藏 | 弹幕 | 评论 | 涨粉 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const vsPast = (v: '高于' | '低于' | null) => (v ? `，${v}过往` : '');
  const rows = submissions.map((s) => {
    const m = s.metrics;
    return `| ${s.title} | ${fmtSecClock(s.duration)} | ${m.plays} | ${percent(s.beatPeers.coverCtr, 0)}${vsPast(s.vsPast.coverCtr)} | ${percent(m.coverCtr)} | ${percent(m.threeSecBounceRate)}${vsPast(s.vsPast.threeSecBounceRate)} | ${percent(m.completionRate)} | ${percent(m.interactRate)}${vsPast(s.vsPast.interactRate)} | ${percent(m.playToFanRate, 2)} | ${percent(m.visitorShare)} | ${m.likes} | ${m.coins} | ${m.favorites} | ${m.danmaku} | ${m.commentCount} | ${m.newFans} |`;
  });
  return [tableHeader, ...rows].join('\n');
};

/** 系列名：标题开头到第一个数字或括号前（「应力转动 6 出征暮色」「应力转动（1-3）」都是 应力转动） */
const seriesKey = (s: Submission) => /^([^\d（(\s-]+)/.exec(s.title)?.[1] ?? '';

export const bilibiliAdvice = (submissions: Submission[], matched: MatchedRow<Submission>[]) => {
  const out: string[] = [];
  for (const x of matched) {
    const { curve: submission, segment: segments } = x;
    const m = submission.metrics;
    const sameSeries = submissions.filter((o) => o.bvid !== submission.bvid && seriesKey(o) && seriesKey(o) === seriesKey(submission));
    const seriesCoverCtr = sameSeries.map((o) => o.beatPeers.coverCtr).filter((v): v is number => v !== null);
    const thisCoverCtr = submission.beatPeers.coverCtr;
    if (thisCoverCtr !== null && (submission.vsPast.coverCtr === '低于' || (seriesCoverCtr.length && thisCoverCtr < Math.min(...seriesCoverCtr))))
      out.push(`**封面标题**：「${submission.title}」封标点击率只超过 ${percent(thisCoverCtr, 0)} 同类稿件${submission.vsPast.coverCtr === '低于' ? '、低于过往' : ''}${seriesCoverCtr.length ? `，本系列其他集是 ${seriesCoverCtr.map((v) => percent(v, 0)).join('、')}` : ''}；游客占比 ${percent(m.visitorShare)}，几乎全靠推荐流。标题只写集数和地名不够，换成能看出冲突或看点的说法，封面放最强的一帧动作画面。`);
    const highItems = openingWindowCompare(submission, submissions).filter((c) => c.verdict.startsWith('高于') || c.verdict.endsWith('偏高'));
    if (highItems.length)
      out.push(`**开头是否兑现封面**：${highItems.map((c) => `${fmtSecClock(c.start)}–${fmtSecClock(c.end)}（${segNames(segments, c.start, c.end)}）在场每 10 秒流失 ${percent(c.ownValue)}，${c.verdict}（中位 ${percent(c.median)}）`).join('；')}。B 站观众是看了封面标题点进来的，这里掉人多可能是开头给的和封面标题承诺的不一致：封面标题写什么，开头 20 秒内就要让人看到。`);
    const steep = saggingSegments(segments, submission.retention);
    if (steep.length) out.push(`**可能拖沓的段**：${steep.map((s) => `${s.serial} ${s.name}（每 10 秒走 ${percent(s.relDropPer10s)}）`).join('、')}，先看这几段是不是在交代、赶路、等待，压缩或加转折、台词钩子。`);
    const retained = retainedSegments(segments, submission.retention);
    if (retained.length) out.push(`**留得住的段**：${retained.map((s) => `${s.serial} ${s.name}（每 10 秒走 ${percent(s.relDropPer10s)}）`).join('、')}，这类内容可以在封面标题里点出来。`);
    const seriesByDuration = submissions.filter((o) => seriesKey(o) && seriesKey(o) === seriesKey(submission)).sort((a, b) => a.duration - b.duration);
    if (seriesByDuration.length >= 2)
      out.push(`**单集时长**：本系列按时长排 ${seriesByDuration.map((o) => `${fmtSecClock(o.duration)} 完播 ${percent(o.metrics.completionRate)}`).join('、')}。长集完播自然低，可以按场拆成 1～2 分钟一集连发，每集结尾留钩子。`);
  }
  return out;
};

export const bilibiliSection = (submissions: Submission[], matched: MatchedRow<Submission>[], packageInfo: { fetchedAt: string; requestCount: number; file: string }, imageNames: Map<string, string>) => {
  const unmatched = submissions.filter((s) => !matched.some((x) => x.curve.bvid === s.bvid));
  const segmentSection = matched
    .map((x) => {
      const { curve: submission } = x;
      const note = versionNote(x);
      const topDanmaku = submission.danmakuSec.length >= danmakuMin ? mostDanmakuSegments(x.segment).map((s) => `${s.serial} ${s.name}（${s.danmaku} 条）`).join('、') : `只有 ${submission.danmakuSec.length} 条，不按段排`;
      return `### ${submission.title} ↔ 交付 ${x.deliveryName}
${note ? `\n> **版本提示**：${note}\n` : ''}
图：\`${imageNames.get(submission.id)}\`

**先看封面标题**：封标点击率超过 ${percent(submission.beatPeers.coverCtr, 0)} 同类稿件${submission.vsPast.coverCtr ? `，${submission.vsPast.coverCtr}过往` : ''}；3 秒跳出 ${percent(submission.metrics.threeSecBounceRate)}；完播率 ${percent(submission.metrics.completionRate)}。

**开头各时段和同账号其他稿件比**（开头窗 ${x.窗.headSec} 秒是假设，用这张表检验：同一时段其他稿件也掉这么多，说明是推荐流普遍的划走；明显更高，才是这时在播的内容的问题）：

${windowTable(x, openingWindowCompare(submission, submissions))}

${perSegmentSection(x)}
- 弹幕最多：${topDanmaku}${submission.platformReading ? `\n- 平台解读：${submission.platformReading}` : ''}`;
    })
    .join('\n\n');
  return `## B 站

数据：\`${packageInfo.file}\`（取于 ${packageInfo.fetchedAt}，${packageInfo.requestCount} 次请求）。B 站是观众先看到封面标题、点进来才播放：**封标点击率**是第一指标（「超过 x% 同类」「高于/低于过往」是页面上的评价，比原值稳）；点进来的人已经主动选过一次，留存基线本来就比刷到即播的平台高，开头掉人更说明开头和封面标题的预期不符。留存约 20 秒一档，段内是插值。

### 各稿件指标

${metricTable(submissions)}

${segmentSection || '没有稿件对上本地交付。'}

${unmatched.length ? `没对上本地交付、只做指标汇总的：${unmatched.map((s) => `「${s.title}」`).join('、')}。` : ''}`;
};
