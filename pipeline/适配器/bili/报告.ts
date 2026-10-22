// anim bili 分析 的报告：00-说明.md（指标对比、按段发现、建议）+ 每个对上交付的稿件一张 HTML 图（留存曲线和弹幕密度上下两张，叠段边界）。
// 配色照 dataviz 默认色板（系列 1 蓝、强调橙），浅色深色各一套；留存和弹幕量纲不同，分两张图不共用 y 轴。
import type { 稿件 } from './数据.ts';
import { 弹幕密度, type 段统计 } from './时间轴.ts';

export type 对上 = { 稿: 稿件; 交付名: string; 段: 段统计[] };

const 百 = (v: number | null | undefined, 位 = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(位)}%`);
const 秒 = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 拖沓候选：去掉首段（看 3 秒跳出）和末段（片尾自然流失），按比同类多走的观众排；没有同类曲线就按在场每 10 秒流失排 */
export const 拖沓段 = (段: 段统计[], n = 3) => {
  const 有同类 = 段.some((s) => Number.isFinite(s.超同类流失));
  const 键 = (s: 段统计) => (有同类 ? s.超同类流失 : s.每10秒相对流失);
  return 段.slice(1, -1)
    .filter((s) => s.止 - s.起 >= 3 && Number.isFinite(键(s)) && 键(s) > 0)
    .sort((a, b) => 键(b) - 键(a))
    .slice(0, n);
};
/** 弹幕少于这个数时不按段排（一两条没有信号） */
const 弹幕下限 = 10;
export const 流失最多段 = (段: 段统计[], n = 3) => [...段].filter((s) => Number.isFinite(s.流失)).sort((a, b) => b.流失 - a.流失).slice(0, n);
export const 弹幕最多段 = (段: 段统计[], n = 3) => [...段].filter((s) => s.弹幕 > 0).sort((a, b) => b.弹幕 - a.弹幕 || b.每10秒弹幕 - a.每10秒弹幕).slice(0, n);

// ---------- 图 ----------

export const 图页 = (x: 对上) => {
  const { 稿, 段 } = x;
  const W = 1400;
  const 左 = 56;
  const 右 = 16;
  const 宽 = W - 左 - 右;
  const X = (t: number) => 左 + (t / 稿.时长) * 宽;
  const 陡 = new Set(拖沓段(段).map((s) => s.键));
  const 多 = new Set(稿.弹幕秒.length >= 弹幕下限 ? 弹幕最多段(段, 1).map((s) => s.键) : []);

  // 图一：留存
  const 顶 = 150; // 段名竖排占的高度
  const 高 = 300;
  const Y = (v: number) => 顶 + (1 - v) * 高;
  const 折线 = (点: { 秒: number; 留存: number }[]) => 点.map((p, i) => `${i ? 'L' : 'M'}${X(Math.min(p.秒, 稿.时长)).toFixed(1)},${Y(p.留存).toFixed(1)}`).join('');
  const 网格 = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid" x1="${左}" x2="${W - 右}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${左 - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  const 带 = 段
    .map((s) => {
      const cls = 陡.has(s.键) ? 'band hot' : 多.has(s.键) ? 'band dm' : 'band';
      const 提示 = `${s.编号} ${s.名}（${秒(s.起)}–${秒(s.止)}，${(s.止 - s.起).toFixed(1)} 秒）\n进段留存 ${百(s.入留存)}，出段 ${百(s.出留存)}，流失 ${百(s.流失)}\n在场观众每 10 秒流失 ${百(s.每10秒相对流失)}，比同类多走 ${百(s.超同类流失)}\n弹幕 ${s.弹幕} 条`;
      return `<g><rect class="${cls}" x="${X(s.起)}" y="${顶}" width="${Math.max(X(s.止) - X(s.起), 0.5)}" height="${高}"><title>${esc(提示)}</title></rect>
<line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${顶 - 4}" y2="${顶 + 高}"/>
${X(s.止) - X(s.起) >= 11 ? `<text class="seglabel${陡.has(s.键) || 多.has(s.键) ? ' strong' : ''}" transform="translate(${(X(s.起) + X(s.止)) / 2 + 4},${顶 - 8}) rotate(-90)">${esc(s.名)}</text>` : ''}</g>`;
    })
    .join('\n');
  const x刻度 = (y: number) => {
    const 步 = 稿.时长 > 240 ? 30 : 稿.时长 > 60 ? 15 : 5;
    let out = '';
    for (let t = 0; t <= 稿.时长; t += 步) out += `<text class="tick" x="${X(t)}" y="${y}" text-anchor="middle">${秒(t)}</text>`;
    return out;
  };
  const 档点 = 稿.留存.slice(1).map((p) => `<circle class="pt" cx="${X(Math.min(p.秒, 稿.时长))}" cy="${Y(p.留存)}" r="4"><title>${秒(p.秒)} 还在看 ${百(p.留存)}</title></circle>`).join('');
  const 图一 = `<svg viewBox="0 0 ${W} ${顶 + 高 + 30}" role="img" aria-label="留存曲线">
${网格}
${带}
${稿.同类留存.length ? `<path class="peer" d="${折线(稿.同类留存)}"/>` : ''}
<path class="line" d="${折线(稿.留存)}"/>${档点}
${x刻度(顶 + 高 + 20)}
</svg>`;

  // 图二：弹幕密度（5 秒一箱）
  const 箱 = 弹幕密度(稿.弹幕秒, 稿.时长, 5);
  const 最大 = Math.max(1, ...箱.map((b) => b.数));
  const 高2 = 120;
  const 顶2 = 10;
  const Y2 = (n: number) => 顶2 + 高2 - (n / 最大) * 高2;
  const 柱 = 箱
    .filter((b) => b.数 > 0)
    .map((b) => {
      const 文 = 稿.弹幕.filter((d) => d.秒 >= b.起 && d.秒 < b.起 + 5).map((d) => d.文本).slice(0, 8).join(' / ');
      return `<rect class="bar" x="${X(b.起) + 1}" y="${Y2(b.数)}" width="${Math.max(X(b.起 + 5) - X(b.起) - 2, 1)}" height="${顶2 + 高2 - Y2(b.数)}" rx="2"><title>${秒(b.起)} 起 5 秒：${b.数} 条\n${esc(文)}</title></rect>`;
    })
    .join('');
  const 边界 = 段.map((s) => `<line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${顶2}" y2="${顶2 + 高2}"/>`).join('');
  const 图二 = `<svg viewBox="0 0 ${W} ${顶2 + 高2 + 30}" role="img" aria-label="弹幕密度">
<line class="grid" x1="${左}" x2="${W - 右}" y1="${顶2 + 高2}" y2="${顶2 + 高2}"/>
<text class="tick" x="${左 - 6}" y="${Y2(最大) + 4}" text-anchor="end">${最大}</text><text class="tick" x="${左 - 6}" y="${顶2 + 高2 + 4}" text-anchor="end">0</text>
${边界}${柱}
${x刻度(顶2 + 高2 + 20)}
</svg>`;

  const 行 = 段
    .map((s) => `<tr${陡.has(s.键) ? ' class="hot"' : ''}><td>${s.编号}</td><td>${esc(s.名)}</td><td>${秒(s.起)}</td><td>${(s.止 - s.起).toFixed(1)}</td><td>${百(s.入留存)}</td><td>${百(s.流失)}</td><td>${百(s.每10秒相对流失)}</td><td>${百(s.超同类流失)}</td><td>${s.弹幕}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(稿.标题)} 留存与弹幕</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--text:#0b0b0b;--muted:#52514e;--grid:#e4e3df;--series:#2a78d6;--peer:#8a8984;--hot:#eb6834;--dm:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--series:#3987e5;--peer:#8f8e86;--hot:#d95926;--dm:#199e70}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--grid:#34332f;--series:#3987e5;--peer:#8f8e86;--hot:#d95926;--dm:#199e70}
body{background:var(--surface);color:var(--text);font:14px/1.5 -apple-system,"PingFang SC",sans-serif;margin:0 auto;max-width:1440px;padding:16px}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--muted);font-size:12px}
.seg{stroke:var(--grid);stroke-width:1}.seglabel{fill:var(--muted);font-size:11px}.seglabel.strong{fill:var(--text);font-weight:600}
.band{fill:transparent}.band:hover{fill:var(--grid);fill-opacity:.5}.band.hot{fill:var(--hot);fill-opacity:.14}.band.dm{fill:var(--dm);fill-opacity:.14}
.line{fill:none;stroke:var(--series);stroke-width:2}.peer{fill:none;stroke:var(--peer);stroke-width:2;stroke-dasharray:6 4}
.pt{fill:var(--series);stroke:var(--surface);stroke-width:2}.bar{fill:var(--series)}
.legend span{margin-right:16px;color:var(--muted)}.sw{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}
table{border-collapse:collapse;font-size:13px;margin-top:12px}td,th{border-bottom:1px solid var(--grid);padding:3px 8px;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}tr.hot td{color:var(--hot)}
.wrap{overflow-x:auto}
</style></head><body>
<h2>${esc(稿.标题)}（${稿.bvid}，对交付 ${esc(x.交付名)}）</h2>
<p class="legend"><span><i class="sw" style="background:var(--series)"></i>本稿留存</span><span><i class="sw" style="background:var(--peer)"></i>同类稿件留存</span><span><i class="sw" style="background:var(--hot);opacity:.5"></i>比同类多走观众最多的段</span><span><i class="sw" style="background:var(--dm);opacity:.5"></i>弹幕最多的段</span></p>
<p style="color:var(--muted)">留存是创作中心「流失趋势」的 ${稿.留存.length - 1} 档（约 ${Math.round(稿.时长 / Math.max(1, 稿.留存.length - 1))} 秒一档），段比档短时是插值；鼠标停在段上看数字（太短的段不写名字）。</p>
<div class="wrap">${图一}</div>
<h3>弹幕密度（5 秒一箱，共 ${稿.弹幕秒.length} 条）</h3>
<div class="wrap">${图二}</div>
<h3>按段</h3>
<div class="wrap"><table><tr><th>编号</th><th>段</th><th>起</th><th>秒</th><th>进段留存</th><th>段内流失</th><th>每10秒流失</th><th>比同类多走</th><th>弹幕</th></tr>${行}</table></div>
</body></html>
`;
};

// ---------- 说明 ----------

const 指标表 = (稿们: 稿件[]) => {
  const 头 = '| 稿件 | 时长 | 播放 | 完播率 | 封标点击率 | 封标超过同类 | 3 秒跳出 | 互动率 | 播转粉 | 游客占比 | 点赞 | 投币 | 收藏 | 弹幕 | 评论 | 涨粉 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const 过往 = (v: '高于' | '低于' | null) => (v ? `，${v}过往` : '');
  const 行 = 稿们.map((s) => {
    const m = s.指标;
    return `| ${s.标题} | ${秒(s.时长)} | ${m.播放} | ${百(m.完播率)} | ${百(m.封标点击率)} | ${百(s.超过同类.封标点击率, 0)}${过往(s.较过往.封标点击率)} | ${百(m.三秒跳出率)}${过往(s.较过往.三秒跳出率)} | ${百(m.互动率)}${过往(s.较过往.互动率)} | ${百(m.播转粉率, 2)} | ${百(m.游客占比)} | ${m.点赞} | ${m.投币} | ${m.收藏} | ${m.弹幕} | ${m.评论} | ${m.涨粉} |`;
  });
  return [头, ...行].join('\n');
};

/** 按数据生成的建议（规则写在这里，结论随数据变） */
/** 系列名：标题开头到第一个数字或括号前（「应力转动 6 出征暮色」「应力转动（1-3）」都是 应力转动） */
const 系列 = (s: 稿件) => /^([^\d（(\s-]+)/.exec(s.标题)?.[1] ?? '';

export const 建议 = (稿们: 稿件[], 对上们: 对上[]) => {
  const out: string[] = [];
  for (const x of 对上们) {
    const { 稿, 段 } = x;
    const m = 稿.指标;
    const 同系列 = 稿们.filter((o) => o.bvid !== 稿.bvid && 系列(o) && 系列(o) === 系列(稿));
    const 系列封标 = 同系列.map((o) => o.超过同类.封标点击率).filter((v): v is number => v !== null);
    const 本封标 = 稿.超过同类.封标点击率;
    if (本封标 !== null && (稿.较过往.封标点击率 === '低于' || (系列封标.length && 本封标 < Math.min(...系列封标))))
      out.push(`**封面标题**：「${稿.标题}」封标点击率只超过 ${百(本封标, 0)} 同类稿件${稿.较过往.封标点击率 === '低于' ? '、低于过往' : ''}${系列封标.length ? `，本系列其他集是 ${系列封标.map((v) => 百(v, 0)).join('、')}` : ''}；游客占比 ${百(m.游客占比)}，几乎全靠推荐流。标题只写集数和地名不够，换成能看出冲突或看点的说法（如点出监守者、五万血），封面放最强的一帧动作画面。`);
    const r20 = 稿.留存[1];
    const 高光 = 稿.弹幕秒.length >= 弹幕下限 ? 弹幕最多段(段, 1)[0]?.名 : undefined;
    if (m.三秒跳出率 !== null)
      out.push(`**开头 3 秒**：3 秒跳出 ${百(m.三秒跳出率)}${稿.较过往.三秒跳出率 ? `，${稿.较过往.三秒跳出率}过往` : ''}${稿.超过同类.三秒跳出率 !== null ? `（超过 ${百(稿.超过同类.三秒跳出率, 0)} 同类）` : ''}；到 ${r20 ? 秒(r20.秒) : '首档'} 剩 ${百(r20?.留存)}${稿.同类留存[1] ? `（同类 ${百(稿.同类留存[1].留存)}）` : ''}。开头的「${段[0]?.名 ?? ''}」${段[0] ? `${(段[0].止 - 段[0].起).toFixed(1)} 秒` : ''}要在头 3 秒给出动作或悬念${高光 ? `，可以把「${高光}」剪 2～3 秒闪前放片头` : '，可以把后面最强的动作镜头剪 2～3 秒闪前放片头'}。`);
    const 陡 = 拖沓段(段);
    if (陡.length)
      out.push(`**可能拖沓的段**（比同类稿件同时段多走观众最多，排除首尾段）：${陡.map((s) => `${s.编号} ${s.名}（${(s.止 - s.起).toFixed(0)} 秒，多走 ${百(s.超同类流失)}）`).join('、')}。长段优先压缩，或在中间加转折、台词钩子。`);
    const 多 = 稿.弹幕秒.length >= 弹幕下限 ? 弹幕最多段(段) : [];
    if (多.length) out.push(`**观众有反应的段**：${多.map((s) => `${s.编号} ${s.名}（${s.弹幕} 条）`).join('、')}，这类内容可以前置或在封面标题里点出来。`);
    else out.push(`**弹幕**：本稿只有 ${稿.弹幕秒.length} 条弹幕，按段没有可比的信号。`);
  }
  // 同系列各集的时长和完播
  for (const x of 对上们) {
    const 同 = 稿们.filter((o) => 系列(o) && 系列(o) === 系列(x.稿)).sort((a, b) => a.时长 - b.时长);
    if (同.length >= 2)
      out.push(`**单集时长**：本系列按时长排 ${同.map((o) => `${秒(o.时长)} 完播 ${百(o.指标.完播率)}`).join('、')}。近 6 分钟的这集完播最低，可以按场拆成 1～2 分钟一集连发，每集结尾留钩子。`);
  }
  return out;
};

export const 说明 = (稿们: 稿件[], 对上们: 对上[], 包信息: { 取于: string; 请求数: number; 文件: string }, 图: Map<string, string>) => {
  const 没对上 = 稿们.filter((s) => !对上们.some((x) => x.稿.bvid === s.bvid));
  const 段节 = 对上们
    .map((x) => {
      const 流 = 流失最多段(x.段).map((s) => `${s.编号} ${s.名}（流失 ${百(s.流失)}）`).join('、');
      const 陡 = 拖沓段(x.段).map((s) => `${s.编号} ${s.名}（多走 ${百(s.超同类流失)}）`).join('、');
      const 多 = x.稿.弹幕秒.length >= 弹幕下限 ? 弹幕最多段(x.段).map((s) => `${s.编号} ${s.名}（${s.弹幕} 条）`).join('、') : `只有 ${x.稿.弹幕秒.length} 条，不按段排`;
      return `### ${x.稿.标题} ↔ 交付 ${x.交付名}\n\n图：\`${图.get(x.稿.bvid)}\`（浏览器打开，鼠标停在段上看数字）\n\n- 平均留存曲线：${x.稿.留存.length - 1} 档，末档 ${百(x.稿.留存.at(-1)?.留存)}；完播率 ${百(x.稿.指标.完播率)}\n- 流失最多（占全部观众）：${流}\n- 比同类多走观众最多（排除首尾段）：${陡}\n- 弹幕最多：${多}${x.稿.平台解读 ? `\n- 平台解读：${x.稿.平台解读}` : ''}`;
    })
    .join('\n\n');
  return `# B 站数据分析

数据：\`${包信息.文件}\`（取于 ${包信息.取于}，${包信息.请求数} 次请求）。比率都来自创作中心；「封标超过同类」「高于/低于过往」是页面上的评价（封标点击率的原值随取数时刻变动，各接口也不一致，看超过同类更稳）。

## 各稿件指标

${指标表(稿们)}

## 对上本地成片的稿件

${段节 || '没有稿件对上本地交付。'}

${没对上.length ? `没对上本地交付、只做指标汇总的：${没对上.map((s) => `「${s.标题}」`).join('、')}。\n` : ''}
## 建议

${建议(稿们, 对上们).map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 口径

- 留存：创作中心「播放分析 → 流失趋势」，某秒处还在看的观众比例，约 18 档；段内是线性插值，短于一档的段只能看大势。
- 「每 10 秒流失」= 1 −（出段留存 / 进段留存）^(10 / 段长)；「流失」是占全部观众的百分点，开头的段天然最大。
- 「比同类多走」= 本段流失 − 进段留存 ×（同类稿件同一时段的相对流失），即扣掉同类在同一时刻也会走的那部分；拖沓段按它排。
- 弹幕：UP 主弹幕管理里的全部弹幕，progress 对到成片时间；段边界取交付 manifest 的全片起帧和帧率。

你的回复：
`;
};
