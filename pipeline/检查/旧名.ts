// 作品/<名>/旧名.tsv：类别、旧名、新键、备注四列。旧名永不复用：新段键、段名、场键、台词 id 不能等于表里的旧名，除非那一行的新键就是它自己（docs/命名.md）。
// 没有旧名表的作品（新作品没改过名）不查。
import type { CheckReport, CheckContext } from '../源码/上下文.ts';

export const oldNameKinds = ['场号', '段号', 'Composition', '拍号', '段名', '台词', '已删段', '已删台词'] as const;
export type OldNameRow = { category: string; oldName: string; newKey: string; remark: string; 行: number };

export const oldNameTablePath = (c: CheckContext) => c.workPath('旧名.tsv');

export const readOldNames = (c: CheckContext, report?: CheckReport): OldNameRow[] => {
  const path = oldNameTablePath(c);
  if (!c.exists(path)) {
    report?.skipped.push(`没有 ${path}，不查旧名`);
    return [];
  }
  const lines = c.读(path).split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== '类别\t旧名\t新键\t备注') report?.错('表头要是「类别\\t旧名\\t新键\\t备注」', path, 1);
  const r: OldNameRow[] = [];
  lines.slice(1).forEach((l, i) => {
    const cols = l.split('\t');
    const lineNo = i + 2;
    if (cols.length !== 4) return report?.错(`要正好 4 列，这行 ${cols.length} 列`, path, lineNo);
    const [category, oldName, newKey, note] = cols as [string, string, string, string];
    if (!(oldNameKinds as readonly string[]).includes(category)) report?.错(`类别「${category}」不认识（能用：${oldNameKinds.join('、')}）`, path, lineNo);
    if (!oldName) report?.错('旧名是空的', path, lineNo);
    if (!newKey && !category.startsWith('已删')) report?.错(`${category} 要写新键（删掉的用 已删段、已删台词）`, path, lineNo);
    r.push({ category: category, oldName, newKey, remark: note, 行: lineNo });
  });
  return r;
};

/** 名字撞了哪些旧名（那一行的新键就是它自己的不算） */
export const findOldNameClashes = (oldNameRows: OldNameRow[], oldName: string, newKey = oldName) => oldNameRows.filter((x) => x.oldName === oldName && x.newKey !== newKey);

/** 段名撞了哪些旧段名（段名、已删段两类，按去掉「<章>-」的名字比） */
export const findOldSegNameClashes = (oldNameRows: OldNameRow[], segmentName: string, segKey: string) =>
  oldNameRows.filter((x) => (x.category === '段名' || x.category === '已删段') && x.oldName.replace(/^\d+-/, '') === segmentName && x.newKey !== segKey);
