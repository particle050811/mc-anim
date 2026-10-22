// 各平台共用的留存分析：拖沓段和留得住的段的排名、开头时段和同账号其他作品比、每个作品一张 HTML 图（留存曲线和弹幕密度上下两张，叠段边界）。
// 配色照 dataviz 默认色板（系列 1 蓝、强调橙），浅色深色各一套；留存和弹幕量纲不同，分两张图不共用 y 轴。
import type { 留存点 } from '../bili/数据.ts';
import { 弹幕密度, 排名单元们, 每10秒流失, type 排名单元, type 段统计, type 窗 } from '../bili/时间轴.ts';

/** 平台无关的作品形状：B 站稿件、抖音作品都解析成带这些字段的样子 */
export type 曲线稿 = {
  标识: string;
  标题: string;
  时长: number;
  /** ISO 时间 */
  发布: string;
  /** 含 (0, 1) 的留存曲线 */
  留存: 留存点[];
  /** 平台给的同类参考线（拟合，非真实观众），只画不算 */
  同类留存: 留存点[];
  弹幕秒: number[];
  弹幕: { 秒: number; 文本: string }[];
};
export type 对上<T extends 曲线稿 = 曲线稿> = { 稿: T; 交付名: string; 交付完成?: string; 窗: 窗; 段: 段统计[] };

export const 百 = (v: number | null | undefined, 位 = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(位)}%`);
export const 秒 = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** 只算了段的一部分时注明 */
export const 范围 = (s: { 起: number; 止: number; 计起: number; 计止: number }) => (s.计起 > s.起 || s.计止 < s.止 ? `（只算 ${秒(s.计起)}–${秒(s.计止)}）` : '');
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 拖沓候选：开头窗后、结尾窗前，在场每 10 秒流失高于全片（同一范围）平均、最高的几段 */
export const 拖沓段 = (段: 段统计[], 曲: 留存点[], n = 3) => {
  const { 单元, 均值 } = 排名单元们(段, 曲);
  return 单元.filter((u) => u.每10秒相对流失 > 均值).sort((a, b) => b.每10秒相对流失 - a.每10秒相对流失).slice(0, n);
};
/** 留得住的段：同一范围里低于平均、最低的几段 */
export const 留得住段 = (段: 段统计[], 曲: 留存点[], n = 3) => {
  const { 单元, 均值 } = 排名单元们(段, 曲);
  return 单元.filter((u) => u.每10秒相对流失 < 均值).sort((a, b) => a.每10秒相对流失 - b.每10秒相对流失).slice(0, n);
};

/** 开头窗检验：本稿各 20 秒时段的在场每 10 秒流失，和同账号其他作品同一时段比（其他作品要比时段末再长 10 秒，免得混进片尾流失） */
export type 时段对比 = { 起: number; 止: number; 本稿: number; 其他: { 标题: string; 值: number }[]; 中位: number; 判断: string };
export const 开头时段对比 = (稿: 曲线稿, 稿们: 曲线稿[], 步 = 20, 到 = 120): 时段对比[] => {
  const out: 时段对比[] = [];
  for (let 起 = 0; 起 + 步 <= Math.min(到, 稿.时长 - 10); 起 += 步) {
    const 止 = 起 + 步;
    const 其他 = 稿们
      .filter((o) => o.标识 !== 稿.标识 && o.留存.length > 2 && o.时长 >= 止 + 10)
      .map((o) => ({ 标题: o.标题, 值: 每10秒流失(o.留存, 起, 止) }))
      .filter((x) => Number.isFinite(x.值));
    const 排 = 其他.map((x) => x.值).sort((a, b) => a - b);
    const 中位 = 排.length ? (排.length % 2 ? 排[(排.length - 1) / 2]! : (排[排.length / 2 - 1]! + 排[排.length / 2]!) / 2) : NaN;
    const 本稿 = 每10秒流失(稿.留存, 起, 止);
    const 判断 =
      排.length < 3 ? '不确定（可比作品不到 3 个）'
      : 本稿 > 排.at(-1)! ? '高于所有其他作品'
      : 本稿 < 排[0]! ? '低于所有其他作品'
      : 本稿 > 中位 ? '在其他作品范围内，偏高'
      : '在其他作品范围内，偏低';
    out.push({ 起, 止, 本稿, 其他, 中位, 判断 });
  }
  return out;
};
/** 弹幕少于这个数时不按段排（一两条没有信号） */
export const 弹幕下限 = 10;
export const 弹幕最多段 = (段: 段统计[], n = 3) => [...段].filter((s) => s.弹幕 > 0).sort((a, b) => b.弹幕 - a.弹幕 || b.每10秒弹幕 - a.每10秒弹幕).slice(0, n);

// ---------- 图 ----------

export const 图页 = (x: 对上, 平台: string, 同类图例 = '平台给的同类参考线（拟合，非真实观众）') => {
  const { 稿, 段 } = x;
  const W = 1400;
  const 左 = 56;
  const 右 = 16;
  const 宽 = W - 左 - 右;
  const X = (t: number) => 左 + (t / 稿.时长) * 宽;
  const 陡 = new Set(拖沓段(段, 稿.留存).flatMap((u) => u.键们));
  const 稳 = new Set(留得住段(段, 稿.留存).flatMap((u) => u.键们));

  // 图一：留存
  const 顶 = 150; // 段名竖排占的高度
  const 高 = 300;
  const Y = (v: number) => 顶 + (1 - v) * 高;
  const 折线 = (点: { 秒: number; 留存: number }[]) => 点.map((p, i) => `${i ? 'L' : 'M'}${X(Math.min(p.秒, 稿.时长)).toFixed(1)},${Y(p.留存).toFixed(1)}`).join('');
  const 网格 = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid" x1="${左}" x2="${W - 右}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${左 - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  const 带 = 段
    .map((s) => {
      const cls = 陡.has(s.键) ? 'band hot' : 稳.has(s.键) ? 'band keep' : 'band';
      const 提示 = `${s.编号} ${s.名}（${秒(s.起)}–${秒(s.止)}，${(s.止 - s.起).toFixed(1)} 秒）\n进段留存 ${百(s.入留存)}，出段 ${百(s.出留存)}，流失 ${百(s.流失)}\n${s.窗内 ? '整段在开头窗内，不排名' : s.结尾窗内 ? '整段在结尾窗内，不排名' : `在场观众每 10 秒流失 ${百(s.每10秒相对流失)}${范围(s)}${s.过短 ? '（短于半档，只是所在档的平均，和相邻短段合组排名）' : ''}`}\n弹幕 ${s.弹幕} 条`;
      return `<g><rect class="${cls}" x="${X(s.起)}" y="${顶}" width="${Math.max(X(s.止) - X(s.起), 0.5)}" height="${高}"><title>${esc(提示)}</title></rect>
<line class="seg" x1="${X(s.起)}" x2="${X(s.起)}" y1="${顶 - 4}" y2="${顶 + 高}"/>
${X(s.止) - X(s.起) >= 11 ? `<text class="seglabel${陡.has(s.键) || 稳.has(s.键) ? ' strong' : ''}" transform="translate(${(X(s.起) + X(s.止)) / 2 + 4},${顶 - 8}) rotate(-90)">${esc(s.名)}</text>` : ''}</g>`;
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
<rect class="window" x="${X(0)}" y="${顶}" width="${X(Math.min(x.窗.开头, 稿.时长)) - X(0)}" height="${高}"/><text class="tick" x="${X(0) + 4}" y="${顶 + 高 - 6}">开头窗 ${x.窗.开头} 秒（不计入段排名）</text>
<rect class="window" x="${X(Math.max(0, 稿.时长 - x.窗.结尾))}" y="${顶}" width="${X(稿.时长) - X(Math.max(0, 稿.时长 - x.窗.结尾))}" height="${高}"/><text class="tick" x="${X(稿.时长) - 4}" y="${顶 + 高 - 6}" text-anchor="end">结尾窗 ${x.窗.结尾.toFixed(0)} 秒</text>
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
    .map((s) => `<tr${陡.has(s.键) ? ' class="hot"' : 稳.has(s.键) ? ' class="keep"' : ''}><td>${s.编号}</td><td>${esc(s.名)}</td><td>${秒(s.起)}</td><td>${(s.止 - s.起).toFixed(1)}</td><td>${百(s.入留存)}</td><td>${百(s.流失)}</td><td>${s.窗内 ? '开头窗内' : s.结尾窗内 ? '结尾窗内' : `${百(s.每10秒相对流失)}${范围(s)}${s.过短 ? '（短，合组排）' : ''}`}</td><td>${s.弹幕}</td></tr>`)
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
.band{fill:transparent}.band:hover{fill:var(--grid);fill-opacity:.5}.band.hot{fill:var(--hot);fill-opacity:.14}.band.keep{fill:var(--dm);fill-opacity:.14}.window{fill:var(--grid);fill-opacity:.45}
.line{fill:none;stroke:var(--series);stroke-width:2}.peer{fill:none;stroke:var(--peer);stroke-width:2;stroke-dasharray:6 4}
.pt{fill:var(--series);stroke:var(--surface);stroke-width:2}.bar{fill:var(--series)}
.legend span{margin-right:16px;color:var(--muted)}.sw{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}
table{border-collapse:collapse;font-size:13px;margin-top:12px}td,th{border-bottom:1px solid var(--grid);padding:3px 8px;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}tr.hot td{color:var(--hot)}tr.keep td{color:var(--dm)}
.wrap{overflow-x:auto}
</style></head><body>
<h2>${平台}：${esc(稿.标题)}（${稿.标识}，对交付 ${esc(x.交付名)}）</h2>
<p class="legend"><span><i class="sw" style="background:var(--series)"></i>本稿留存</span><span><i class="sw" style="background:var(--peer)"></i>${同类图例}</span><span><i class="sw" style="background:var(--hot);opacity:.5"></i>窗后在场流失最快的段</span><span><i class="sw" style="background:var(--dm);opacity:.5"></i>窗后留得住的段</span></p>
<p style="color:var(--muted)">留存曲线 ${稿.留存.length - 1} 档（约 ${Math.round(稿.时长 / Math.max(1, 稿.留存.length - 1))} 秒一档），段比档短时是插值；鼠标停在段上看数字（太短的段不写名字）。</p>
<div class="wrap">${图一}</div>
<h3>弹幕密度（5 秒一箱，共 ${稿.弹幕秒.length} 条）</h3>
<div class="wrap">${图二}</div>
<h3>按段</h3>
<div class="wrap"><table><tr><th>编号</th><th>段</th><th>起</th><th>秒</th><th>进段留存</th><th>段内流失（占全部）</th><th>在场每10秒流失</th><th>弹幕</th></tr>${行}</table></div>
</body></html>
`;
};


// ---------- 说明里各平台共用的小节 ----------

/** 作品发布早于交付完成：上传的是更早的剪辑 */
export const 版本提示 = (x: 对上) =>
  x.交付完成 && Date.parse(x.稿.发布) < Date.parse(x.交付完成)
    ? `作品发布于 ${x.稿.发布.slice(0, 16).replace('T', ' ')} UTC，早于交付 ${x.交付名} 完成（${x.交付完成.slice(0, 16).replace('T', ' ')} UTC）：上传的是更早的剪辑，段位置以交付为准，可能有偏差。`
    : null;

export const 段名们 = (段: 段统计[], 起: number, 止: number) =>
  段.filter((s) => s.止 > 起 && s.起 < 止).map((s) => `${s.编号} ${s.名}${s.起 < 起 || s.止 > 止 ? `（${秒(s.起)}–${秒(s.止)}）` : ''}`).join('、');

export const 时段表 = (x: 对上, 对比: 时段对比[]) => {
  const 头 = '| 时段 | 这时在播的段 | 本作在场每 10 秒流失 | 其他作品（同一时段） | 中位 | 判断 |\n|---|---|---|---|---|---|';
  const 行 = 对比.map((c) => `| ${秒(c.起)}–${秒(c.止)} | ${段名们(x.段, c.起, c.止)} | ${百(c.本稿)} | ${c.其他.map((o) => `${o.标题.slice(0, 12)} ${百(o.值)}`).join('；') || '—'} | ${百(c.中位)} | ${c.判断} |`);
  return [头, ...行].join('\n');
};

/** 按段小节：窗后高于/低于平均的段，和不参与排名的段 */
export const 按段小节 = (x: 对上) => {
  const 列 = (们: 排名单元[]) => 们.map((s) => `${s.编号} ${s.名}（${(s.止 - s.起).toFixed(0)} 秒，${百(s.每10秒相对流失)}${范围(s)}）`).join('、') || '—';
  const 均 = 排名单元们(x.段, x.稿.留存).均值;
  const 名 = (f: (s: 段统计) => boolean) => x.段.filter(f).map((s) => `${s.编号} ${s.名}`).join('、') || '无';
  return `**按段**（在场观众每 10 秒流失，只算开头 ${x.窗.开头} 秒之后、最后 ${x.窗.结尾.toFixed(0)} 秒之前，这一范围平均 ${百(均)}；连续的短段合成一组算）：
- 高于平均、掉人最快：${列(拖沓段(x.段, x.稿.留存))}
- 低于平均、留得住：${列(留得住段(x.段, x.稿.留存))}
- 不参与排名：开头窗内 ${名((s) => s.窗内)}；结尾窗内 ${名((s) => s.结尾窗内)}；跨开头窗只算窗后 ${名((s) => !s.窗内 && s.计起 > s.起)}`;
};
