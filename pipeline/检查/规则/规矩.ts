// 规矩：所查作品的 规矩.toml 的格式（只管这部作品；全片通用的在 rules/通用.toml）；代码里每个 例外('规矩id', 值, {段|场, 原因}) 都在表里那条规矩的 例外 里登记过、值对得上，
// 表里登记的例外代码里也都找得到（段或场还没搬进来的算待迁移）；默认值的落点（<路径> [符号、符号…]）文件和符号都在。
// 落点以「旧:」或「待迁移:」开头的是还在旧项目里的，算待迁移，搬完改成新路径。
// 出处里 M/<名>.md 指的记忆（根是配置 记忆，ANIM_MEMORY）要在；记忆仓库不在本机（别的机器、公开版）就跳过，不算违规。
// 作品没有 规矩.toml 也没用 例外 就跳过；别的作品目录里的 例外 不归这里查。
import fs from 'node:fs';
import path from 'node:path';
import { readContent } from '../../源码/内容.ts';
import { config } from '../../环境/配置.ts';
import { codeExtRegex, isRenderCode, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { declaredNames, literalValue, propertyName, lineNo, parseSource, walk, ts } from '../语法.ts';
import type * as exceptionModuleType from '../../../engine/core/例外.ts';
import type { RuleExceptionBasis } from '../../../engine/core/例外.ts';

export const ruleTablePath = (c: CheckContext) => c.workPath('规矩.toml');
const landingRoots = ['engine', '库', '作品', 'pipeline', 'sourcing', 'py', 'assets', 'rules', 'docs', 'verify'];

type RuleExceptionEntry = { segment?: string; scene?: string; value?: unknown; cause?: string; provenance?: string };
type RuleEntry = { id?: unknown; defaultValue?: unknown; level?: unknown; quotes?: unknown; appliesTo?: unknown; provenance?: unknown; placement?: unknown; exceptions?: unknown };

export type CodeException = { rule: string; segment?: string; scene?: string; value: unknown; file: string; 行: number };

const ruleKey = (rule: string, x: { segment?: string; scene?: string }) => `${rule}|${x.segment !== undefined ? `段:${x.segment}` : `场:${x.scene}`}`;
const describeScope = (x: { segment?: string; scene?: string }) => (x.segment !== undefined ? `段 ${x.segment}` : `场 ${x.scene}`);

const exceptionModule = 'engine/core/例外';
// 认 例外(…) 调用和它第三个参数的键：名字按模块的导出、类型的键查（tsc 查、改名工具并组）；只 import 类型，pipeline 不多引非纯模块
const exceptionName: keyof typeof exceptionModuleType = 'exception';
type ExceptionBasisKeys = (RuleExceptionBasis extends unknown ? (x: RuleExceptionBasis) => void : never) extends (x: infer I) => void ? I : never;
const segProp: keyof ExceptionBasisKeys = 'segment';
/** 搬家 R2-A 暂放在 作品/<名>/地点/<地点>/<旧目录>/ 的剧情编排（docs/迁移.md 差异表）：拆回 场/ 之前，例外 也可以写在这里 */
const r2Temp = /^作品\/[^/]+\/地点\/[^/]+\/\d+-[^/]+\//;
/** import/export 的模块是不是 engine/core/例外(.ts)：认相对路径和 @engine/ */
const pointsToExceptionModule = (file: string, spec: ts.Expression | undefined) => {
  if (!spec || !ts.isStringLiteral(spec)) return false;
  const target = spec.text.startsWith('@engine/') ? 'engine/' + spec.text.slice('@engine/'.length) : spec.text.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec.text)) : null;
  return target !== null && target.replace(/\.[cm]?[jt]sx?$/, '') === exceptionModule;
};

/**
 * 渲染代码里的 例外(...) 调用；参数不是字面量的直接报。
 * 只认字面上叫 例外 的调用（含 x.例外(...)），所以改名导入、命名空间导入、转出、把 例外 当值传都直接报，免得绕过登记。
 */
export const findCodeExceptions = (c: CheckContext, report: CheckReport): CodeException[] => {
  const r: CodeException[] = [];
  for (const p of c.workFiles()) {
    if (!isRenderCode(p) || !codeExtRegex.test(p) || p === `${exceptionModule}.ts`) continue;
    const sourceText = c.读(p);
    // 只 import/转出模块、不写导出名的（export * from '…/例外.ts'）也要查：文本里有名字或模块文件名就解析
    if (!sourceText.includes(exceptionName) && !sourceText.includes(path.posix.basename(exceptionModule))) continue;
    const sf = parseSource(p, sourceText);
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s) && pointsToExceptionModule(p, s.moduleSpecifier)) {
        const b = s.importClause?.namedBindings;
        if (b && ts.isNamespaceImport(b)) report.错(`不许用命名空间导入 ${exceptionModule}.ts：写 import { ${exceptionName} } from '…/例外.ts'`, p, lineNo(sf, s));
        if (b && ts.isNamedImports(b)) for (const e of b.elements) if (e.propertyName && e.name.text !== propertyName(e.propertyName)) report.错(`不许给 ${propertyName(e.propertyName)} 改名导入（anim check 只认叫 ${exceptionName} 的调用）`, p, lineNo(sf, e));
      }
      if (ts.isExportDeclaration(s) && pointsToExceptionModule(p, s.moduleSpecifier)) report.错(`不许转出 ${exceptionModule}.ts：用到的文件直接 import { ${exceptionName} }`, p, lineNo(sf, s));
    }
    walk(sf, (n) => {
      if (ts.isIdentifier(n) && n.text === exceptionName) {
        const parentNode = n.parent;
        const isCall = (ts.isCallExpression(parentNode) && parentNode.expression === n) || (ts.isPropertyAccessExpression(parentNode) && parentNode.name === n && ts.isCallExpression(parentNode.parent) && parentNode.parent.expression === parentNode);
        const onlyName =
          (ts.isPropertyAccessExpression(parentNode) && parentNode.name === n) ||
          ((ts.isPropertyAssignment(parentNode) || ts.isPropertySignature(parentNode) || ts.isMethodDeclaration(parentNode) || ts.isPropertyDeclaration(parentNode)) && parentNode.name === n) ||
          ts.isImportSpecifier(parentNode) ||
          ts.isTypeReferenceNode(parentNode) ||
          ts.isQualifiedName(parentNode);
        if (ts.isExportSpecifier(parentNode)) report.错(`不许转出 ${exceptionName}：用到的文件直接从 engine/core/例外.ts import`, p, lineNo(sf, n));
        else if (!isCall && !onlyName) report.错(`${exceptionName} 只能直接调用：不许赋给别的名字、当参数传、解构改名（anim check 只认叫 ${exceptionName} 的调用）`, p, lineNo(sf, n));
      }
      if (!ts.isCallExpression(n)) return;
      const calleeName = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : undefined;
      if (calleeName !== exceptionName) return;
      const line = lineNo(sf, n);
      const [a, b, d] = n.arguments;
      const rule = literalValue(a);
      const basis: { -readonly [K in keyof ExceptionBasisKeys]?: unknown } & Record<string, unknown> = {};
      let segmentIsArray = false;
      if (d && ts.isObjectLiteralExpression(d)) {
        for (const q of d.properties) {
          if (!ts.isPropertyAssignment(q) || !propertyName(q.name)) continue;
          const value = q.initializer;
          // 段 可以是几个段键的字面量数组
          if (propertyName(q.name) === segProp && ts.isArrayLiteralExpression(value)) {
            const segNames = value.elements.map((e) => literalValue(e));
            segmentIsArray = true;
            basis.segment = segNames.length && segNames.every((x) => typeof x === 'string') ? segNames : undefined;
          } else basis[propertyName(q.name)!] = literalValue(value);
        }
      }
      const segments = typeof basis.segment === 'string' ? [basis.segment] : Array.isArray(basis.segment) ? (basis.segment as string[]) : null;
      if (typeof rule !== 'string' || !d || !ts.isObjectLiteralExpression(d) || (segments === null) === (typeof basis.scene !== 'string') || typeof basis.cause !== 'string') {
        report.错(`例外 要写成 ${exceptionName}('规矩id', 值, { segment: '<段键>'（或段键数组）或 scene: '<场键>', cause: '…' })，规矩 id、段/场、原因都用字面量`, p, line);
        return;
      }
      const match = /^作品\/[^/]+\/(段|场)\/([^/]+)\//.exec(p);
      if (!match) {
        if (!r2Temp.test(p)) report.错(`例外 只写在 ${c.workPath('段/')} 或 ${c.workPath('场/')} 里（共用代码不为某一段开口子）`, p, line);
      }
      else if (match[1] === '段' && (segmentIsArray || basis.segment !== match[2])) report.错(`${c.workPath(`段/${match[2]}`)}/ 里的例外要写 segment: '${match[2]}'`, p, line);
      else if (match[1] === '场' && typeof basis.scene === 'string' && basis.scene !== match[2]) report.错(`${c.workPath(`场/${match[2]}`)}/ 里的例外写的是 scene: '${basis.scene}'`, p, line);
      if (segments) for (const segKey of segments) r.push({ rule: rule, segment: segKey, value: literalValue(b), file: p, 行: line });
      else r.push({ rule: rule, scene: basis.scene as string, value: literalValue(b), file: p, 行: line });
    });
  }
  return r;
};

/** 落点一项：「旧:…」「待迁移:…」→ 待迁移；否则 <路径> [符号、符号…]，路径后面可以跟（括号说明） */
export const parseLanding = (s: string): { pendingMigration: true } | { path: string; symbols: string[] } | { 错: string } => {
  if (/^(旧|待迁移):/.test(s)) return { pendingMigration: true };
  const noComment = s.replace(/（[^）]*）|\([^)]*\)/g, ' ').trim();
  const [filePath, ...restTokens] = noComment.split(/\s+/);
  if (!filePath || !landingRoots.includes(filePath.split('/')[0]!)) return { 错: `落点「${s}」要写成 <路径> [符号、符号…]（路径从 ${landingRoots.join('、')} 开头），还在旧项目的写 旧: 开头；没有共用落点就留空数组，说明写进 备注` };
  return { path: filePath.replace(/\/$/, ''), symbols: restTokens.join(' ').split(/[、，,\s]+/).filter(Boolean) };
};

/** 出处文本里的记忆引用：M/<相对记忆根的路径>.md，可带 :行号 */
export const parseMemoryRefs = (s: string): { path: string; 行?: number }[] =>
  [...s.matchAll(/(?<![\p{L}\p{N}_/])M\/([\p{L}\p{N}._/-]+?\.md)(?::(\d+))?/gu)].map((m) => ({ path: m[1]!, ...(m[2] ? { 行: Number(m[2]) } : {}) }));

/** 出处里 M/ 引用的记忆都在、带行号的没超出文件 */
const checkMemoryRefs = (c: CheckContext, report: CheckReport, ruleRefs: { rule: string; provenance: string }[]) => {
  const ruleTable = ruleTablePath(c);
  const allRefs = ruleRefs.flatMap((x) => parseMemoryRefs(x.provenance).map((m) => ({ ...m, rule: x.rule })));
  if (!allRefs.length) return;
  const memoryRoot = c.memoryRoot ?? config('记忆');
  if (!fs.existsSync(memoryRoot)) return void report.skipped.push(`出处的记忆引用（${allRefs.length} 处）：记忆目录 ${memoryRoot} 不在本机（ANIM_MEMORY 指定）`);
  for (const m of allRefs) {
    const f = path.resolve(memoryRoot, ...m.path.split('/'));
    const displayName = `规矩「${m.rule}」的出处 M/${m.path}`;
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) report.错(`${displayName} 在记忆目录里找不到（记忆删了、改名或合并了就改出处）`, ruleTable);
    else if (m.行 !== undefined && fs.readFileSync(f, 'utf8').split('\n').length < m.行) report.错(`${displayName}:${m.行} 超出文件行数`, ruleTable);
  }
};

const hasSymbol = (c: CheckContext, filePath: string, symbol: string) => {
  const rootName = symbol.split('.')[0]!;
  const sourceText = c.读(filePath);
  if (codeExtRegex.test(filePath)) return declaredNames(parseSource(filePath, sourceText)).has(rootName);
  return new RegExp(`(?<![\\p{L}\\p{N}_$])${rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_$])`, 'u').test(sourceText);
};

export const ruleCheck = async (c: CheckContext, report: CheckReport) => {
  const path = ruleTablePath(c);
  if (!c.exists(path)) {
    const codeExceptions = findCodeExceptions(c, report);
    for (const x of codeExceptions) report.错(`例外用的规矩「${x.rule}」，这部作品却没有 ${path}`, x.file, x.行);
    if (!codeExceptions.length) report.skipped.push(`没有 ${path}，代码里也没有 例外`);
    return;
  }
  let doc: Record<string, unknown>;
  try {
    doc = c.readToml(path)!;
  } catch (e) {
    return report.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, path);
  }
  const exceptionMap = new Map<string, RuleExceptionEntry[]>();
  const sources: { rule: string; provenance: string }[] = [];
  for (const r of (doc['rule'] ?? []) as RuleEntry[]) {
    const displayName = `规矩「${String(r.id)}」`;
    if (typeof r.id !== 'string' || !r.id) {
      report.错('有一条规矩没写 id', path);
      continue;
    }
    if (exceptionMap.has(r.id)) report.错(`${displayName} 重复`, path);
    if (r.defaultValue === undefined || r.defaultValue === '') report.错(`${displayName}：要写 默认值`, path);
    if (r.level !== '原话' && r.level !== '参考') report.错(`${displayName}：级别 只能是 原话 或 参考`, path);
    if (!Array.isArray(r.quotes) || r.quotes.some((x) => typeof x !== 'string')) report.错(`${displayName}：原话 要是字符串数组（没有就写 []）`, path);
    else if (r.level === '原话' && r.quotes.length === 0) report.错(`${displayName}：级别是 原话，原话却是空的`, path);
    if (typeof r.appliesTo !== 'string' || !r.appliesTo) report.错(`${displayName}：要写 针对`, path);
    if (!Array.isArray(r.provenance) || r.provenance.length === 0) report.错(`${displayName}：出处 要是非空数组`, path);
    else for (const s of r.provenance) if (typeof s === 'string') sources.push({ rule: r.id, provenance: s });
    if (!Array.isArray(r.placement) || r.placement.some((x) => typeof x !== 'string')) report.错(`${displayName}：落点 要是字符串数组（没有共用落点写 []）`, path);
    if (!Array.isArray(r.exceptions)) {
      report.错(`${displayName}：例外 要是数组（没有写 []）`, path);
      exceptionMap.set(r.id, []);
    } else {
      for (const x of r.exceptions as RuleExceptionEntry[]) {
        if ((typeof x.segment === 'string') === (typeof x.scene === 'string')) report.错(`${displayName} 的例外要写 段 或 场（二选一）`, path);
        if (x.value === undefined || typeof x.cause !== 'string' || !x.cause || typeof x.provenance !== 'string' || !x.provenance) report.错(`${displayName} 的例外（${describeScope(x)}）要写 值、原因、出处`, path);
        else sources.push({ rule: r.id, provenance: x.provenance });
      }
      exceptionMap.set(r.id, r.exceptions as RuleExceptionEntry[]);
    }

    for (const item of Array.isArray(r.placement) ? (r.placement as string[]) : []) {
      const l = parseLanding(item);
      if ('pendingMigration' in l) report.待(`${displayName} 的落点 ${item}`, path);
      else if ('错' in l) report.错(`${displayName}：${l.错}`, path);
      else if (!c.exists(l.path)) report.错(`${displayName} 的落点 ${l.path} 不存在（还没搬就写 旧: 或 待迁移: 开头）`, path);
      else if (l.symbols.length && !fs.statSync(c.absPath(l.path)).isFile()) report.错(`${displayName} 的落点 ${l.path} 是目录，写了符号就要落到具体文件`, path);
      else for (const s of l.symbols) if (!hasSymbol(c, l.path, s)) report.错(`${displayName} 的落点 ${l.path} 里找不到符号 ${s}`, path);
    }
  }

  checkMemoryRefs(c, report, sources);

  // 代码 → 表
  const codeExceptions = findCodeExceptions(c, report);
  const codeExceptionByKey = new Map<string, CodeException>();
  for (const x of codeExceptions) {
    const k = ruleKey(x.rule, x);
    codeExceptionByKey.set(k, x);
    const registeredEntries = exceptionMap.get(x.rule);
    if (!registeredEntries) {
      report.错(`例外用的规矩「${x.rule}」不在 ${path} 里`, x.file, x.行);
      continue;
    }
    const ruleEntry = registeredEntries.find((y) => ruleKey(x.rule, y) === k);
    if (!ruleEntry) report.错(`规矩「${x.rule}」对 ${describeScope(x)} 的例外没在 ${path} 登记（例外列表里加一条，写值、原因、出处）`, x.file, x.行);
    else if (['number', 'string', 'boolean'].includes(typeof x.value) && typeof ruleEntry.value === typeof x.value && ruleEntry.value !== x.value) {
      report.错(`规矩「${x.rule}」对 ${describeScope(x)} 的例外：代码里的值是 ${JSON.stringify(x.value)}，表里登记的是 ${JSON.stringify(ruleEntry.value)}`, x.file, x.行);
    }
  }

  // 表 → 代码
  const parsedContent = await readContent(c);
  const scenes = new Set(['errors' in parsedContent ? [] : parsedContent.segments.flatMap((s) => (s.definition ? [s.definition.scene] : []))].flat());
  for (const [id, exceptionList] of exceptionMap) {
    for (const x of exceptionList) {
      if ((typeof x.segment === 'string') === (typeof x.scene === 'string')) continue;
      if (codeExceptionByKey.has(ruleKey(id, x))) continue;
      const moved = x.segment !== undefined ? c.exists(c.workPath(`段/${x.segment}`)) : c.exists(c.workPath(`场/${x.scene}`)) || scenes.has(x.scene!);
      if (moved) report.错(`规矩「${id}」登记了对 ${describeScope(x)} 的例外，代码里却没有 ${exceptionName}('${id}', …, { ${x.segment !== undefined ? 'segment' : 'scene'}: '${x.segment ?? x.scene}', … })`, path);
      else report.待(`规矩「${id}」对 ${describeScope(x)} 的例外（${describeScope(x)} 还没搬）`, path);
    }
  }
};
