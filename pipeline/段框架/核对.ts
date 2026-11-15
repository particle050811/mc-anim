// anim check 的 加载 规则调这里：段框架的段，生成的声音表、声音地址要和 段.ts 现在的 cue 对得上（不量音频，数取锁里的、缓存的或盘上表里的）；
// continueOldSeg 做的场时间线抄的老段段长要和老段对得上。
import type { CheckReport, CheckContext } from '../检查/上下文.ts';
import type { SegItem } from '../检查/内容.ts';
import { isFrameworkSeg } from '../../engine/段/窗口段.ts';
import { checkOldSeg } from '../../engine/段/老段接续.ts';
import { checkSeg, type LineRow } from './生成.ts';
import { knownAudioMeasure } from './音频数.ts';

/** continueOldSeg 手给的起秒：老段按清单顺序摆，后一段不能起在前一段的止秒之前（跳过一截可以，重叠是抄错了），顺序要和清单一样。放这里不放 engine 的 checkOldSeg：engine 进指纹 */
export const checkLegacySegStartSec = (legacySegs: readonly { 键: string; startSec: number; 秒: number }[], manifestOrder: readonly string[]): string[] => {
  const issues: string[] = [];
  const listIndexes = legacySegs.map((x) => manifestOrder.indexOf(x.键)).filter((i) => i >= 0);
  if (listIndexes.some((i, k) => k > 0 && i < listIndexes[k - 1]!)) issues.push(`老段的顺序和清单不一样：${legacySegs.map((x) => x.键).join('、')}`);
  legacySegs.forEach((x, k) => {
    const prevOldSeg = legacySegs[k - 1];
    if (prevOldSeg && x.startSec < prevOldSeg.startSec + prevOldSeg.秒 - 1e-6) issues.push(`老段 ${x.键} 起在第 ${x.startSec} 秒，和 ${prevOldSeg.键}（止于第 ${prevOldSeg.startSec + prevOldSeg.秒} 秒）重叠`);
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
    const segModule = r.模块?.default as Parameters<typeof checkOldSeg>[0] | undefined;
    if (!segModule || !Array.isArray(segModule.legacySegs)) continue; // 加载失败由 加载 规则报
    for (const x of checkOldSeg(segModule, (k) => segments.find((s) => s.键 === k)?.definition)) report.错(`${p}：${x}`, p);
    for (const x of checkLegacySegStartSec(segModule.legacySegs, segments.map((s) => s.键))) report.错(`${p}：${x}`, p);
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
    lineTable = ((c.readToml(c.workPath('台词.toml'))?.['台词'] ?? []) as LineRow[]);
  } catch {
    // 台词.toml 解析失败由 台词 规则报
  }
  const filmSegments = segments.filter((s) => s.章 !== '核对');
  for (const s of frameworkSegs) {
    const i = filmSegments.indexOf(s);
    const prevSeg = async () => (i > 0 ? filmSegments[i - 1]!.definition : undefined);
    const issues = await checkSeg(s.definition!, c.absPath(s.目录), c.根, { assetLock, lineTable, getMeasure: (id) => knownAudioMeasure(assetLock[id], c.dataRoot), prevSeg });
    for (const x of issues) report.错(`${s.键}：${x}`, s.段文件);
  }
  report.infoLines.push(`段框架的段 ${frameworkSegs.length} 个，生成的声音表、声音地址都核对过`);
};
