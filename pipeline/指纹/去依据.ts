// 分镜、时间线每个时刻的 依据 是写给人看的说明（为什么放在这一刻），画面和声音都不读（anim check 的 依据只透传 守着），改它不算内容变化（用户 10-31 定）。
// 只在算模块哈希前，从规范化文本里去掉：真正打进包的代码不动。认形状不认名字，同名字段在别的结构里不吃：
//   事件  { 在: { 时刻 }, 依据: 字面量 }（只有这两个键）
//   段窗  { 键或名, 起?, 止, 依据: 字面量 }（engine/段/时间线.ts 的 串段定义、分镜.ts 的 排段）
// 依据要是字面量：拼出来、引变量的留着（表达式可能有副作用，也可能引别的模块）。对象重写成单行：说明太长、换行与否也不影响哈希。
// esbuild 规范化后对象字面量里的注释还留着（分镜表里各事件之间写满了注释，10-31 查 12 个提交里 3 个只改了这种注释）。有这种条目的模块顺手把注释也去掉；
// 别的模块不动：全仓库一起去，所有带这种注释的模块哈希都变，全片白白过期。
import ts from 'typescript';
import type { BaseMoment, EventDef, SeriesSegDef, WindowEnd } from '../../engine/段/时间线.ts';
import type { SongMoment } from '../../engine/段/歌网格.ts';

// 认形状用的键从类型取，不写死：字段改名、加减键时 tsc 逼着这里跟上。
// 分镜.ts 的写法（作品/把回忆拼好给你/分镜/时间.ts）pipeline 不引（只认作品的纯模块）：它的时刻、事件、段窗的键在不在这里认的形状里，由 去依据.test.ts 拿作品的类型核。
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
/** 联合类型各支的键合起来，一个键一项；少写、多写、写错都编译不过 */
export type KeyTable<T> = { readonly [K in keyof UnionToIntersection<T>]-?: true };
const timeKeyTable: KeyTable<BaseMoment | SongMoment> = { sec: true, frame: true, after: true, addSec: true, addFrames: true, beat: true, measure: true, 句: true, points: true };
/** 分镜.ts 的段窗用 键，串段定义用 名 */
export const segKeyField = 'key';
const segWindowKeyTable = { ...({ name: true, start: true, end: true, basis: true } satisfies KeyTable<SeriesSegDef>), [segKeyField]: true };
const frameCountEndKeyTable: KeyTable<Exclude<WindowEnd, BaseMoment | string>> = { frameCount: true };
export const basisKey = 'basis' satisfies keyof EventDef & keyof SeriesSegDef;
export const atKey = '在' satisfies keyof EventDef;
const segNameKey: keyof SeriesSegDef = 'name';
export const startKey = 'start' satisfies keyof SeriesSegDef;
export const endKey = 'end' satisfies keyof SeriesSegDef;
export const timeKeys = new Set(Object.keys(timeKeyTable));
export const segWindowKeys = new Set(Object.keys(segWindowKeyTable));
const frameCountEndKey = new Set(Object.keys(frameCountEndKeyTable));

const keyName = (p: ts.ObjectLiteralElementLike) => (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** 全是普通的 键: 值，键都在 允许 里 */
const allKeysIn = (o: ts.ObjectLiteralExpression, allowedKeys: Set<string>) => o.properties.every((p) => keyName(p) !== null && allowedKeys.has(keyName(p)!));
const isTimeObject = (n: ts.Expression) => ts.isObjectLiteralExpression(n) && n.properties.length > 0 && allKeysIn(n, timeKeys);
const getPropValue = (o: ts.ObjectLiteralExpression, propKey: string) => o.properties.find((p): p is ts.PropertyAssignment => keyName(p) === propKey)?.initializer;

const isTimeEntry = (o: ts.ObjectLiteralExpression): boolean => {
  const basis = getPropValue(o, basisKey);
  if (!basis || !ts.isStringLiteralLike(basis)) return false;
  const keys = o.properties.map(keyName);
  if (keys.length === 2 && getPropValue(o, atKey) && isTimeObject(getPropValue(o, atKey)!)) return true;
  if (!allKeysIn(o, segWindowKeys) || !(getPropValue(o, segKeyField) || getPropValue(o, segNameKey)) || new Set(keys).size !== keys.length) return false;
  const end = getPropValue(o, endKey);
  const start = getPropValue(o, startKey);
  if (!end || (start && !isTimeObject(start))) return false;
  return ts.isStringLiteralLike(end) || isTimeObject(end) || (ts.isObjectLiteralExpression(end) && allKeysIn(end, frameCountEndKey));
};

/** 文本里的注释区间。每个 token 前后都问一遍，不靠扫描器猜正则和除号 */
const commentRanges = (sf: ts.SourceFile): [number, number][] => {
  const sourceText = sf.text;
  const commentEnds = new Map<number, number>();
  const addRange = (rs?: ts.CommentRange[]) => rs?.forEach((r) => commentEnds.set(r.pos, r.end));
  const visit = (n: ts.Node) => {
    addRange(ts.getLeadingCommentRanges(sourceText, n.pos));
    addRange(ts.getTrailingCommentRanges(sourceText, n.pos));
    addRange(ts.getTrailingCommentRanges(sourceText, n.end));
    n.getChildren(sf).forEach(visit);
  };
  visit(sf);
  return [...commentEnds].sort((a, b) => a[0] - b[0]);
};

/** 注释独占一行就连这一行一起去，行尾注释连前面的空白：注释从两行改成一行不留下空行差别 */
const absorbTrailingSpace = (sourceText: string, startIndex: number, end: number) => {
  let a = startIndex;
  while (a > 0 && (sourceText[a - 1] === ' ' || sourceText[a - 1] === '\t')) a--;
  let b = end;
  while (sourceText[b] === ' ' || sourceText[b] === '\t') b++;
  const atLineEnd = b === sourceText.length || sourceText[b] === '\n';
  if (!atLineEnd) return { start: startIndex, end: end };
  return a === 0 || sourceText[a - 1] === '\n' ? { start: a, end: Math.min(b + 1, sourceText.length) } : { start: a, end: b };
};

export const stripBasis = (sourceText: string): string => {
  if (!sourceText.includes(basisKey)) return sourceText;
  const sf = ts.createSourceFile('模块.js', sourceText, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const edits: { start: number; end: number; 新: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n) && isTimeEntry(n)) {
      const kept = n.properties.filter((p) => keyName(p) !== basisKey).map((p) => p.getText(sf));
      edits.push({ start: n.getStart(sf), end: n.getEnd(), 新: `{ ${kept.join(', ')} }` });
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) return sourceText;
  for (const [startIndex, end] of commentRanges(sf)) if (!edits.some((r) => startIndex >= r.start && end <= r.end)) edits.push({ ...absorbTrailingSpace(sourceText, startIndex, end), 新: '' });
  edits.sort((a, b) => b.start - a.start);
  let out = sourceText;
  for (const r of edits) out = out.slice(0, r.start) + r.新 + out.slice(r.end);
  return out;
};
