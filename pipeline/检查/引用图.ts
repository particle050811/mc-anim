// 源码级的引用图：逐个文件用 TS 解析器读 import、export from、import()、import('x') 类型、require，连只有类型的引用也收。
// 结构规则用的 esbuild 图（上下文.ts 的 depGraph）擦掉了类型导入，查不出只靠类型绕成的环和反向引用，所以另建这一张。
// 只认相对路径和 @engine/、@库/ 两个别名（tsconfig paths）；包名、node: 内置不进图，解析不到的（tsc 会报）也不进。
import path from 'node:path';
import { codeExtRegex, type CheckContext } from '../源码/上下文.ts';
import { parseSource, walk, lineNo, ts } from './语法.ts';

/** value：运行时要加载；type：import type、export type、import('x') 类型，擦掉后不加载；dynamic：import() 调用 */
export type RefKind = 'value' | 'type' | 'dynamic';
export type RefEdge = { to: string; kind: RefKind; line: number };
export type RefGraph = { edges: Map<string, RefEdge[]> };

const aliasRoots: [string, string][] = [
  ['@engine/', 'engine/'],
  ['@库/', '库/'],
];
const suffixes = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.tsx'];

const specOf = (n: ts.Node): { spec: string; kind: RefKind } | null => {
  if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) return { spec: n.moduleSpecifier.text, kind: n.importClause?.isTypeOnly ? 'type' : 'value' };
  if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) return { spec: n.moduleSpecifier.text, kind: n.isTypeOnly ? 'type' : 'value' };
  if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) return { spec: n.argument.literal.text, kind: 'type' };
  if (ts.isCallExpression(n) && n.arguments.length >= 1 && ts.isStringLiteralLike(n.arguments[0]!)) {
    if (n.expression.kind === ts.SyntaxKind.ImportKeyword) return { spec: n.arguments[0].text, kind: 'dynamic' };
    if (ts.isIdentifier(n.expression) && n.expression.text === 'require') return { spec: n.arguments[0].text, kind: 'value' };
  }
  return null;
};

export const buildRefGraph = (c: CheckContext): RefGraph => {
  const known = new Set(c.文件());
  const resolve = (from: string, spec: string): string | null => {
    const alias = aliasRoots.find(([a]) => spec.startsWith(a));
    const base = alias ? alias[1] + spec.slice(alias[0].length) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)) : null;
    if (base !== null) for (const s of suffixes) if (known.has(base + s)) return base + s;
    return null;
  };
  const graph: RefGraph = { edges: new Map() };
  for (const from of c.codeFiles()) {
    const sf = parseSource(from, c.读(from), false);
    const edges: RefEdge[] = [];
    walk(sf, (n) => {
      const found = specOf(n);
      if (!found) return;
      const to = resolve(from, found.spec);
      if (to && codeExtRegex.test(to)) edges.push({ to, kind: found.kind, line: lineNo(sf, n) });
    });
    graph.edges.set(from, edges);
  }
  return graph;
};

/** Tarjan 求强连通分量，只返回成环的（两个以上文件，或自己引自己） */
export const cyclesOf = (nodes: Iterable<string>, next: (n: string) => Iterable<string>): string[][] => {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  let counter = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of next(v)) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) !== index.get(v)) return;
    const scc: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      onStack.delete(w);
      scc.push(w);
    } while (w !== v);
    if (scc.length > 1 || [...next(v)].includes(v)) out.push(scc.sort());
  };
  for (const n of nodes) if (!index.has(n)) visit(n);
  return out;
};
