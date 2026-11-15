// 各平台共用的留存分析：拖沓段和留得住的段的排名、开头时段和同账号其他作品比、每个作品一张 HTML 图（留存曲线和弹幕密度上下两张，叠段边界）。
// 配色照 dataviz 默认色板（系列 1 蓝、强调橙），浅色深色各一套；留存和弹幕量纲不同，分两张图不共用 y 轴。
import type { RetentionPoint } from '../bili/数据.ts';
import { danmakuDensity, rankUnits, dropPer10s, type RankUnit, type SegmentStat, type EdgeWindow } from '../bili/时间轴.ts';

/** 平台无关的作品形状：B 站稿件、抖音作品都解析成带这些字段的样子 */
export type CurveDraft = {
  id: string;
  标题: string;
  时长: number;
  /** ISO 时间 */
  发布: string;
  /** 含 (0, 1) 的留存曲线 */
  留存: RetentionPoint[];
  /** 平台给的同类参考线（拟合，非真实观众），只画不算 */
  peerRetention: RetentionPoint[];
  danmakuSec: number[];
  弹幕: { 秒: number; 文本: string }[];
};
export type MatchedRow<T extends CurveDraft = CurveDraft> = { curve: T; deliveryName: string; deliveryDoneAt?: string; 窗: EdgeWindow; 段: SegmentStat[] };

export const percent = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`);
export const fmtSecClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** 只算了段的一部分时注明 */
export const isPartial = (s: { 起: number; 止: number; countStart: number; countEnd: number }) => (s.countStart > s.起 || s.countEnd < s.止 ? `（只算 ${fmtSecClock(s.countStart)}–${fmtSecClock(s.countEnd)}）` : '');
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 拖沓候选：开头窗后、结尾窗前，在场每 10 秒流失高于全片（同一范围）平均、最高的几段 */
export const saggingSegments = (segments: SegmentStat[], curve: RetentionPoint[], n = 3) => {
  const { units, mean } = rankUnits(segments, curve);
  return units.filter((u) => u.relDropPer10s > mean).sort((a, b) => b.relDropPer10s - a.relDropPer10s).slice(0, n);
};
/** 留得住的段：同一范围里低于平均、最低的几段 */
export const retainedSegments = (segments: SegmentStat[], curve: RetentionPoint[], n = 3) => {
  const { units, mean } = rankUnits(segments, curve);
  return units.filter((u) => u.relDropPer10s < mean).sort((a, b) => a.relDropPer10s - b.relDropPer10s).slice(0, n);
};

/** 开头窗检验：本稿各 20 秒时段的在场每 10 秒流失，和同账号其他作品同一时段比（其他作品要比时段末再长 10 秒，免得混进片尾流失） */
export type WindowComparison = { 起: number; 止: number; ownValue: number; others: { 标题: string; 值: number }[]; median: number; verdict: string };
export const openingWindowCompare = (curve: CurveDraft, peers: CurveDraft[], stepSec = 20, endSec = 120): WindowComparison[] => {
  const out: WindowComparison[] = [];
  for (let startSec = 0; startSec + stepSec <= Math.min(endSec, curve.时长 - 10); startSec += stepSec) {
    const endSec = startSec + stepSec;
    const others = peers
      .filter((o) => o.id !== curve.id && o.留存.length > 2 && o.时长 >= endSec + 10)
      .map((o) => ({ 标题: o.标题, 值: dropPer10s(o.留存, startSec, endSec) }))
      .filter((x) => Number.isFinite(x.值));
    const sortedValues = others.map((x) => x.值).sort((a, b) => a - b);
    const median = sortedValues.length ? (sortedValues.length % 2 ? sortedValues[(sortedValues.length - 1) / 2]! : (sortedValues[sortedValues.length / 2 - 1]! + sortedValues[sortedValues.length / 2]!) / 2) : NaN;
    const ownValue = dropPer10s(curve.留存, startSec, endSec);
    const verdict =
      sortedValues.length < 3 ? '不确定（可比作品不到 3 个）'
      : ownValue > sortedValues.at(-1)! ? '高于所有其他作品'
      : ownValue < sortedValues[0]! ? '低于所有其他作品'
      : ownValue > median ? '在其他作品范围内，偏高'
      : '在其他作品范围内，偏低';
    out.push({ 起: startSec, 止: endSec, ownValue, others, median, verdict });
  }
  return out;
};
/** 弹幕少于这个数时不按段排（一两条没有信号） */
export const danmakuMin = 10;
export const mostDanmakuSegments = (segments: SegmentStat[], n = 3) => [...segments].filter((s) => s.弹幕 > 0).sort((a, b) => b.弹幕 - a.弹幕 || b.danmakuPer10s - a.danmakuPer10s).slice(0, n);

// ---------- 图 ----------

export const chartPage = (x: MatchedRow, platformName: string, peerLegend = '平台给的同类参考线（拟合，非真实观众）') => {
  const { curve, 段: segments } = x;
  const W = 1400;
  const marginLeft = 56;
  const marginRight = 16;
  const width = W - marginLeft - marginRight;
  const X = (t: number) => marginLeft + (t / curve.时长) * width;
  const steep = new Set(saggingSegments(segments, curve.留存).flatMap((u) => u.segKeys));
  const retainedKeys = new Set(retainedSegments(segments, curve.留存).flatMap((u) => u.segKeys));

  // 图一：留存
  const topMargin = 150; // 段名竖排占的高度
  const height = 300;
  const Y = (v: number) => topMargin + (1 - v) * height;
  const polyline = (points: { 秒: number; 留存: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${X(Math.min(p.秒, curve.时长)).toFixed(1)},${Y(p.留存).toFixed(1)}`).join('');
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid" x1="${marginLeft}" x2="${W - marginRight}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${marginLeft - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  const bandSvg = segments
    .map((s) => {
      const cls = steep.has(s.键) ? 'band hot' : retainedKeys.has(s.键) ? 'band keep' : 'band';
      const tooltip = `${s.编号} ${s.名}（${fmtSecClock(s.起)}–${fmtSecClock(s.止)}，${(s.止 - s.起).toFixed(1)} 秒）\n进段留存 ${percent(s.retentionIn)}，出段 ${percent(s.retentionOut)}，流失 ${percent(s.dropOff)}\n${s.inHeadWindow ? '整段在开头窗内，不排名' : s.inTailWindow ? '整段在结尾窗内，不排名' : `在场观众每 10 秒流失 ${percent(s.relDropPer10s)}${isPartial(s)}${s.tooShort ? '（短于半档，只是所在档的平均，和相邻短段合组排名）' : ''}`}\n弹幕 ${s.弹幕} 条`;
      return `<g><rect class="${cls}" x="${X(s.起)}" y="${topMargin}" width="${Math.max(X(s.止) - X(s.起), 0.5)}" height="${height}"><title>${esc(tooltip)}</title></rect>
<line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${topMargin - 4}" y2="${topMargin + height}"/>
${X(s.止) - X(s.起) >= 11 ? `<text class="seglabel${steep.has(s.键) || retainedKeys.has(s.键) ? ' strong' : ''}" transform="translate(${(X(s.起) + X(s.止)) / 2 + 4},${topMargin - 8}) rotate(-90)">${esc(s.名)}</text>` : ''}</g>`;
    })
    .join('\n');
  const xTicks = (y: number) => {
    const tickSec = curve.时长 > 240 ? 30 : curve.时长 > 60 ? 15 : 5;
    let out = '';
    for (let t = 0; t <= curve.时长; t += tickSec) out += `<text class="tick" x="${X(t)}" y="${y}" text-anchor="middle">${fmtSecClock(t)}</text>`;
    return out;
  };
  const pointMarkers = curve.留存.slice(1).map((p) => `<circle class="pt" cx="${X(Math.min(p.秒, curve.时长))}" cy="${Y(p.留存)}" r="4"><title>${fmtSecClock(p.秒)} 还在看 ${percent(p.留存)}</title></circle>`).join('');
  const retentionSvg = `<svg viewBox="0 0 ${W} ${topMargin + height + 30}" role="img" aria-label="留存曲线">
${gridLines}
<rect class="window" x="${X(0)}" y="${topMargin}" width="${X(Math.min(x.窗.headSec, curve.时长)) - X(0)}" height="${height}"/><text class="tick" x="${X(0) + 4}" y="${topMargin + height - 6}">开头窗 ${x.窗.headSec} 秒（不计入段排名）</text>
<rect class="window" x="${X(Math.max(0, curve.时长 - x.窗.tailSec))}" y="${topMargin}" width="${X(curve.时长) - X(Math.max(0, curve.时长 - x.窗.tailSec))}" height="${height}"/><text class="tick" x="${X(curve.时长) - 4}" y="${topMargin + height - 6}" text-anchor="end">结尾窗 ${x.窗.tailSec.toFixed(0)} 秒</text>
${bandSvg}
${curve.peerRetention.length ? `<path class="peer" d="${polyline(curve.peerRetention)}"/>` : ''}
<path class="line" d="${polyline(curve.留存)}"/>${pointMarkers}
${xTicks(topMargin + height + 20)}
</svg>`;

  // 图二：弹幕密度（5 秒一箱）
  const bins = danmakuDensity(curve.danmakuSec, curve.时长, 5);
  const maxCount = Math.max(1, ...bins.map((b) => b.数));
  const secondHeight = 120;
  const secondTop = 10;
  const Y2 = (n: number) => secondTop + secondHeight - (n / maxCount) * secondHeight;
  const column = bins
    .filter((b) => b.数 > 0)
    .map((b) => {
      const danmuText = curve.弹幕.filter((d) => d.秒 >= b.起 && d.秒 < b.起 + 5).map((d) => d.文本).slice(0, 8).join(' / ');
      return `<rect class="bar" x="${X(b.起) + 1}" y="${Y2(b.数)}" width="${Math.max(X(b.起 + 5) - X(b.起) - 2, 1)}" height="${secondTop + secondHeight - Y2(b.数)}" rx="2"><title>${fmtSecClock(b.起)} 起 5 秒：${b.数} 条\n${esc(danmuText)}</title></rect>`;
    })
    .join('');
  const boundaries = segments.map((s) => `<line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${secondTop}" y2="${secondTop + secondHeight}"/>`).join('');
  const danmakuDensitySvg = `<svg viewBox="0 0 ${W} ${secondTop + secondHeight + 30}" role="img" aria-label="弹幕密度">
<line class="grid" x1="${marginLeft}" x2="${W - marginRight}" y1="${secondTop + secondHeight}" y2="${secondTop + secondHeight}"/>
<text class="tick" x="${marginLeft - 6}" y="${Y2(maxCount) + 4}" text-anchor="end">${maxCount}</text><text class="tick" x="${marginLeft - 6}" y="${secondTop + secondHeight + 4}" text-anchor="end">0</text>
${boundaries}${column}
${xTicks(secondTop + secondHeight + 20)}
</svg>`;

  const rows = segments
    .map((s) => `<tr${steep.has(s.键) ? ' class="hot"' : retainedKeys.has(s.键) ? ' class="keep"' : ''}><td>${s.编号}</td><td>${esc(s.名)}</td><td>${fmtSecClock(s.起)}</td><td>${(s.止 - s.起).toFixed(1)}</td><td>${percent(s.retentionIn)}</td><td>${percent(s.dropOff)}</td><td>${s.inHeadWindow ? '开头窗内' : s.inTailWindow ? '结尾窗内' : `${percent(s.relDropPer10s)}${isPartial(s)}${s.tooShort ? '（短，合组排）' : ''}`}</td><td>${s.弹幕}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(curve.标题)} 留存与弹幕</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--text:#0b0b0b;--muted:#52514e;--grid:#e4e3df;--series:#2a78d6;--peer:#8a8984;--hot:#eb6834;--dm:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--series:#3987e5;--peer:#8f8e86;--hot:#d95926;--dm:#199e70}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--series:#3987e5;--peer:#8f8e86;--hot:#d95926;--dm:#199e70}
body{background:var(--surface);color:var(--text);font:14px/1.5 -apple-system,"PingFang SC",sans-serif;margin:0 auto;max-width:1440px;padding:16px}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--muted);font-size:12px}
.seg{stroke:var(--grid);stroke-width:1}.seglabel{fill:var(--muted);font-size:11px}.seglabel.strong{fill:var(--text);font-weight:600}
.band{fill:transparent}.band:hover{fill:var(--grid);fill-opacity:.5}.band.hot{fill:var(--hot);fill-opacity:.14}.band.keep{fill:var(--dm);fill-opacity:.14}.window{fill:var(--grid);fill-opacity:.45}
.line{fill:none;stroke:var(--series);stroke-width:2}.peer{fill:none;stroke:var(--peer);stroke-width:2;stroke-dasharray:6 4}
.pt{fill:var(--series);stroke:var(--surface);stroke-width:2}.bar{fill:var(--series)}
.legend span{margin-right:16px;color:var(--muted)}.sw{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}
table{border-collapse:collapse;font-size:13px;margin-top:12px}td,th{border-bottom:1px solid var(--grid);padding:3px 8px;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}tr.hot td{color:var(--hot)}tr.keep td{color:var(--dm)}
.wrap{overflow-x:auto}
</style></head><body>
<h2>${platformName}：${esc(curve.标题)}（${curve.id}，对交付 ${esc(x.deliveryName)}）</h2>
<p class="legend"><span><i class="sw" style="background:var(--series)"></i>本稿留存</span><span><i class="sw" style="background:var(--peer)"></i>${peerLegend}</span><span><i class="sw" style="background:var(--hot);opacity:.5"></i>窗后在场流失最快的段</span><span><i class="sw" style="background:var(--dm);opacity:.5"></i>窗后留得住的段</span></p>
<p style="color:var(--muted)">留存曲线 ${curve.留存.length - 1} 档（约 ${Math.round(curve.时长 / Math.max(1, curve.留存.length - 1))} 秒一档），段比档短时是插值；鼠标停在段上看数字（太短的段不写名字）。</p>
<div class="wrap">${retentionSvg}</div>
<h3>弹幕密度（5 秒一箱，共 ${curve.danmakuSec.length} 条）</h3>
<div class="wrap">${danmakuDensitySvg}</div>
<h3>按段</h3>
<div class="wrap"><table><tr><th>编号</th><th>段</th><th>起</th><th>秒</th><th>进段留存</th><th>段内流失（占全部）</th><th>在场每10秒流失</th><th>弹幕</th></tr>${rows}</table></div>
</body></html>
`;
};


// ---------- 说明里各平台共用的小节 ----------

/** 作品发布早于交付完成：上传的是更早的剪辑 */
export const versionNote = (x: MatchedRow) =>
  x.deliveryDoneAt && Date.parse(x.curve.发布) < Date.parse(x.deliveryDoneAt)
    ? `作品发布于 ${x.curve.发布.slice(0, 16).replace('T', ' ')} UTC，早于交付 ${x.deliveryName} 完成（${x.deliveryDoneAt.slice(0, 16).replace('T', ' ')} UTC）：上传的是更早的剪辑，段位置以交付为准，可能有偏差。`
    : null;

export const segNames = (segments: SegmentStat[], startSec: number, endSec: number) =>
  segments.filter((s) => s.止 > startSec && s.起 < endSec).map((s) => `${s.编号} ${s.名}${s.起 < startSec || s.止 > endSec ? `（${fmtSecClock(s.起)}–${fmtSecClock(s.止)}）` : ''}`).join('、');

export const windowTable = (x: MatchedRow, binComparisons: WindowComparison[]) => {
  const tableHeader = '| 时段 | 这时在播的段 | 本作在场每 10 秒流失 | 其他作品（同一时段） | 中位 | 判断 |\n|---|---|---|---|---|---|';
  const rows = binComparisons.map((c) => `| ${fmtSecClock(c.起)}–${fmtSecClock(c.止)} | ${segNames(x.段, c.起, c.止)} | ${percent(c.ownValue)} | ${c.others.map((o) => `${o.标题.slice(0, 12)} ${percent(o.值)}`).join('；') || '—'} | ${percent(c.median)} | ${c.verdict} |`);
  return [tableHeader, ...rows].join('\n');
};

/** 按段小节：窗后高于/低于平均的段，和不参与排名的段 */
export const perSegmentSection = (x: MatchedRow) => {
  const colText = (units: RankUnit[]) => units.map((s) => `${s.编号} ${s.名}（${(s.止 - s.起).toFixed(0)} 秒，${percent(s.relDropPer10s)}${isPartial(s)}）`).join('、') || '—';
  const mean = rankUnits(x.段, x.curve.留存).mean;
  const formatSegNames = (f: (s: SegmentStat) => boolean) => x.段.filter(f).map((s) => `${s.编号} ${s.名}`).join('、') || '无';
  return `**按段**（在场观众每 10 秒流失，只算开头 ${x.窗.headSec} 秒之后、最后 ${x.窗.tailSec.toFixed(0)} 秒之前，这一范围平均 ${percent(mean)}；连续的短段合成一组算）：
- 高于平均、掉人最快：${colText(saggingSegments(x.段, x.curve.留存))}
- 低于平均、留得住：${colText(retainedSegments(x.段, x.curve.留存))}
- 不参与排名：开头窗内 ${formatSegNames((s) => s.inHeadWindow)}；结尾窗内 ${formatSegNames((s) => s.inTailWindow)}；跨开头窗只算窗后 ${formatSegNames((s) => !s.inHeadWindow && s.countStart > s.起)}`;
};
