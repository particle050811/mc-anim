// 分镜、时间线每个时刻的 依据 是写给人看的说明（为什么放在这一刻），画面和声音都不读（anim check 的 依据只透传 守着），改它不算内容变化（用户 10-31 定）。
// 只在算模块哈希前，从规范化文本里去掉：真正打进包的代码不动。认形状不认名字，同名字段在别的结构里不吃：
//   事件  { 在: { 时刻 }, 依据: 字面量 }（只有这两个键）
//   段窗  { 键或名, 起?, 止, 依据: 字面量 }（engine/段/时间线.ts 的 串段定义、分镜.ts 的 排段）
// 依据要是字面量：拼出来、引变量的留着（表达式可能有副作用，也可能引别的模块）。对象重写成单行：说明太长、换行与否也不影响哈希。
// esbuild 规范化后对象字面量里的注释还留着（分镜表里各事件之间写满了注释，10-31 查 12 个提交里 3 个只改了这种注释）。有这种条目的模块顺手把注释也去掉；
// 别的模块不动：全仓库一起去，所有带这种注释的模块哈希都变，全片白白过期。
import ts from 'typescript';

const 依据键 = '依据';
const 时刻键 = new Set(['秒', '帧', '拍', '小节', '句', '点', '接', '加秒', '加帧']);
const 段窗键 = new Set(['键', '名', '起', '止', 依据键]);

const 键名 = (p: ts.ObjectLiteralElementLike) => (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** 全是普通的 键: 值，键都在 允许 里 */
const 全在 = (o: ts.ObjectLiteralExpression, 允许: Set<string>) => o.properties.every((p) => 键名(p) !== null && 允许.has(键名(p)!));
const 是时刻 = (n: ts.Expression) => ts.isObjectLiteralExpression(n) && n.properties.length > 0 && 全在(n, 时刻键);
const 值 = (o: ts.ObjectLiteralExpression, 键: string) => o.properties.find((p): p is ts.PropertyAssignment => 键名(p) === 键)?.initializer;

const 是时刻条目 = (o: ts.ObjectLiteralExpression): boolean => {
  const 依据 = 值(o, 依据键);
  if (!依据 || !ts.isStringLiteralLike(依据)) return false;
  const 名们 = o.properties.map(键名);
  if (名们.length === 2 && 值(o, '在') && 是时刻(值(o, '在')!)) return true;
  if (!全在(o, 段窗键) || !(值(o, '键') || 值(o, '名')) || new Set(名们).size !== 名们.length) return false;
  const 止 = 值(o, '止');
  const 起 = 值(o, '起');
  if (!止 || (起 && !是时刻(起))) return false;
  return ts.isStringLiteralLike(止) || 是时刻(止) || (ts.isObjectLiteralExpression(止) && 全在(止, new Set(['帧数'])));
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
