// 两平台对照：同一份交付在 B 站和抖音各有一条留存，按段比各自「窗后在场每 10 秒流失 / 本平台同一范围的平均」，
// 两边都高于平均的是两平台都掉人的段，都低于的是都留得住的段。两平台分发机制不同，绝对留存不直接比。
import { 排名单元们, type 段统计 } from '../bili/时间轴.ts';
import { esc, 百, 秒, type 对上 } from './图与排名.ts';

export type 对照行 = { 段: 段统计; 单元名: [string, string]; 值: [number, number]; 比: [number, number] };

/** 每段在两个平台上所在排名单元的每 10 秒流失和相对本平台平均的倍数；不参与排名的段不出行 */
export const 对照行们 = (a: 对上, b: 对上): 对照行[] => {
  const 表 = (x: 对上) => {
    const { 单元, 均值 } = 排名单元们(x.段, x.稿.留存);
    const m = new Map<string, { 名: string; 值: number; 比: number }>();
    for (const u of 单元) for (const k of u.键们) m.set(k, { 名: u.键们.length > 1 ? u.编号 : '', 值: u.每10秒相对流失, 比: u.每10秒相对流失 / 均值 });
    return m;
  };
  const ta = 表(a);
  const tb = 表(b);
  return a.段.flatMap((s) => {
    const x = ta.get(s.键);
    const y = tb.get(s.键);
    return x && y ? [{ 段: s, 单元名: [x.名, y.名] as [string, string], 值: [x.值, y.值] as [number, number], 比: [x.比, y.比] as [number, number] }] : [];
  });
};
export const 都掉人 = (行们: 对照行[], n = 5) => 行们.filter((r) => r.比[0] > 1 && r.比[1] > 1).sort((p, q) => Math.min(...q.比) - Math.min(...p.比)).slice(0, n);
export const 都留得住 = (行们: 对照行[], n = 5) => 行们.filter((r) => r.比[0] < 1 && r.比[1] < 1).sort((p, q) => Math.max(...p.比) - Math.max(...q.比)).slice(0, n);
export const 不一致 = (行们: 对照行[], n = 5) => 行们.filter((r) => (r.比[0] - 1) * (r.比[1] - 1) < 0).sort((p, q) => Math.abs(q.比[0] - q.比[1]) - Math.abs(p.比[0] - p.比[1])).slice(0, n);

const 行文 = (r: 对照行, 名: [string, string]) => `${r.段.编号} ${r.段.名}（${名[0]} ${百(r.值[0])}、平均的 ${r.比[0].toFixed(1)} 倍${r.单元名[0] ? `，按 ${r.单元名[0]} 合组` : ''}；${名[1]} ${百(r.值[1])}、${r.比[1].toFixed(1)} 倍）`;

export const 对照节 = (a: 对上, b: 对上, 名: [string, string], 图名: string) => {
  const 行们 = 对照行们(a, b);
  const 掉 = 都掉人(行们);
  const 稳 = 都留得住(行们);
  const 异 = 不一致(行们);
  return `### 交付 ${a.交付名}：${名[0]}「${a.稿.标题}」↔ ${名[1]}「${b.稿.标题}」

图：\`${图名}\`（两条留存线画在一起只看形状；两平台分发不同，绝对值不比）

按段比各平台自己的「窗后在场每 10 秒流失 / 本平台同一范围的平均」（开头 ${a.窗.开头} 秒、最后 ${a.窗.结尾.toFixed(0)} 秒不算；${名[0]} 留存档粗，短段按相邻段合组）：

- **两平台都掉人**：${掉.map((r) => 行文(r, 名)).join('；') || '无'}
- **两平台都留得住**：${稳.map((r) => 行文(r, 名)).join('；') || '无'}
- **两边不一致**（一边高于平均一边低于，差得最多的）：${异.map((r) => 行文(r, 名)).join('；') || '无'}`;
};

export const 对照图页 = (a: 对上, b: 对上, 名: [string, string]) => {
  const 时长 = Math.max(a.稿.时长, b.稿.时长);
  const W = 1400;
  const 左 = 56;
  const 右 = 16;
  const X = (t: number) => 左 + (t / 时长) * (W - 左 - 右);
  const 顶 = 150;
  const 高 = 300;
  const Y = (v: number) => 顶 + (1 - v) * 高;
  const 线 = (x: 对上) => x.稿.留存.map((p, i) => `${i ? 'L' : 'M'}${X(Math.min(p.秒, 时长)).toFixed(1)},${Y(p.留存).toFixed(1)}`).join('');
  const 行们 = 对照行们(a, b);
  const 掉 = new Set(都掉人(行们, 99).map((r) => r.段.键));
  const 稳 = new Set(都留得住(行们, 99).map((r) => r.段.键));
  const 带 = a.段
    .map((s) => {
      const cls = 掉.has(s.键) ? 'band hot' : 稳.has(s.键) ? 'band keep' : 'band';
      const r = 行们.find((x) => x.段.键 === s.键);
      const 提示 = `${s.编号} ${s.名}（${秒(s.起)}–${秒(s.止)}）\n${r ? `${名[0]} ${百(r.值[0])}（平均的 ${r.比[0].toFixed(1)} 倍）\n${名[1]} ${百(r.值[1])}（${r.比[1].toFixed(1)} 倍）` : '在开头窗或结尾窗内，不比'}`;
      return `<g><rect class="${cls}" x="${X(s.起)}" y="${顶}" width="${Math.max(X(s.止) - X(s.起), 0.5)}" height="${高}"><title>${esc(提示)}</title></rect><line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${顶 - 4}" y2="${顶 + 高}"/>${X(s.止) - X(s.起) >= 11 ? `<text class="seglabel${掉.has(s.键) || 稳.has(s.键) ? ' strong' : ''}" transform="translate(${(X(s.起) + X(s.止)) / 2 + 4},${顶 - 8}) rotate(-90)">${esc(s.名)}</text>` : ''}</g>`;
    })
    .join('\n');
  const 网格 = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid" x1="${左}" x2="${W - 右}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${左 - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  let 刻 = '';
  for (let t = 0; t <= 时长; t += 30) 刻 += `<text class="tick" x="${X(t)}" y="${顶 + 高 + 20}" text-anchor="middle">${秒(t)}</text>`;
  const 表 = 行们
    .map((r) => `<tr${掉.has(r.段.键) ? ' class="hot"' : 稳.has(r.段.键) ? ' class="keep"' : ''}><td>${r.段.编号}</td><td>${esc(r.段.名)}</td><td>${秒(r.段.起)}</td><td>${百(r.值[0])}</td><td>${r.比[0].toFixed(2)}</td><td>${百(r.值[1])}</td><td>${r.比[1].toFixed(2)}</td></tr>`)
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
<h2>两平台留存对照（交付 ${esc(a.交付名)}）</h2>
<p class="legend"><span><i class="sw" style="background:var(--s1)"></i>${名[0]}</span><span><i class="sw" style="background:var(--s2)"></i>${名[1]}</span><span><i class="sw" style="background:var(--hot);opacity:.5"></i>两平台都掉人</span><span><i class="sw" style="background:var(--keep);opacity:.5"></i>两平台都留得住</span></p>
<p style="color:var(--muted)">${名[0]}是点进来才播、${名[1]}是刷到即播，两条线的高低不能直接比，只看形状；段的判断用各平台自己的「窗后在场每 10 秒流失 / 平均」。</p>
<div class="wrap"><svg viewBox="0 0 ${W} ${顶 + 高 + 30}" role="img" aria-label="两平台留存">${网格}${带}<path class="l1" d="${线(a)}"/><path class="l2" d="${线(b)}"/>${刻}</svg></div>
<h3>按段（窗后在场每 10 秒流失，和相对本平台平均的倍数）</h3>
<div class="wrap"><table><tr><th>编号</th><th>段</th><th>起</th><th>${名[0]}</th><th>倍数</th><th>${名[1]}</th><th>倍数</th></tr>${表}</table></div>
</body></html>
`;
};
