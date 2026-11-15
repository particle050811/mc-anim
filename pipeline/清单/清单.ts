// pipeline 这边看段：按所选作品的 清单.ts 的顺序读各段的 段.ts（纯数据），以及选择器（anim film、verify 等的范围）。
// 选择器全字匹配：段键、段名、编号、场键、章，都对不上才当章的范围（6-7）；可以写成带作品的全名（<作品>/<段键>），作品要是所选的那部。几个选择器取并集，结果按清单顺序。
import path from 'node:path';
import '../环境/别名注册.ts';
import { pathToFileURL } from 'node:url';
import type { ManifestEntry } from '../../engine/段/清单条目.ts';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import { splitFullName, workName, workRoot } from '../环境/作品.ts';

export type SegInfo = ManifestEntry & { 编号: string | null; segmentName: string; 目录: string; 画面: string; 段文件: string; 段: SegmentDef };

const readSegFile = async (file: string): Promise<SegmentDef> => {
  const m = (await import(pathToFileURL(file).href)) as { default?: SegmentDef };
  if (!m.default) throw new Error(`${file} 没有 export default 定义段(...)`);
  return m.default;
};

type WorkManifest = { manifest: readonly ManifestEntry[]; segDir: (segKey: string) => string; segmentName: (t: ManifestEntry) => string; segmentCode: (segKey: string) => string | null };

export const loadAllSegments = async (): Promise<SegInfo[]> => {
  const workDir = workRoot();
  const { manifest, segDir, segmentName, segmentCode } = (await import(pathToFileURL(path.join(workDir, '清单.ts')).href)) as WorkManifest;
  return Promise.all(
    manifest.map(async (t) => {
      const absSegDir = path.join(workDir, ...segDir(t.键).split('/'));
      const segFile = path.join(absSegDir, '段.ts');
      return { ...t, 编号: segmentCode(t.键), segmentName: segmentName(t), 目录: absSegDir, 段文件: segFile, 画面: path.join(absSegDir, '画面.tsx'), 段: await readSegFile(segFile) };
    }),
  );
};

const isOtherWork = (selector: string) => {
  const selectorWork = splitFullName(selector).作品;
  return selectorWork !== undefined && selectorWork.normalize('NFC').toLowerCase() !== workName().toLowerCase();
};

const exactMatch = (s: SegInfo, selectorKey: string) => [s.键, s.segmentName, s.编号, s.段.场, String(s.章)].includes(selectorKey);

const inChapterRange = (s: SegInfo, rangeKey: string) => {
  const rangeMatch = /^(\d+)-(\d+)$/.exec(rangeKey);
  return !!rangeMatch && typeof s.章 === 'number' && s.章 >= Number(rangeMatch[1]) && s.章 <= Number(rangeMatch[2]);
};

/**
 * 一个选择器选中的段（按 全 的顺序）：先全字匹配段键、段名、编号、场键、章，一段都对不上才当章范围。
 * 编号（6-01、7-08）也长成「数字-数字」，先当章范围的话 6-01 成了 6～1 章、7-08 成了整两章。
 */
export const matchSelector = (segments: readonly SegInfo[], selector: string): SegInfo[] => {
  if (isOtherWork(selector)) return [];
  const segKey = splitFullName(selector).键;
  const exactMatches = segments.filter((s) => exactMatch(s, segKey));
  return exactMatches.length ? exactMatches : segments.filter((s) => inChapterRange(s, segKey));
};

export const selectSegs = async (selectors: readonly string[]): Promise<SegInfo[]> => {
  const allSegments = await loadAllSegments();
  const otherWorks = selectors.filter(isOtherWork);
  if (otherWorks.length) throw new Error(`${otherWorks.join('、')} 不是现在选的作品「${workName()}」的段（一次只处理一部作品，换作品用 --work）`);
  const perSelector = selectors.map((x) => matchSelector(allSegments, x));
  const unmatched = selectors.filter((_, i) => !perSelector[i]!.length);
  if (unmatched.length) throw new Error(`选择器没对上任何段：${unmatched.join('、')}（能用段键、段名、编号、场键、章或 6-7 这样的章范围；清单里有：${allSegments.map((s) => s.键).join('、')}）`);
  const wanted = new Set(perSelector.flat());
  return allSegments.filter((s) => wanted.has(s));
};
