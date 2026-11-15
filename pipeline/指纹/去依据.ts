// 分镜、时间线每个时刻的 依据 是写给人看的说明（为什么放在这一刻），画面和声音都不读（anim check 的 依据只透传 守着），改它不算内容变化（用户 10-31 定）。
// 只在算模块哈希前，从规范化文本里去掉：真正打进包的代码不动。认形状不认名字，同名字段在别的结构里不吃：
//   事件  { 在: { 时刻 }, 依据: 字面量 }（只有这两个键）
//   段窗  { 键或名, 起?, 止, 依据: 字面量 }（engine/段/时间线.ts 的 串段定义、分镜.ts 的 排段）
// 依据要是字面量：拼出来、引变量的留着（表达式可能有副作用，也可能引别的模块）。对象重写成单行：说明太长、换行与否也不影响哈希。
// esbuild 规范化后对象字面量里的注释还留着（分镜表里各事件之间写满了注释，10-31 查 12 个提交里 3 个只改了这种注释）。有这种条目的模块顺手把注释也去掉；
// 别的模块不动：全仓库一起去，所有带这种注释的模块哈希都变，全片白白过期。
import ts from 'typescript';
import type { 基本时刻, 事件定义, 串段定义, 窗口止 } from '../../engine/段/时间线.ts';
import type { 歌时刻 } from '../../engine/段/歌网格.ts';
import type { 时刻 as 分镜时刻, 事件定义 as 分镜事件定义, 段窗口定义 as 分镜段窗 } from '../../作品/把回忆拼好给你/分镜/时间.ts';

// 认形状用的键从类型取，不写死：字段改名、加减键时 tsc 逼着这里跟上，改名工具（pipeline/改名）也会把这里的键并进字段那一组
type 并<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
/** 联合类型各支的键合起来，一个键一项；少写、多写、写错都编译不过 */
type 键表<T> = { readonly [K in keyof 并<T>]-?: true };
const 时刻键表: 键表<基本时刻 | 歌时刻 | 分镜时刻> = { 秒: true, 帧: true, 接: true, 加秒: true, 加帧: true, 拍: true, 小节: true, 句: true, 点: true };
const 段窗键表: 键表<串段定义 | 分镜段窗> = { 名: true, 键: true, 起: true, 止: true, 依据: true };
const 帧数止键表: 键表<Exclude<窗口止, 基本时刻 | string>> = { 帧数: true };
export const 依据键: keyof 事件定义 & keyof 分镜事件定义 & keyof 串段定义 = '依据';
const 在键: keyof 事件定义 & keyof 分镜事件定义 = '在';
const 段键键: keyof 分镜段窗 = '键';
const 段名键: keyof 串段定义 = '名';
const 起键: keyof 串段定义 & keyof 分镜段窗 = '起';
const 止键: keyof 串段定义 & keyof 分镜段窗 = '止';
const 时刻键 = new Set(Object.keys(时刻键表));
const 段窗键 = new Set(Object.keys(段窗键表));
const 帧数止键 = new Set(Object.keys(帧数止键表));

const 键名 = (p: ts.ObjectLiteralElementLike) => (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** 全是普通的 键: 值，键都在 允许 里 */
const 全在 = (o: ts.ObjectLiteralExpression, 允许: Set<string>) => o.properties.every((p) => 键名(p) !== null && 允许.has(键名(p)!));
const 是时刻 = (n: ts.Expression) => ts.isObjectLiteralExpression(n) && n.properties.length > 0 && 全在(n, 时刻键);
const 值 = (o: ts.ObjectLiteralExpression, 键: string) => o.properties.find((p): p is ts.PropertyAssignment => 键名(p) === 键)?.initializer;

const 是时刻条目 = (o: ts.ObjectLiteralExpression): boolean => {
  const 依据 = 值(o, 依据键);
  if (!依据 || !ts.isStringLiteralLike(依据)) return false;
  const 名们 = o.properties.map(键名);
  if (名们.length === 2 && 值(o, 在键) && 是时刻(值(o, 在键)!)) return true;
  if (!全在(o, 段窗键) || !(值(o, 段键键) || 值(o, 段名键)) || new Set(名们).size !== 名们.length) return false;
  const 止 = 值(o, 止键);
  const 起 = 值(o, 起键);
  if (!止 || (起 && !是时刻(起))) return false;
  return ts.isStringLiteralLike(止) || 是时刻(止) || (ts.isObjectLiteralExpression(止) && 全在(止, 帧数止键));
};

/** 文本里的注释区间。每个 token 前后都问一遍，不靠扫描器猜正则和除号 */
const 注释区间 = (sf: ts.SourceFile): [number, number][] => {
  const 文本 = sf.text;
  const 区 = new Map<number, number>();
  const 记 = (rs?: ts.CommentRange[]) => rs?.forEach((r) => 区.set(r.pos, r.end));
  const 走 = (n: ts.Node) => {
    记(ts.getLeadingCommentRanges(文本, n.pos));
    记(ts.getTrailingCommentRanges(文本, n.pos));
    记(ts.getTrailingCommentRanges(文本, n.end));
    n.getChildren(sf).forEach(走);
  };
  走(sf);
  return [...区].sort((a, b) => a[0] - b[0]);
};

/** 注释独占一行就连这一行一起去，行尾注释连前面的空白：注释从两行改成一行不留下空行差别 */
const 连行尾空白 = (文本: string, 起: number, 止: number) => {
  let a = 起;
  while (a > 0 && (文本[a - 1] === ' ' || 文本[a - 1] === '\t')) a--;
  let b = 止;
  while (文本[b] === ' ' || 文本[b] === '\t') b++;
  const 到行尾 = b === 文本.length || 文本[b] === '\n';
  if (!到行尾) return { 起, 止 };
  return a === 0 || 文本[a - 1] === '\n' ? { 起: a, 止: Math.min(b + 1, 文本.length) } : { 起: a, 止: b };
};

export const 去依据 = (文本: string): string => {
  if (!文本.includes(依据键)) return 文本;
  const sf = ts.createSourceFile('模块.js', 文本, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const 换: { 起: number; 止: number; 新: string }[] = [];
  const 走 = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n) && 是时刻条目(n)) {
      const 留 = n.properties.filter((p) => 键名(p) !== 依据键).map((p) => p.getText(sf));
      换.push({ 起: n.getStart(sf), 止: n.getEnd(), 新: `{ ${留.join(', ')} }` });
      return;
    }
    ts.forEachChild(n, 走);
  };
  走(sf);
  if (!换.length) return 文本;
  for (const [起, 止] of 注释区间(sf)) if (!换.some((r) => 起 >= r.起 && 止 <= r.止)) 换.push({ ...连行尾空白(文本, 起, 止), 新: '' });
  换.sort((a, b) => b.起 - a.起);
  let out = 文本;
  for (const r of 换) out = out.slice(0, r.起) + r.新 + out.slice(r.止);
  return out;
};
