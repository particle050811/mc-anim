// anim check 的 加载 规则调这里：段框架的段，生成的声音表、声音地址要和 段.ts 现在的 cue 对得上（不量音频，数取锁里的、缓存的或盘上表里的）；
// continueOldSeg 做的场时间线抄的老段段长要和老段对得上。
import type { CheckReport, CheckContext } from '../源码/上下文.ts';
import type { SegItem } from '../源码/内容.ts';
import { isFrameworkSeg } from '../../engine/段/窗口段.ts';
import { checkOldSeg } from '../../engine/段/老段接续.ts';
import { checkSeg, type LineRow } from './生成.ts';
import { knownAudioMeasure } from './音频数.ts';
import { checkSoundSeams, parseSeamBaseline, seamBaselineFile } from './声音接缝.ts';
import { segDurSec, type AssetCue } from '../../engine/段/段定义.ts';

/** continueOldSeg 手给的起秒：老段按清单顺序摆，后一段不能起在前一段的止秒之前（跳过一截可以，重叠是抄错了），顺序要和清单一样。放这里不放 engine 的 checkOldSeg：engine 进指纹 */
export const checkLegacySegStartSec = (legacySegs: readonly { key: string; startSec: number; sec: number }[], manifestOrder: readonly string[]): string[] => {
  const issues: string[] = [];
  const listIndexes = legacySegs.map((x) => manifestOrder.indexOf(x.key)).filter((i) => i >= 0);
  if (listIndexes.some((i, k) => k > 0 && i < listIndexes[k - 1]!)) issues.push(`老段的顺序和清单不一样：${legacySegs.map((x) => x.key).join('、')}`);
  legacySegs.forEach((x, k) => {
    const prevOldSeg = legacySegs[k - 1];
    if (prevOldSeg && x.startSec < prevOldSeg.startSec + prevOldSeg.sec - 1e-6) issues.push(`老段 ${x.key} 起在第 ${x.startSec} 秒，和 ${prevOldSeg.key}（止于第 ${prevOldSeg.startSec + prevOldSeg.sec} 秒）重叠`);
  });
  return issues;
};

/** 场时间线文件是不是 continueOldSeg 做的（按源码认，命名改英文时这里漏改过一次，单测守着） */
export const usesContinueOldSeg = (source: string) => /\bcontinueOldSeg\(/.test(source);

/** continueOldSeg 做的场时间线（场/<场键>/时间线.ts）：抄的老段段长、场、画幅要和老段的 段.ts 对得上（老段不改，对不上多半是手改了时间线），起秒不重叠 */
export const checkLegacySegContinuity = async (c: CheckContext, report: CheckReport, segments: readonly SegItem[]) => {
  const timelineFiles = c.workFiles().filter((p) => p.startsWith(c.workPath('场/')) && /\/场\/[^/]+\/时间线\.ts$/.test(p) && usesContinueOldSeg(c.读(p)));
  for (const p of timelineFiles) {
    const r = await c.loadModule(p);
    const segModule = r.modules?.default as Parameters<typeof checkOldSeg>[0] | undefined;
    if (!segModule || !Array.isArray(segModule.legacySegs)) continue; // 加载失败由 加载 规则报
    for (const x of checkOldSeg(segModule, (k) => segments.find((s) => s.key === k)?.definition)) report.错(`${p}：${x}`, p);
    for (const x of checkLegacySegStartSec(segModule.legacySegs, segments.map((s) => s.key))) report.错(`${p}：${x}`, p);
  }
  if (timelineFiles.length) report.infoLines.push(`continueOldSeg 的场时间线 ${timelineFiles.length} 条，抄的老段段长和 段.ts 核对了`);
};

export const checkSegFramework = async (c: CheckContext, report: CheckReport, segments: readonly SegItem[]) => {
  await checkLegacySegContinuity(c, report, segments);
  const frameworkSegs = segments.filter((s) => s.definition && isFrameworkSeg(s.definition));
  if (!frameworkSegs.length) return;
  const lockPair = c.assetLocks();
  const assetLock = { ...lockPair.共用, ...lockPair.作品 };
  let lineTable: LineRow[] = [];
  try {
    lineTable = ((c.readToml(c.workPath('台词.toml'))?.['lines'] ?? []) as LineRow[]);
  } catch {
    // 台词.toml 解析失败由 台词 规则报
  }
  const filmSegments = segments.filter((s) => s.章 !== '核对');
  for (const s of frameworkSegs) {
    const i = filmSegments.indexOf(s);
    const prevSeg = async () => (i > 0 ? filmSegments[i - 1]!.definition : undefined);
    const issues = await checkSeg(s.definition!, c.absPath(s.目录), c.root, { assetLock, lineTable, getMeasure: (id) => knownAudioMeasure(assetLock[id], c.dataRoot), prevSeg });
    for (const x of issues) report.错(`${s.key}：${x}`, s.segmentFile);
  }
  report.infoLines.push(`段框架的段 ${frameworkSegs.length} 个，生成的声音表、声音地址都核对过`);
  // 声音接缝按成片顺序走：老段（没有 cue 的）照样占位，免得把隔着老段的两段当成相邻
  const seamSegs = filmSegments.filter((s) => s.definition).map((s) => ({ key: s.key, durSec: segDurSec(s.definition!), cues: (s.definition!.sound ?? []).filter((x): x is AssetCue => !x.lines) }));
  const seamIssues = checkSoundSeams(seamSegs, (id) => knownAudioMeasure(assetLock[id], c.dataRoot));
  const baselinePath = c.workPath(seamBaselineFile);
  const baseline = c.exists(baselinePath) ? parseSeamBaseline(c.读(baselinePath)) : new Set<string>();
  const fresh = seamIssues.filter((x) => !baseline.has(x.baselineKey));
  for (const x of fresh) report.错(`声音接缝：${x.text}`, c.workPath('清单.ts'));
  const stale = [...baseline].filter((k) => !seamIssues.some((x) => x.baselineKey === k));
  for (const k of stale) report.notice(`声音接缝：基线里的「${k.replaceAll('\t', ' ')}」已经没有了，从 ${seamBaselineFile} 删掉这行`, baselinePath);
  report.infoLines.push(`声音接缝：${seamSegs.length} 段按成片顺序核了段缝上的音效、配乐${seamIssues.length ? `，基线放行 ${seamIssues.length - fresh.length} 处` : ''}`);
};
