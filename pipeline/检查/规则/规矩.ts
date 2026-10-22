// 规矩：rules/规矩.toml 的格式；代码里每个 例外('规矩id', 值, {段|场, 原因}) 都在表里那条规矩的 例外 里登记过、值对得上，
// 表里登记的例外代码里也都找得到（段或场还没搬进来的算待迁移）；默认值的落点（<路径> [符号、符号…]）文件和符号都在。
// 落点以「旧:」或「待迁移:」开头的是还在旧项目里的，算待迁移，搬完改成新路径。
import fs from 'node:fs';
import path from 'node:path';
import { 读内容 } from '../内容.ts';
import { 代码后缀, 是渲染代码, type 报告, type 检查上下文 } from '../上下文.ts';
import { 声明的名字, 字面值, 属性名, 行号, 解析, 遍历, ts } from '../语法.ts';

export const 规矩表路径 = 'rules/规矩.toml';
const 落点顶层 = ['engine', 'world', 'content', 'pipeline', 'sourcing', 'py', 'assets', 'rules', 'story', 'docs', 'verify'];

type 例外条目 = { 段?: string; 场?: string; 值?: unknown; 原因?: string; 出处?: string };
type 规矩条目 = { id?: unknown; 默认值?: unknown; 级别?: unknown; 原话?: unknown; 针对?: unknown; 出处?: unknown; 落点?: unknown; 例外?: unknown };

export type 代码例外 = { 规矩: string; 段?: string; 场?: string; 值: unknown; 文件: string; 行: number };

const 键 = (规矩: string, x: { 段?: string; 场?: string }) => `${规矩}|${x.段 !== undefined ? `段:${x.段}` : `场:${x.场}`}`;
const 对象 = (x: { 段?: string; 场?: string }) => (x.段 !== undefined ? `段 ${x.段}` : `场 ${x.场}`);

const 例外模块 = 'engine/core/例外';
/** 搬家 R2-A 暂放在 world/地点/<地点>/<旧目录>/ 的剧情编排（docs/迁移.md 差异表）：拆回 content/场 之前，例外 也可以写在这里 */
const R2暂放 = /^world\/地点\/[^/]+\/\d+-[^/]+\//;
/** import/export 的模块是不是 engine/core/例外(.ts)：只认相对路径 */
const 指向例外模块 = (文件: string, spec: ts.Expression | undefined) => {
  if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith('.')) return false;
  return path.posix.normalize(path.posix.join(path.posix.dirname(文件), spec.text)).replace(/\.[cm]?[jt]sx?$/, '') === 例外模块;
};

/**
 * 渲染代码里的 例外(...) 调用；参数不是字面量的直接报。
 * 只认字面上叫 例外 的调用（含 x.例外(...)），所以改名导入、命名空间导入、转出、把 例外 当值传都直接报，免得绕过登记。
 */
export const 找代码例外 = (c: 检查上下文, 报: 报告): 代码例外[] => {
  const r: 代码例外[] = [];
  for (const p of c.文件()) {
    if (!是渲染代码(p) || !代码后缀.test(p) || p === `${例外模块}.ts`) continue;
    const 源 = c.读(p);
    if (!源.includes('例外')) continue;
    const sf = 解析(p, 源);
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s) && 指向例外模块(p, s.moduleSpecifier)) {
        const b = s.importClause?.namedBindings;
        if (b && ts.isNamespaceImport(b)) 报.错(`不许用命名空间导入 ${例外模块}.ts：写 import { 例外 } from '…/例外.ts'`, p, 行号(sf, s));
        if (b && ts.isNamedImports(b)) for (const e of b.elements) if (e.propertyName && e.name.text !== 属性名(e.propertyName)) 报.错(`不许给 ${属性名(e.propertyName)} 改名导入（anim check 只认叫 例外 的调用）`, p, 行号(sf, e));
      }
      if (ts.isExportDeclaration(s) && 指向例外模块(p, s.moduleSpecifier)) 报.错(`不许转出 ${例外模块}.ts：用到的文件直接 import { 例外 }`, p, 行号(sf, s));
    }
    遍历(sf, (n) => {
      if (ts.isIdentifier(n) && n.text === '例外') {
        const 父 = n.parent;
        const 是调用 = (ts.isCallExpression(父) && 父.expression === n) || (ts.isPropertyAccessExpression(父) && 父.name === n && ts.isCallExpression(父.parent) && 父.parent.expression === 父);
        const 只是名字 =
          (ts.isPropertyAccessExpression(父) && 父.name === n) ||
          ((ts.isPropertyAssignment(父) || ts.isPropertySignature(父) || ts.isMethodDeclaration(父) || ts.isPropertyDeclaration(父)) && 父.name === n) ||
          ts.isImportSpecifier(父) ||
          ts.isTypeReferenceNode(父) ||
          ts.isQualifiedName(父);
        if (ts.isExportSpecifier(父)) 报.错('不许转出 例外：用到的文件直接从 engine/core/例外.ts import', p, 行号(sf, n));
        else if (!是调用 && !只是名字) 报.错('例外 只能直接调用：不许赋给别的名字、当参数传、解构改名（anim check 只认叫 例外 的调用）', p, 行号(sf, n));
      }
      if (!ts.isCallExpression(n)) return;
      const 名 = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : undefined;
      if (名 !== '例外') return;
      const 行 = 行号(sf, n);
      const [a, b, d] = n.arguments;
      const 规矩 = 字面值(a);
      const 依据: Record<string, unknown> = {};
      let 段数组 = false;
      if (d && ts.isObjectLiteralExpression(d)) {
        for (const q of d.properties) {
          if (!ts.isPropertyAssignment(q) || !属性名(q.name)) continue;
          const 值 = q.initializer;
          // 段 可以是几个段键的字面量数组
          if (属性名(q.name) === '段' && ts.isArrayLiteralExpression(值)) {
            const 们 = 值.elements.map((e) => 字面值(e));
            段数组 = true;
            依据.段 = 们.length && 们.every((x) => typeof x === 'string') ? 们 : undefined;
          } else 依据[属性名(q.name)!] = 字面值(值);
        }
      }
      const 段们 = typeof 依据.段 === 'string' ? [依据.段] : Array.isArray(依据.段) ? (依据.段 as string[]) : null;
      if (typeof 规矩 !== 'string' || !d || !ts.isObjectLiteralExpression(d) || (段们 === null) === (typeof 依据.场 !== 'string') || typeof 依据.原因 !== 'string') {
        报.错("例外 要写成 例外('规矩id', 值, { 段: '<段键>'（或段键数组）或 场: '<场键>', 原因: '…' })，规矩 id、段/场、原因都用字面量", p, 行);
        return;
      }
      const 在 = /^content\/(段|场)\/([^/]+)\//.exec(p);
      if (!在) {
        if (!R2暂放.test(p)) 报.错('例外 只写在 content/段/ 或 content/场/ 里（共用代码不为某一段开口子）', p, 行);
      }
      else if (在[1] === '段' && (段数组 || 依据.段 !== 在[2])) 报.错(`content/段/${在[2]}/ 里的例外要写 段: '${在[2]}'`, p, 行);
      else if (在[1] === '场' && typeof 依据.场 === 'string' && 依据.场 !== 在[2]) 报.错(`content/场/${在[2]}/ 里的例外写的是 场: '${依据.场}'`, p, 行);
      if (段们) for (const 段 of 段们) r.push({ 规矩, 段, 值: 字面值(b), 文件: p, 行 });
      else r.push({ 规矩, 场: 依据.场 as string, 值: 字面值(b), 文件: p, 行 });
    });
  }
  return r;
};

/** 落点一项：「旧:…」「待迁移:…」→ 待迁移；否则 <路径> [符号、符号…]，路径后面可以跟（括号说明） */
export const 解析落点 = (s: string): { 待迁移: true } | { 路径: string; 符号: string[] } | { 错: string } => {
  if (/^(旧|待迁移):/.test(s)) return { 待迁移: true };
  const 去注 = s.replace(/（[^）]*）|\([^)]*\)/g, ' ').trim();
  const [路径, ...其余] = 去注.split(/\s+/);
  if (!路径 || !落点顶层.includes(路径.split('/')[0]!)) return { 错: `落点「${s}」要写成 <路径> [符号、符号…]（路径从 ${落点顶层.join('、')} 开头），还在旧项目的写 旧: 开头；没有共用落点就留空数组，说明写进 备注` };
  return { 路径: 路径.replace(/\/$/, ''), 符号: 其余.join(' ').split(/[、，,\s]+/).filter(Boolean) };
};

const 有符号 = (c: 检查上下文, 路径: string, 符号: string) => {
  const 名 = 符号.split('.')[0]!;
  const 源 = c.读(路径);
  if (代码后缀.test(路径)) return 声明的名字(解析(路径, 源)).has(名);
  return new RegExp(`(?<![\\p{L}\\p{N}_$])${名.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_$])`, 'u').test(源);
};

export const 规矩 = async (c: 检查上下文, 报: 报告) => {
  if (!c.存在(规矩表路径)) return 报.错(`没有 ${规矩表路径}`);
  let doc: Record<string, unknown>;
  try {
    doc = c.读toml(规矩表路径)!;
  } catch (e) {
    return 报.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, 规矩表路径);
  }
  const 位 = 规矩表路径;
  const 表 = new Map<string, 例外条目[]>();
  for (const r of (doc['规矩'] ?? []) as 规矩条目[]) {
    const 名 = `规矩「${String(r.id)}」`;
    if (typeof r.id !== 'string' || !r.id) {
      报.错('有一条规矩没写 id', 位);
      continue;
    }
    if (表.has(r.id)) 报.错(`${名} 重复`, 位);
    if (r.默认值 === undefined || r.默认值 === '') 报.错(`${名}：要写 默认值`, 位);
    if (r.级别 !== '原话' && r.级别 !== '参考') 报.错(`${名}：级别 只能是 原话 或 参考`, 位);
    if (!Array.isArray(r.原话) || r.原话.some((x) => typeof x !== 'string')) 报.错(`${名}：原话 要是字符串数组（没有就写 []）`, 位);
    else if (r.级别 === '原话' && r.原话.length === 0) 报.错(`${名}：级别是 原话，原话却是空的`, 位);
    if (typeof r.针对 !== 'string' || !r.针对) 报.错(`${名}：要写 针对`, 位);
    if (!Array.isArray(r.出处) || r.出处.length === 0) 报.错(`${名}：出处 要是非空数组`, 位);
    if (!Array.isArray(r.落点) || r.落点.some((x) => typeof x !== 'string')) 报.错(`${名}：落点 要是字符串数组（没有共用落点写 []）`, 位);
    if (!Array.isArray(r.例外)) {
      报.错(`${名}：例外 要是数组（没有写 []）`, 位);
      表.set(r.id, []);
    } else {
      for (const x of r.例外 as 例外条目[]) {
        if ((typeof x.段 === 'string') === (typeof x.场 === 'string')) 报.错(`${名} 的例外要写 段 或 场（二选一）`, 位);
        if (x.值 === undefined || typeof x.原因 !== 'string' || !x.原因 || typeof x.出处 !== 'string' || !x.出处) 报.错(`${名} 的例外（${对象(x)}）要写 值、原因、出处`, 位);
      }
      表.set(r.id, r.例外 as 例外条目[]);
    }

    for (const 项 of Array.isArray(r.落点) ? (r.落点 as string[]) : []) {
      const l = 解析落点(项);
      if ('待迁移' in l) 报.待(`${名} 的落点 ${项}`, 位);
      else if ('错' in l) 报.错(`${名}：${l.错}`, 位);
      else if (!c.存在(l.路径)) 报.错(`${名} 的落点 ${l.路径} 不存在（还没搬就写 旧: 或 待迁移: 开头）`, 位);
      else if (l.符号.length && !fs.statSync(c.绝对(l.路径)).isFile()) 报.错(`${名} 的落点 ${l.路径} 是目录，写了符号就要落到具体文件`, 位);
      else for (const s of l.符号) if (!有符号(c, l.路径, s)) 报.错(`${名} 的落点 ${l.路径} 里找不到符号 ${s}`, 位);
    }
  }

  // 代码 → 表
  const 代码 = 找代码例外(c, 报);
  const 代码键 = new Map<string, 代码例外>();
  for (const x of 代码) {
    const k = 键(x.规矩, x);
    代码键.set(k, x);
    const 登记 = 表.get(x.规矩);
    if (!登记) {
      报.错(`例外用的规矩「${x.规矩}」不在 ${规矩表路径} 里`, x.文件, x.行);
      continue;
    }
    const 条 = 登记.find((y) => 键(x.规矩, y) === k);
    if (!条) 报.错(`规矩「${x.规矩}」对 ${对象(x)} 的例外没在 ${规矩表路径} 登记（例外列表里加一条，写值、原因、出处）`, x.文件, x.行);
    else if (['number', 'string', 'boolean'].includes(typeof x.值) && typeof 条.值 === typeof x.值 && 条.值 !== x.值) {
      报.错(`规矩「${x.规矩}」对 ${对象(x)} 的例外：代码里的值是 ${JSON.stringify(x.值)}，表里登记的是 ${JSON.stringify(条.值)}`, x.文件, x.行);
    }
  }

  // 表 → 代码
  const 内容 = await 读内容(c);
  const 场们 = new Set(['错误' in 内容 ? [] : 内容.段们.flatMap((s) => (s.定义 ? [s.定义.场] : []))].flat());
  for (const [id, 例外们] of 表) {
    for (const x of 例外们) {
      if ((typeof x.段 === 'string') === (typeof x.场 === 'string')) continue;
      if (代码键.has(键(id, x))) continue;
      const 搬了 = x.段 !== undefined ? c.存在(`content/段/${x.段}`) : c.存在(`content/场/${x.场}`) || 场们.has(x.场!);
      if (搬了) 报.错(`规矩「${id}」登记了对 ${对象(x)} 的例外，代码里却没有 例外('${id}', …, { ${x.段 !== undefined ? '段' : '场'}: '${x.段 ?? x.场}', … })`, 位);
      else 报.待(`规矩「${id}」对 ${对象(x)} 的例外（${对象(x)} 还没搬）`, 位);
    }
  }
};
