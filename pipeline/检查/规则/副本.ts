// 副本：共用函数（lerp、smoothstep、toThree、Cam、插骨、原版挥手、原版下落……，表在 正本表.ts）只许有一份正本，新代码 import 它，不再自己写。
// 现有的旧副本登记在 docs/副本表.tsv（按 正本 × 文件 记处数）：迁移不改画面，旧段的代码原样不动（改了会让段过期），所以先冻住。
// - 代码里某个文件的副本比表里登记的多 → 违规（新写的副本，改成 import 正本）。
// - 比登记的少、文件没了 → 违规（把表改小：表只许减少，删掉的副本不许再加回来）。
// - 表本身和 main 的分叉点比，每个正本的总处数只许减少；改名、挪文件不加总数就行。不在 git 里（测试的样例仓库）就不比。
//   例外：分叉点的 正本表.ts 里还没有的正本（这次新加的），它的旧副本可以第一次登记进表。
// 只查 engine、库 和这次查的作品（渲染代码，不含测试）；别的作品的行留给查那部作品时比。pipeline 不能 import 渲染层，不查。
import { execFileSync } from 'node:child_process';
import { isRenderCode, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { walk, lineNo, ts } from '../语法.ts';
import { FileFunctions, isFnNode, isSameBehavior } from '../副本识别.ts';
import { canonicalFiles, canonicalTable, type CanonicalItem } from '../正本表.ts';

export const copyTablePath = 'docs/副本表.tsv';

export type Spot = { 行: number; 名?: string; matchBy: '名字' | '行为' | '记号' };
/** 正本 id → 文件 → 各处 */
export type CopyState = Map<string, Map<string, Spot[]>>;
type CanonicalFn = (...a: unknown[]) => unknown;

/** 读副本表：# 开头的是注释，第一行非注释是表头（正本、文件、处数） */
export const readCopyTable = (text: string): { 表: Map<string, Map<string, number>>; 错: string[] } => {
  const copyMap = new Map<string, Map<string, number>>();
  const errors: string[] = [];
  let headerSeen = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    if (!headerSeen) {
      headerSeen = true;
      if (line !== '正本\t文件\t处数') errors.push(`第 ${i + 1} 行：表头应是「正本<TAB>文件<TAB>处数」`);
      return;
    }
    const [id, file, count] = line.split('\t');
    const n = Number(count);
    if (!id || !file || !Number.isInteger(n) || n <= 0) return void errors.push(`第 ${i + 1} 行：要三列，处数是正整数`);
    const byFile = copyMap.get(id) ?? copyMap.set(id, new Map()).get(id)!;
    if (byFile.has(file)) errors.push(`第 ${i + 1} 行：${id} ${file} 重复`);
    byFile.set(file, n);
  });
  return { 表: copyMap, 错: errors };
};

/** 加载正本模块，拿出各个行为认法要比的函数（正本是 three 一类的模块也行：esbuild 打包后在 Node 里执行） */
const canonicalFns = async (c: CheckContext, report: CheckReport) => {
  const canonicalFuncMap = new Map<CanonicalItem, { canonicalFn: CanonicalFn; probes: readonly (readonly unknown[])[]; paramCount: number }[]>();
  for (const z of canonicalTable) {
    if (!z.behaviors) continue;
    const { 模块: moduleExports, 错误: error } = await c.loadModule(z.位置);
    const exportValue = moduleExports?.[z.exportName];
    if (typeof exportValue !== 'function') {
      report.错(`正本 ${z.id} 加载不了（${z.位置} 的 ${z.exportName}）：${error ?? '没有这个导出函数'}`, z.位置);
      continue;
    }
    canonicalFuncMap.set(
      z,
      z.behaviors.map((r) => ({ canonicalFn: (r.adapt ? r.adapt(exportValue as never) : exportValue) as CanonicalFn, probes: r.probes, paramCount: r.probes[0]!.length })),
    );
  }
  return canonicalFuncMap;
};

/** 节点外面最近的函数（自己是函数就是自己）；没有就是节点本身 */
const spotOf = (n: ts.Node): ts.Node => {
  for (let p: ts.Node | undefined = n; p; p = p.parent) if (isFnNode(p)) return p;
  return n;
};

/** 查一个文件：每个正本在这里有几处副本 */
export const scanCopies = (file: string, source: string, canonicalMap: Awaited<ReturnType<typeof canonicalFns>>): Map<string, Spot[]> => {
  const fileFuncs = new FileFunctions(file, source);
  const spotMap = new Map<string, Map<ts.Node, Spot>>();
  const report = (id: string, n: ts.Node, occurrence: Spot) => {
    const m = spotMap.get(id) ?? spotMap.set(id, new Map()).get(id)!;
    for (let p: ts.Node | undefined = n; p; p = p.parent) if (m.has(p)) return;
    m.set(n, occurrence);
  };
  for (const f of fileFuncs.functions) {
    const g = fileFuncs.wrap(f);
    const candidates = g ? canonicalTable.filter((z) => canonicalMap.get(z)?.some((r) => r.paramCount === f.paramCount && isSameBehavior(g, r.canonicalFn, r.probes))) : [];
    for (const z of candidates) report(z.id, f.节点, { 行: f.行, 名: f.名, matchBy: '行为' });
    if (candidates.length || !f.名) continue;
    // 能按行为比（能求值、有同样参数个数的探针）却不一样的，是同名的别的函数，不算；按行为认出是别的正本的（叫 smoothstep 的 smoothstep01），只算那一个
    for (const z of canonicalTable) {
      const canCompare = !!g && !!canonicalMap.get(z)?.some((r) => r.paramCount === f.paramCount);
      if (z.names?.includes(f.名) && !canCompare) report(z.id, f.节点, { 行: f.行, 名: f.名, matchBy: '名字' });
    }
  }
  const withMarkers = canonicalTable.filter((z) => z.token);
  walk(fileFuncs.sf, (n) => {
    for (const z of withMarkers) {
      if (!z.token!(n, fileFuncs.sf)) continue;
      const node = spotOf(n);
      report(z.id, node, { 行: lineNo(fileFuncs.sf, n), 名: isFnNode(node) ? (fileFuncs.functions.find((f) => f.节点 === node)?.名) : undefined, matchBy: '记号' });
    }
  });
  const r = new Map<string, Spot[]>();
  for (const [id, m] of spotMap) r.set(id, [...m.values()].sort((a, b) => a.行 - b.行));
  return r;
};

/** 要查的文件：engine、库、本作品的渲染代码，去掉正本自己 */
const filesToCheck = (c: CheckContext) => c.workFiles().filter((p) => isRenderCode(p) && !canonicalFiles.has(p));

/** 代码里现在的副本（engine、库、本作品） */
export const currentState = async (c: CheckContext, report: CheckReport): Promise<CopyState> => {
  const canonicalMap = await canonicalFns(c, report);
  const byId = new Map<string, Map<string, Spot[]>>();
  for (const p of filesToCheck(c)) {
    for (const [id, spots] of scanCopies(p, c.读(p), canonicalMap)) (byId.get(id) ?? byId.set(id, new Map()).get(id)!).set(p, spots);
  }
  return byId;
};

export const canonicalTablePath = 'pipeline/检查/正本表.ts';

/**
 * 表在 git 里和 main 的分叉点上的样子；拿不到（不在 git、没有 main、那时还没这张表）给 null。
 * 正本们：分叉点的 正本表.ts 里有的 id（读不到给 null，这时每个 id 都当老的，从严）
 */
const baseline = (c: CheckContext): { 表: string; canonicalIds: Set<string> | null } | null => {
  const git = (...a: string[]) => execFileSync('git', ['-C', c.根, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let mergeBase: string;
  let tableText: string;
  try {
    mergeBase = git('merge-base', 'HEAD', 'main').trim();
    tableText = git('show', `${mergeBase}:${copyTablePath}`);
  } catch {
    return null;
  }
  try {
    return { 表: tableText, canonicalIds: new Set([...git('show', `${mergeBase}:${canonicalTablePath}`).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]!)) };
  } catch {
    return { 表: tableText, canonicalIds: null };
  }
};

const refSnippet = (z: CanonicalItem) => `import { ${z.exportName} } from '${z.位置.replace(/^engine\//, '@engine/').replace(/^库\//, '@库/')}'`;
const describeSpots = (spots: Spot[]) => spots.map((x) => `第 ${x.行} 行${x.名 ? ` ${x.名}` : ''}（${x.matchBy}）`).join('、');

export const copyRule = async (c: CheckContext, report: CheckReport) => {
  if (!c.exists(copyTablePath)) return void report.错(`没有 ${copyTablePath}（现有副本的冻结表；没有旧副本也要留表头）`);
  const { 表: copyMap, 错: errors } = readCopyTable(c.读(copyTablePath));
  for (const e of errors) report.错(e, copyTablePath);
  const knownById = new Map(canonicalTable.map((z) => [z.id, z]));
  for (const id of copyMap.keys()) if (!knownById.has(id)) report.错(`正本表里没有 ${id}`, copyTablePath);

  const currentMap = await currentState(c, report);
  const inScope = (p: string) => /^(engine|库)\//.test(p) || p.startsWith(`${c.workDir}/`);
  let copyCount = 0;
  for (const z of canonicalTable) {
    const codeHits = currentMap.get(z.id) ?? new Map<string, Spot[]>();
    const fileCounts = copyMap.get(z.id) ?? new Map<string, number>();
    for (const [p, spots] of codeHits) {
      const allowed = fileCounts.get(p) ?? 0;
      if (spots.length > allowed)
        report.错(`${z.id} 的副本有 ${spots.length} 处（${describeSpots(spots)}），副本表登记 ${allowed} 处：新代码不再写副本，改成 ${refSnippet(z)}`, p, spots[0]!.行);
      else if (spots.length < allowed) report.错(`${z.id} 的副本现在 ${spots.length} 处，副本表登记 ${allowed} 处：把 ${copyTablePath} 这一行改成 ${spots.length}`, p);
    }
    for (const [p, allowed] of fileCounts) {
      if (!inScope(p) || codeHits.has(p)) continue;
      report.错(`副本表登记 ${z.id} 在 ${p} 有 ${allowed} 处，现在${c.exists(p) ? '没有了' : '文件都没了'}：删掉这一行`, copyTablePath);
    }
    for (const [p, n] of fileCounts) if (inScope(p)) copyCount += n;
  }

  const mergeBase = baseline(c);
  if (mergeBase === null) report.infoLines.push('和 main 的分叉点比不了（不在 git、没有 main，或那时还没有副本表），不查表只减不增');
  else {
    const prevTable = readCopyTable(mergeBase.表).表;
    const sumValues = (m: Map<string, number> | undefined) => [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);
    for (const [id, m] of copyMap) {
      const [newCount, oldCount] = [sumValues(m), sumValues(prevTable.get(id))];
      if (newCount <= oldCount) continue;
      if (oldCount === 0 && mergeBase.canonicalIds && !mergeBase.canonicalIds.has(id)) report.infoLines.push(`新正本 ${id}：第一次登记 ${newCount} 处旧副本`);
      else report.错(`副本表里 ${id} 从 ${oldCount} 处加到 ${newCount} 处：表只许减少，新代码改成 import 正本`, copyTablePath);
    }
  }
  report.infoLines.push(`副本表里 engine、库、${c.workName} 登记 ${copyCount} 处旧副本`);
};
