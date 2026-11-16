// 两平台对照：同一份交付在 B 站和抖音各有一条留存，按段比各自「窗后在场每 10 秒流失 / 本平台同一范围的平均」，
// 两边都高于平均的是两平台都掉人的段，都低于的是都留得住的段。两平台分发机制不同，绝对留存不直接比。
import { rankUnits, type SegmentStat } from '../bili/时间轴.ts';
import { esc, percent, fmtSecClock, type MatchedRow } from './图与排名.ts';

export type ComparisonRow = { segment: SegmentStat; unitNames: [string, string]; value: [number, number]; 比: [number, number] };

/** 每段在两个平台上所在排名单元的每 10 秒流失和相对本平台平均的倍数；不参与排名的段不出行 */
export const comparisonRows = (a: MatchedRow, b: MatchedRow): ComparisonRow[] => {
  const rowRenderer = (x: MatchedRow) => {
    const { units, mean } = rankUnits(x.segment, x.curve.retention);
    const m = new Map<string, { name: string; value: number; 比: number }>();
    for (const u of units) for (const k of u.segKeys) m.set(k, { name: u.segKeys.length > 1 ? u.serial : '', value: u.relDropPer10s, 比: u.relDropPer10s / mean });
    return m;
  };
  const ta = rowRenderer(a);
  const tb = rowRenderer(b);
  return a.segment.flatMap((s) => {
    const x = ta.get(s.key);
    const y = tb.get(s.key);
    return x && y ? [{ segment: s, unitNames: [x.name, y.name] as [string, string], value: [x.value, y.value] as [number, number], 比: [x.比, y.比] as [number, number] }] : [];
  });
};
export const pickBothDropped = (rows: ComparisonRow[], n = 5) => rows.filter((r) => r.比[0] > 1 && r.比[1] > 1).sort((p, q) => Math.min(...q.比) - Math.min(...p.比)).slice(0, n);
export const pickBothRetained = (rows: ComparisonRow[], n = 5) => rows.filter((r) => r.比[0] < 1 && r.比[1] < 1).sort((p, q) => Math.max(...p.比) - Math.max(...q.比)).slice(0, n);
export const inconsistent = (rows: ComparisonRow[], n = 5) => rows.filter((r) => (r.比[0] - 1) * (r.比[1] - 1) < 0).sort((p, q) => Math.abs(q.比[0] - q.比[1]) - Math.abs(p.比[0] - p.比[1])).slice(0, n);

const rowText = (r: ComparisonRow, platformNames: [string, string]) => `${r.segment.serial} ${r.segment.name}（${platformNames[0]} ${percent(r.value[0])}、平均的 ${r.比[0].toFixed(1)} 倍${r.unitNames[0] ? `，按 ${r.unitNames[0]} 合组` : ''}；${platformNames[1]} ${percent(r.value[1])}、${r.比[1].toFixed(1)} 倍）`;

export const comparisonSection = (a: MatchedRow, b: MatchedRow, platformNames: [string, string], pageName: string) => {
  const rows = comparisonRows(a, b);
  const droppedRows = pickBothDropped(rows);
  const retainedRows = pickBothRetained(rows);
  const mismatched = inconsistent(rows);
  return `### 交付 ${a.deliveryName}：${platformNames[0]}「${a.curve.title}」↔ ${platformNames[1]}「${b.curve.title}」

图：\`${pageName}\`（两条留存线画在一起只看形状；两平台分发不同，绝对值不比）

按段比各平台自己的「窗后在场每 10 秒流失 / 本平台同一范围的平均」（开头 ${a.窗.headSec} 秒、最后 ${a.窗.tailSec.toFixed(0)} 秒不算；${platformNames[0]} 留存档粗，短段按相邻段合组）：

- **两平台都掉人**：${droppedRows.map((r) => rowText(r, platformNames)).join('；') || '无'}
- **两平台都留得住**：${retainedRows.map((r) => rowText(r, platformNames)).join('；') || '无'}
- **两边不一致**（一边高于平均一边低于，差得最多的）：${mismatched.map((r) => rowText(r, platformNames)).join('；') || '无'}`;
};

export const comparisonPage = (a: MatchedRow, b: MatchedRow, platformNames: [string, string]) => {
  const duration = Math.max(a.curve.duration, b.curve.duration);
  const W = 1400;
  const marginLeft = 56;
  const marginRight = 16;
  const X = (t: number) => marginLeft + (t / duration) * (W - marginLeft - marginRight);
  const topMargin = 150;
  const height = 300;
  const Y = (v: number) => topMargin + (1 - v) * height;
  const pathData = (x: MatchedRow) => x.curve.retention.map((p, i) => `${i ? 'L' : 'M'}${X(Math.min(p.sec, duration)).toFixed(1)},${Y(p.retention).toFixed(1)}`).join('');
  const rows = comparisonRows(a, b);
  const droppedKeys = new Set(pickBothDropped(rows, 99).map((r) => r.segment.key));
  const retainedKeys = new Set(pickBothRetained(rows, 99).map((r) => r.segment.key));
  const bandSvg = a.segment
    .map((s) => {
      const cls = droppedKeys.has(s.key) ? 'band hot' : retainedKeys.has(s.key) ? 'band keep' : 'band';
      const r = rows.find((x) => x.segment.key === s.key);
      const tooltip = `${s.serial} ${s.name}（${fmtSecClock(s.start)}–${fmtSecClock(s.end)}）\n${r ? `${platformNames[0]} ${percent(r.value[0])}（平均的 ${r.比[0].toFixed(1)} 倍）\n${platformNames[1]} ${percent(r.value[1])}（${r.比[1].toFixed(1)} 倍）` : '在开头窗或结尾窗内，不比'}`;
      return `<g><rect class="${cls}" x="${X(s.start)}" y="${topMargin}" width="${Math.max(X(s.end) - X(s.start), 0.5)}" height="${height}"><title>${esc(tooltip)}</title></rect><line class="seg" x1="${X(s.start)}" x2="${X(s.start)}" y1="${topMargin - 4}" y2="${topMargin + height}"/>${X(s.end) - X(s.start) >= 11 ? `<text class="seglabel${droppedKeys.has(s.key) || retainedKeys.has(s.key) ? ' strong' : ''}" transform="translate(${(X(s.start) + X(s.end)) / 2 + 4},${topMargin - 8}) rotate(-90)">${esc(s.name)}</text>` : ''}</g>`;
    })
    .join('\n');
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid" x1="${marginLeft}" x2="${W - marginRight}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${marginLeft - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  let tickSvg = '';
  for (let t = 0; t <= duration; t += 30) tickSvg += `<text class="tick" x="${X(t)}" y="${topMargin + height + 20}" text-anchor="middle">${fmtSecClock(t)}</text>`;
  const tableHtml = rows
    .map((r) => `<tr${droppedKeys.has(r.segment.key) ? ' class="hot"' : retainedKeys.has(r.segment.key) ? ' class="keep"' : ''}><td>${r.segment.serial}</td><td>${esc(r.segment.name)}</td><td>${fmtSecClock(r.segment.start)}</td><td>${percent(r.value[0])}</td><td>${r.比[0].toFixed(2)}</td><td>${percent(r.value[1])}</td><td>${r.比[1].toFixed(2)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>两平台留存对照</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--text:#0b0b0b;--muted:#52514e;--grid:#e4e3df;--s1:#2a78d6;--s2:#8a4fd1;--hot:#eb6834;--keep:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--s1:#3987e5;--s2:#a274e0;--hot:#d95926;--keep:#199e70}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--s1:#3987e5;--s2:#a274e0;--hot:#d95926;--keep:#199e70}
body{background:var(--surface);color:var(--text);font:14px/1.5 -apple-system,"PingFang SC",sans-serif;margin:0 auto;max-width:1440px;padding:16px}
svg{width:100%;height:auto;display:block}.grid{stroke:var(--grid)}.tick{fill:var(--muted);font-size:12px}
.seg{stroke:var(--grid)}.seglabel{fill:var(--muted);font-size:11px}.seglabel.strong{fill:var(--text);font-weight:600}
.band{fill:transparent}.band:hover{fill:var(--grid);fill-opacity:.5}.band.hot{fill:var(--hot);fill-opacity:.14}.band.keep{fill:var(--keep);fill-opacity:.14}
.l1{fill:none;stroke:var(--s1);stroke-width:2}.l2{fill:none;stroke:var(--s2);stroke-width:2}
.legend span{margin-right:16px;color:var(--muted)}.sw{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}
table{border-collapse:collapse;font-size:13px;margin-top:12px}td,th{border-bottom:1px solid var(--grid);padding:3px 8px;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}tr.hot td{color:var(--hot)}tr.keep td{color:var(--keep)}
.wrap{overflow-x:auto}
</style></head><body>
<h2>两平台留存对照（交付 ${esc(a.deliveryName)}）</h2>
<p class="legend"><span><i class="sw" style="background:var(--s1)"></i>${platformNames[0]}</span><span><i class="sw" style="background:var(--s2)"></i>${platformNames[1]}</span><span><i class="sw" style="background:var(--hot);opacity:.5"></i>两平台都掉人</span><span><i class="sw" style="background:var(--keep);opacity:.5"></i>两平台都留得住</span></p>
<p style="color:var(--muted)">${platformNames[0]}是点进来才播、${platformNames[1]}是刷到即播，两条线的高低不能直接比，只看形状；段的判断用各平台自己的「窗后在场每 10 秒流失 / 平均」。</p>
<div class="wrap"><svg viewBox="0 0 ${W} ${topMargin + height + 30}" role="img" aria-label="两平台留存">${gridLines}${bandSvg}<path class="l1" d="${pathData(a)}"/><path class="l2" d="${pathData(b)}"/>${tickSvg}</svg></div>
<h3>按段（窗后在场每 10 秒流失，和相对本平台平均的倍数）</h3>
<div class="wrap"><table><tr><th>编号</th><th>段</th><th>起</th><th>${platformNames[0]}</th><th>倍数</th><th>${platformNames[1]}</th><th>倍数</th></tr>${tableHtml}</table></div>
</body></html>
`;
};
