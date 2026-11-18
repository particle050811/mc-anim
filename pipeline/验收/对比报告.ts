// anim diff 跑一遍：逐对算数、出 旧｜新｜差 并排图、给复查命令，汇总写进 00-说明.md 也打到终端。
// 并排图只出差得最多的 图数 对（视频两边各解一遍太贵，不回头重解：边比边留缩小后的图，只留最差的那几张在内存里）。
// 退出码照 diff(1)：有一对按门槛判「变了」是 1，都没变 0。
import fs from 'node:fs';
import path from 'node:path';
import { listWorks } from '../环境/作品.ts';
import { lazyPassGate } from '../闸/闸.ts';
import { masterSize } from '../渲/设置.ts';
import { yuvToRgb, type BlockVerdict, type Threshold } from './比较.ts';
import { ratioText, rgbFrameDiff, worseFirst } from './帧差.ts';
import { frameStream } from './帧流.ts';
import { videoInfo } from '../渲/探测.ts';
import { analyzePair, identicalAnalysis, boxColors, diffPanel, edgeThreshold, encodePng, hotspotDirection, panelScale, type Hotspot, type PairAnalysis } from './对比.ts';
import { readPairs, type DiffPlan, type PairPlan } from './对比配对.ts';

export type DiffOptions = {
  outDir: string;
  threshold: Threshold;
  /** A、B 在说明里叫什么（--vs 时是两边的分支名） */
  aName: string;
  bName: string;
  hotspots?: number;
  zoom?: number;
  panelWidth?: number;
  gain?: number;
  maxImages?: number;
  /** 复查命令末尾加 --vs <它>（从 anim still --vs 来的：两边各渲一次望远再比） */
  vsTarget?: string;
  /** 复查命令出到的预览主题 */
  recheckTopic?: string;
  /** 视频没给 --offset 时先查两条是不是错开了几帧（probeVideoOffset） */
  probeOffset?: boolean;
  log?: (s: string) => void;
};

export type PairVerdict = BlockVerdict | '一样';
export type PairResult = { index: number; pair: PairPlan; error?: string; width?: number; height?: number; analysis?: PairAnalysis; verdict?: PairVerdict; image?: string; recheck?: string | null; recheckNote?: string };

const shellQuote = (s: string) => (/^[\p{L}\p{N}_@%+=:,./-]+$/u.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

const fmt = (n: number) => n.toFixed(1);
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

/** 原帧 x,y,宽 写成 --tele 认的一块 */
export const teleArg = (h: Hotspot) => `${h.tele.x},${h.tele.y},${h.tele.width}`;

/** 复查这一对的 anim still --tele 命令；定不出段、帧或不是原帧尺寸的返回 null 和原因 */
export const recheckCommand = (r: Pick<PairResult, 'pair' | 'width' | 'analysis'>, o: { topic: string; vsTarget?: string; trialEnv?: Record<string, string>; work?: string | null }): { command: string | null; note?: string } => {
  const hs = r.analysis?.hotspots ?? [];
  if (!hs.length) return { command: null };
  if (r.pair.variant) return { command: null, note: `这张是${r.pair.variant.includes('望远') ? '望远' : r.pair.variant.includes('光影') ? '光影试看' : '变体'}出的图（${r.pair.variant}），坐标不是原帧的，没有复查命令` };
  const [videoWidth] = masterSize('视频');
  const [previewWidth] = masterSize('预览');
  const level = r.width === videoWidth ? [] : r.width === previewWidth ? ['--level', '预览'] : null;
  if (!level) return { command: null, note: `宽 ${r.width} 既不是视频级（${videoWidth}）也不是预览级（${previewWidth}）的原帧，没有复查命令` };
  const seg = r.pair.segFrame?.segKey ?? '<段>';
  const frame = r.pair.segFrame ? String(r.pair.segFrame.frame) : '<帧>';
  const env = Object.entries(o.trialEnv ?? {}).map(([k, v]) => `${k}=${shellQuote(v)} `).join('');
  const cmd = ['anim', ...(o.work ? ['--work', shellQuote(o.work)] : []), 'still', r.pair.segFrame ? shellQuote(seg) : seg, frame, '--to-preview', shellQuote(o.topic), ...level, '--tele', shellQuote(hs.map(teleArg).join(';')), ...(o.vsTarget ? ['--vs', shellQuote(o.vsTarget)] : [])].join(' ');
  return { command: env + cmd, note: r.pair.segFrame ? undefined : `段、帧定不出来，要自己填${r.pair.frame !== null ? `（这是 B 的第 ${r.pair.frame} 帧）` : ''}` };
};

/** 这段在哪部作品（段/<段键>/，核对段在 核对/<去掉「核对-」的名>/）：只有一部有才算，复查命令带上 --work，换了当前作品也能直接跑 */
export const workOfSeg = (segKey: string): string | null => {
  try {
    const hits = [...listWorks()].filter(([, root]) => fs.existsSync(path.join(root, '段', segKey)) || (segKey.startsWith('核对-') && fs.existsSync(path.join(root, '核对', segKey.slice(3)))));
    return hits.length === 1 ? hits[0]![0] : null;
  } catch {
    return null;
  }
};

const hotspotLine = (h: Hotspot, n: number, t: Threshold) =>
  `${n}（${boxColors[(n - 1) % boxColors.length]!.name}框）${h.edge}×${h.edge} 块 (${h.x}, ${h.y}) 差 ${fmt(h.diff)}（门槛 ${edgeThreshold(t, h.edge)}，${h.ratio >= 1 ? `超 ${h.ratio.toFixed(2)} 倍` : `到门槛的 ${Math.round(h.ratio * 100)}%`}），${hotspotDirection(h)}：新−旧 RGB ${h.meanRgb.map(signed).join('/')}；望远 ${teleArg(h)}（${h.tele.width}×${Math.round(h.tele.height)}）`;

// 错帧自查：11-17 给用户来回切着看的两条视频错开了一帧，没人发现，逐帧比每帧都判「变了」。
// 只提醒不自动对齐：错帧本身可能就是要查的 bug（出片路径差一帧），自动对齐会把它藏掉。
// 在中段抽两帧，A 错开 −最多～+最多 帧各比一次 16×16 块差；最好的错开量比不错开小一半以上才报。
export const probeVideoOffset = async (plan: DiffPlan, threshold: Threshold, maxShift = 2): Promise<string | null> => {
  const v = plan.video!;
  const base = v.aFrames[0]! - v.frames[0]!;
  const count = Math.min(...[v.a, v.b].map((f) => videoInfo(f).frameCount));
  const probes = [0.4, 0.6].map((t) => Math.round(count * t)).filter((f) => f - maxShift + base >= 0 && f + maxShift + base < count);
  if (!probes.length) return null;
  const aFrames = [...new Set(probes.flatMap((f) => Array.from({ length: maxShift * 2 + 1 }, (_, i) => f + base + i - maxShift)))].sort((x, y) => x - y);
  const aRgb = new Map<number, Buffer>();
  for await (const y of frameStream(v.a, aFrames, v.width, v.height, { 格式: 'yuv420p' })) aRgb.set(aFrames[aRgb.size]!, yuvToRgb(y, v.width, v.height));
  const score = new Map<number, number>();
  let i = 0;
  for await (const y of frameStream(v.b, probes, v.width, v.height, { 格式: 'yuv420p' })) {
    const bRgb = yuvToRgb(y, v.width, v.height);
    for (let k = -maxShift; k <= maxShift; k++) {
      const d = rgbFrameDiff(bRgb, aRgb.get(probes[i]! + base + k)!, v.width, v.height, threshold).block[16].差;
      score.set(k, (score.get(k) ?? 0) + d);
    }
    i++;
  }
  const [bestK, bestS] = [...score].reduce((m, x) => (x[1] < m[1] ? x : m));
  const zero = score.get(0)!;
  if (bestK === 0 || bestS * 2 >= zero) return null;
  const n = probes.length;
  return `两条视频像是错开了 ${Math.abs(bestK)} 帧：在 B 的第 ${probes.join('、')} 帧上，A 再${bestK > 0 ? '往后' : '往前'}挪 ${Math.abs(bestK)} 帧时 16×16 块差 ${fmt(zero / n)} → ${fmt(bestS / n)}。确是起点不同就加 --offset ${base + bestK}；本该对齐的，先查出片是不是差了一帧`;
};

const verdictOf = (a: PairAnalysis): PairVerdict => (a.frame.over[0] === 0 ? '一样' : a.frame.verdict);

const imageName = (r: PairResult, width: number) => `${String(r.index).padStart(width, '0')}-${r.pair.label.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/（.*）$/, '')}-${r.verdict}.png`;

export const runDiff = async (plan: DiffPlan, o: DiffOptions): Promise<{ code: number; results: PairResult[] }> => {
  const log = o.log ?? ((s: string) => console.log(s));
  const maxImages = o.maxImages ?? 24;
  const numWidth = Math.max(2, String(plan.pairs.length).length);
  const results: PairResult[] = [];
  // 留着待写的并排图（缩小后的 rgb），只留最差的 图数 张
  const kept: { r: PairResult; panel: ReturnType<typeof diffPanel> }[] = [];
  if (plan.kind === '视频') await lazyPassGate()();
  if (plan.kind === '视频' && o.probeOffset) {
    const hint = await probeVideoOffset(plan, o.threshold);
    if (hint) {
      plan.notes.unshift(hint);
      log(`!! ${hint}`);
    }
  }
  let index = 0;
  let scale = 1;
  for await (const d of readPairs(plan)) {
    const r: PairResult = { index: ++index, pair: d.pair };
    results.push(r);
    if ('error' in d) {
      r.error = d.error;
      continue;
    }
    if ('identical' in d) {
      [r.width, r.height] = [d.identical.width, d.identical.height];
      r.analysis = identicalAnalysis(r.width, r.height, o.threshold);
      r.verdict = '一样';
      continue;
    }
    r.width = d.width;
    r.height = d.height;
    r.analysis = analyzePair(d.newRgb, d.oldRgb, d.width, d.height, o.threshold, { hotspots: o.hotspots, zoom: o.zoom });
    r.verdict = verdictOf(r.analysis);
    if (process.stderr.isTTY) process.stderr.write(`\r比到 ${index}/${plan.pairs.length}`);
    if (r.verdict === '一样' || maxImages <= 0) continue;
    const worst = kept.length >= maxImages ? kept.reduce((w, x) => (worseFirst(x.r.analysis!.frame, w.r.analysis!.frame) > 0 ? x : w)) : null;
    if (worst && worseFirst(r.analysis.frame, worst.r.analysis!.frame) >= 0) continue;
    const panel = diffPanel(d.newRgb, d.oldRgb, d.width, d.height, r.analysis.hotspots, { panelWidth: o.panelWidth, gain: o.gain });
    scale = panel.scale;
    if (worst) kept.splice(kept.indexOf(worst), 1);
    kept.push({ r, panel });
  }
  if (plan.pairs.length && process.stderr.isTTY) process.stderr.write('\n');
  fs.mkdirSync(o.outDir, { recursive: true });
  for (const { r, panel } of kept) {
    r.image = imageName(r, numWidth);
    fs.writeFileSync(path.join(o.outDir, r.image), encodePng(panel.rgb, panel.width, panel.height));
  }
  const topic = o.recheckTopic ?? '工作-复查';
  const works = new Map<string, string | null>();
  for (const r of results) {
    if (!r.analysis) continue;
    const segKey = r.pair.segFrame?.segKey;
    if (segKey && !works.has(segKey)) works.set(segKey, workOfSeg(segKey));
    const c = recheckCommand(r, { topic, vsTarget: o.vsTarget, trialEnv: plan.trialEnv?.b, work: segKey ? works.get(segKey) : null });
    r.recheck = c.command;
    r.recheckNote = c.note;
  }
  const changed = results.filter((r) => r.verdict === '变了').length;
  writeNote(plan, results, o, scale);
  printSummary(plan, results, o, log);
  log(`\n旧｜新｜差 并排图和 00-说明.md 在 ${o.outDir}`);
  return { code: changed ? 1 : 0, results };
};

const countText = (r: PairResult) => {
  const t = r.analysis!.tiles;
  return `${t[16].over}/${t[64].over}/${t[8].over}`;
};
const pixelText = (r: PairResult) => {
  const f = r.analysis!.frame;
  return `${ratioText(f.over[0], f.pixelCount)} / ${ratioText(f.over[8], f.pixelCount)} / ${ratioText(f.over[32], f.pixelCount)}`;
};

const tally = (results: PairResult[]) => {
  const c = new Map<string, number>();
  for (const r of results) c.set(r.verdict ?? '出错', (c.get(r.verdict ?? '出错') ?? 0) + 1);
  return ['变了', '看一眼', '容差内', '一样', '出错'].filter((k) => c.get(k)).map((k) => `${k} ${c.get(k)}`).join('，');
};

const printSummary = (plan: DiffPlan, results: PairResult[], o: DiffOptions, log: (s: string) => void) => {
  log(`\n${o.aName}（A，旧）→ ${o.bName}（B，新）：${results.length} 对，${tally(results)}`);
  log('编号 判     块差16×16  64×64  8×8   超门槛块16/64/8  差像素>0 / >8 / >32  最大差  对');
  for (const r of results) {
    const n = String(r.index).padStart(2, '0');
    if (!r.analysis) {
      log(`${n}  出错  ${r.error}  ${r.pair.label}`);
      continue;
    }
    const b = r.analysis.frame.block;
    log(`${n}  ${r.verdict!.padEnd(4, '　')} ${fmt(b[16].差).padStart(6)}  ${fmt(b[64].差).padStart(5)}  ${fmt(b[8].差).padStart(5)}  ${countText(r).padStart(12)}   ${pixelText(r)}  ${String(r.analysis.frame.maxDiff).padStart(4)}  ${r.pair.label}`);
  }
  const worst = results.filter((r) => r.analysis && r.verdict !== '一样').sort((x, y) => worseFirst(x.analysis!.frame, y.analysis!.frame)).slice(0, 5);
  if (worst.length) log(`\n最差的 ${worst.length} 对，差得最多的窗口（裁图放大不能当证据，照下面的命令原生复查）：`);
  for (const r of worst) {
    log(`${String(r.index).padStart(2, '0')} ${r.pair.label}（${r.verdict}）`);
    for (const [i, h] of r.analysis!.hotspots.entries()) log(`   ${hotspotLine(h, i + 1, o.threshold)}`);
    if (r.recheck) log(`   复查：${r.recheck}`);
    if (r.recheckNote) log(`   （${r.recheckNote}）`);
  }
  if (plan.onlyA.length || plan.onlyB.length) log(`\n没配上：只在 A ${plan.onlyA.length} 个${plan.onlyA.length ? `（${plan.onlyA.slice(0, 5).join('、')}${plan.onlyA.length > 5 ? '…' : ''}）` : ''}，只在 B ${plan.onlyB.length} 个${plan.onlyB.length ? `（${plan.onlyB.slice(0, 5).join('、')}${plan.onlyB.length > 5 ? '…' : ''}）` : ''}`);
  for (const n of plan.notes) log(`· ${n}`);
};

const writeNote = (plan: DiffPlan, results: PairResult[], o: DiffOptions, scale: number) => {
  const t = o.threshold;
  const gain = o.gain ?? 8;
  const first = results.find((r) => r.analysis);
  const totals = first ? `（整帧共 ${first.analysis!.tiles[16].total}/${first.analysis!.tiles[64].total}/${first.analysis!.tiles[8].total} 块）` : '';
  const source = plan.kind === '视频' ? `两个视频按帧号对齐抽了 ${plan.pairs.length} 帧（yuv420p 按固定公式换 RGB，和 anim verify 同一换法）` : `${plan.pairs.length} 对 PNG`;
  const lines = [
    `# 改前改后对比：${o.aName} → ${o.bName}`,
    '',
    `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC，\`anim diff\` 出的。${source}。`,
    '',
    `- A（旧）：\`${plan.video?.a ?? path.dirname(plan.pairs[0]?.aFile ?? '')}\``,
    `- B（新）：\`${plan.video?.b ?? path.dirname(plan.pairs[0]?.bFile ?? '')}\``,
    '',
    '## 怎么看',
    '',
    `- 每张图左旧、中新、右差，各缩到原来的 1/${scale}。差图带符号：**红是新的亮了，蓝是暗了，绿是亮度差不多但颜色变了**；颜色深浅 = 三个通道里最大的差 × ${gain}（差 ${Math.ceil(255 / gain)} 级就到顶），底是旧图亮度的 15%。缩小时每格取差最大的那个像素，零星的差不会被平均掉。`,
    `- 框是差得最多的几个窗口的望远框（框里的数字是名次，框色 ${boxColors.map((c, i) => `${i + 1} ${c.name}`).join('、')}），每对的复查命令在下面。**看细节照命令原生复查，不要拿并排图裁一块放大当证据。**`,
    `- 判法和 anim verify 同一套（\`verify/阈值.toml\`）：块平均差是 w×w 窗口里各通道「新 − 旧」的平均取绝对值、三通道取最大，取全帧最大的那块（级，0～255）。16×16 > ${t.block16Threshold}、64×64 > ${t.block64Threshold}、8×8 > ${t.block8Threshold} 任一条是「变了」；16×16 在 ${t.glanceThreshold}～${t.block16Threshold} 是「看一眼」；都不到是「容差内」；逐像素一样是「一样」。`,
    '- 「超门槛块」是把整帧按窗口边长铺成不重叠的块，块差超过那档门槛的有几块：看差是一小处还是一大片。',
    plan.kind === '视频' ? '- 两边都是压缩过的视频时，画面没改 16×16 也能到 8～9 级（压缩噪声，见 `docs/决策/0013-认指纹.md`），64×64 在 2.4 以下；看一眼、容差内的多半是噪声。' : '',
    '',
    '## 汇总',
    '',
    `| 编号 | 对 | 判 | 块差 16×16 | 64×64 | 8×8 | 超门槛块 16/64/8${totals} | 差像素 >0 / >8 / >32 | 最大差 | 图 |`,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      if (!r.analysis) return `| ${r.index} | ${r.pair.label} | 出错 | ${r.error} | | | | | | |`;
      const b = r.analysis.frame.block;
      return `| ${r.index} | ${r.pair.label} | ${r.verdict} | ${fmt(b[16].差)} | ${fmt(b[64].差)} | ${fmt(b[8].差)} | ${countText(r)} | ${pixelText(r)} | ${r.analysis.frame.maxDiff} | ${r.image ? '有' : r.verdict === '一样' ? '' : '没出（不在最差的几对里）'} |`;
    }),
    '',
    `一共 ${results.length} 对：${tally(results)}。`,
    '',
    '## 每对差得最多的窗口',
    '',
    ...results
      .filter((r) => r.analysis && r.verdict !== '一样')
      .flatMap((r) => [
        `### ${r.index}. ${r.pair.label}（${r.verdict}）`,
        '',
        ...(r.image ? [`![${r.pair.label}](${r.image})`, ''] : []),
        ...r.analysis!.hotspots.map((h, i) => `${i + 1}. ${hotspotLine(h, i + 1, t).replace(/^\d+/, '')}`),
        '',
        ...(r.recheck ? ['复查：', '', '```', r.recheck, '```', ''] : []),
        ...(r.recheckNote ? [`（${r.recheckNote}）`, ''] : []),
      ]),
    ...(plan.onlyA.length || plan.onlyB.length ? ['## 没配上', '', ...plan.onlyA.map((n) => `- 只在 A：${n}`), ...plan.onlyB.map((n) => `- 只在 B：${n}`), ''] : []),
    ...(plan.notes.length ? ['## 备注', '', ...plan.notes.map((n) => `- ${n}`), ''] : []),
    '你的回复：',
    '',
  ];
  fs.writeFileSync(path.join(o.outDir, '00-说明.md'), lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'), 'utf8');
};
