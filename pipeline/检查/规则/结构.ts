// 结构：分层方向（engine ← 库 ← 作品公共 ← 场 ← 段 ← 注册.tsx）、作品不互引、段不互引、场只接上一场的 末态.ts、不许引 核对/、
// pipeline 只 import 纯模块、渲染器取值只走统一入口、纯模块闭包无 react/three/remotion、getInputProps 只在 engine/段/设置.ts、渲染代码里不许有
// Math.random、Date.now、相对路径引的资产、写死的路径或主机名；不许 import 地形版本表、不许读时刻的 依据。依赖边取自 esbuild metafile（真实打包用到的），不用文本 grep。
// engine、库、作品下的测试不许引 pipeline（测试不在打包图里，单独解析源码查）。
import os from 'node:os';
import path from 'node:path';
import { checkSectionModelReg } from '../区段模型登记.ts';
import { readContent } from '../../源码/内容.ts';
import { codeExtRegex, isRenderCode, isPureModule, isTestOrDecl, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { dotPath, lineNo, parseSource, walk, ts } from '../语法.ts';
import { basisKey } from '../../指纹/去依据.ts';
import type * as assetDirModule from '../../../engine/core/资产目录.ts';

type LayerName = 'engine' | '库' | '作品公共' | '场' | '段' | '注册' | '核对' | 'pipeline' | '其他';
type PathLayer = { name: LayerName; key?: string };

/** 级数小的在左边：只能往级数小（或相等）的方向 import */
const layerRank: Partial<Record<LayerName, number>> = { engine: 0, 库: 1, 作品公共: 2, 场: 3, 段: 4, 注册: 5 };

export const layerOf = (p: string): PathLayer => {
  if (p.startsWith('engine/')) return { name: 'engine' };
  if (p.startsWith('库/')) return { name: '库' };
  const m = /^作品\/[^/]+\/(场|段|核对)\/([^/]+)\//.exec(p);
  if (m) return { name: m[1] as '场' | '段' | '核对', key: m[2] };
  if (/^作品\/[^/]+\/(注册\.tsx|index\.ts)$/.test(p)) return { name: '注册' };
  if (p.startsWith('作品/')) return { name: '作品公共' };
  if (p.startsWith('pipeline/')) return { name: 'pipeline' };
  return { name: '其他' };
};

const isRenderLayer = (l: PathLayer) => l.name in layerRank || l.name === '核对';
const isForbiddenPkg = (pkg: string) => ['react', 'react-dom', 'three', 'remotion'].includes(pkg) || pkg.startsWith('@remotion/');
export const binaryAssetExt = /\.(png|jpe?g|webp|gif|ogg|wav|mp3|m4a|flac|bin|ttf|otf|woff2?|mp4|mkv|mov|glb|gltf)$/i;

const displayName = (l: PathLayer) => (l.key ? `${l.name}/${l.key}` : l.name);
/** 文件属于哪部作品（作品/<名>/ 下的才有） */
const ownerWork = (p: string) => /^作品\/([^/]+)\//.exec(p)?.[1];

/**
 * 一条依赖边违反了哪条渲染层规则（作品不互引、不引核对、pipeline 只引纯模块、分层方向、段不互引、场只接上一场的末态），没有返回 null。
 * 结构规则拿 esbuild 的边（值导入）查；分层规则（分层.ts）拿只有类型的边再查一遍。typeOnly：pipeline 引 engine、库 的类型不算违规（类型不进 Node 执行的闭包），引作品的仍只许纯模块。
 */
export const edgeIssue = (c: CheckContext, fromFile: string, target: string, sceneOrder: readonly string[] | null, typeOnly = false): string | null => {
  const a = layerOf(fromFile);
  const b = layerOf(target);
  // 放在别的层规则前面：两部作品的段键、场键可能同名，按层比键会当成自己的段、场放过去
  const fromWork = ownerWork(fromFile);
  const toWork = ownerWork(target);
  if (fromWork && toWork && fromWork !== toWork) return `作品不许引用别的作品：${fromFile} → ${target}（两部作品共用的东西放 库/ 或 engine/）`;
  // 例外：核对段没有场，几段共用的场时间线放在头一段目录里（核对/<名>/时间线.ts），别的核对段可以引它
  if (b.name === '核对' && !(a.name === '核对' && (a.key === b.key || target.endsWith(`/核对/${b.key}/时间线.ts`)))) {
    return `不许引用 核对/：${fromFile} → ${target}（核对可以引任何东西，反过来不行；核对段之间只许引别的核对段的 时间线.ts）`;
  }
  if (a.name === 'pipeline') {
    if (typeOnly && (b.name === 'engine' || b.name === '库')) return null;
    return isRenderLayer(b) && !isPureModule(target) ? `pipeline 只许 import 纯模块（清单.ts、段.ts、时间线.ts、末态.ts…）${typeOnly ? '，类型也一样' : ''}：${fromFile} → ${target}` : null;
  }
  if (!isRenderLayer(a)) return null; // remotion.config.ts 这类配置、工具脚本
  if (target === 'assets/地形版本.json') {
    return `渲染代码不许 import 地形版本表：${fromFile}（整表进闭包，改任何一个包声明没声明的段都过期；版本由渲染入口按段传，见 engine/voxel/区段包位置.ts）`;
  }
  if (b.name === 'pipeline' || (b.name === '其他' && codeExtRegex.test(target))) return `渲染代码不许 import 管线和工具代码：${fromFile} → ${target}`;
  if (a.name === '核对' || b.name === '其他') return null; // 核对可以引任何东西；其他 是进 Git 的数据文件（json）
  if (a.name === '段' && b.name === '段' && a.key !== b.key) return `段不许引用别的段：${fromFile} → ${target}（两段共用的东西往下放到场或作品公共目录）`;
  if (a.name === '场' && b.name === '场' && a.key !== b.key) {
    const prevScene = sceneOrder && a.key ? sceneOrder[sceneOrder.indexOf(a.key) - 1] : undefined;
    if (target === c.workPath(`场/${b.key}/末态.ts`) && prevScene === b.key) return null;
    return `场只许引用上一场的 末态.ts：${fromFile} → ${target}${prevScene ? `（上一场是 ${prevScene}）` : '（清单里排不出上一场）'}`;
  }
  if (layerRank[b.name]! > layerRank[a.name]!) return `分层方向反了：${displayName(a)} 不能引用 ${displayName(b)}（${fromFile} → ${target}；只能 engine ← 库 ← 作品公共 ← 场 ← 段 ← 注册）`;
  return null;
};

/** 读清单排出的场序（场只许接上一场的末态要用）；清单读不出时为 null */
export const readSceneOrder = async (c: CheckContext) => {
  const parsedContent = await readContent(c);
  return 'sceneOrder' in parsedContent ? parsedContent.sceneOrder : null;
};

export const checkLayers = async (c: CheckContext, report: CheckReport) => {
  const depGraph = await c.depGraph();
  for (const e of depGraph.errors) report.错(`打包失败，依赖图不全：${e}`);
  const sceneOrder = await readSceneOrder(c);

  for (const [fromFile, edges] of depGraph.edges) {
    if (c.isOtherWork(fromFile)) continue; // 别的作品的文件只会经下面报过的跨作品引用进图，它自己的边归它自己查
    for (const e of edges) {
      if (e.external) continue;
      const issue = edgeIssue(c, fromFile, e.dest, sceneOrder);
      if (issue) report.错(issue, fromFile);
    }
  }

  // 纯模块的闭包
  for (const pureModule of c.workFiles().filter(isPureModule)) {
    if (!depGraph.edges.has(pureModule)) continue;
    const parentOf = new Map<string, string>([[pureModule, '']]);
    const queue = [pureModule];
    const reported = new Set<string>();
    const chain = (f: string) => {
      const r = [f];
      while (parentOf.get(r[0]!)) r.unshift(parentOf.get(r[0]!)!);
      return r.join(' → ');
    };
    while (queue.length) {
      const f = queue.shift()!;
      for (const id of depGraph.asset.get(f) ?? []) report.错(`纯模块的闭包里不能有 asset:（pipeline 在 Node 里直接执行它）：${chain(f)} → asset:${id}`, pureModule);
      for (const e of depGraph.edges.get(f) ?? []) {
        if (e.external) {
          if (isForbiddenPkg(e.dest) && !reported.has(e.dest)) {
            reported.add(e.dest);
            report.错(`纯模块的闭包里不能有 ${e.dest}：${chain(f)} → ${e.dest}`, pureModule);
          }
        } else if (binaryAssetExt.test(e.dest)) {
          report.错(`纯模块的闭包里不能有资产文件：${chain(f)} → ${e.dest}`, pureModule);
        } else if (!parentOf.has(e.dest)) {
          parentOf.set(e.dest, f);
          queue.push(e.dest);
        }
      }
    }
  }

  // 渲染代码用相对路径 import 资产文件
  for (const [fromFile, edges] of depGraph.edges) {
    if (!isRenderCode(fromFile)) continue;
    for (const e of edges) if (!e.external && binaryAssetExt.test(e.dest)) report.错(`资产要写 asset:<id> 引用，不用相对路径：${fromFile} → ${e.dest}`, fromFile);
  }
};

const hardcodedPathRegex = [/^\/(Users|home|Volumes|private|tmp|opt|var|mnt|root)\//, /^[A-Za-z]:[\\/]/, /^\\\\[^\\]+\\/, /^~\//];
// XML 命名空间（document.createElementNS）只是标识符，不连网，不算主机名
const w3NamespacePattern = /^http:\/\/www\.w3\.org\//;
const hostPatterns = [/\b(https?|wss?|ftp|file):\/\//i, /^localhost(:\d+)?$/i, /\blocalhost:\d+/i, /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/];

export const hardcodedProblem = (s: string, localHostname = os.hostname()): string | null => {
  if (hardcodedPathRegex.some((r) => r.test(s))) return '写死的路径';
  if (!w3NamespacePattern.test(s) && hostPatterns.some((r) => r.test(s))) return '写死的主机或网址';
  if (localHostname.length >= 4 && s.includes(localHostname)) return '写死的本机名';
  if (/^\.{1,2}\/.*\.[A-Za-z0-9]+$/.test(s) && binaryAssetExt.test(s)) return '相对路径的资产';
  return null;
};

// assetDir({ './a.png': 资_0 }) 的键只是查表用的名字（和 webpackContext 的键同形，见 engine/core/资产目录.ts），不是要加载的路径
const assetDirName: keyof typeof assetDirModule = 'assetDir';
const isAssetDirKey = (n: ts.Node) => {
  const propertyAssignment = n.parent;
  if (!ts.isPropertyAssignment(propertyAssignment) || propertyAssignment.name !== n || !ts.isObjectLiteralExpression(propertyAssignment.parent)) return false;
  const callNode = propertyAssignment.parent.parent;
  return ts.isCallExpression(callNode) && ts.isIdentifier(callNode.expression) && callNode.expression.text === assetDirName;
};

/** 交界.json 自己的 依据 字段（粗高度指纹，真的要读），不是时刻的说明 */
const basisReadable = new Set(['engine/voxel/交界修正.ts']);
/** 依据: x.依据、依据: x.依据 ?? ''：resolveEvents、arrangeSegs 一路往下传，不算读 */
const isPassThroughBasis = (n: ts.Node) => {
  const outerNode = ts.isBinaryExpression(n.parent) && n.parent.left === n ? n.parent.parent : n.parent;
  return ts.isPropertyAssignment(outerNode) && outerNode.name.getText() === basisKey;
};
/** 指纹不算时刻的 依据（指纹/去依据.ts），渲染代码读了它，改字就会改画面、段却不过期 */
const readBasis = (n: ts.Node) =>
  (ts.isPropertyAccessExpression(n) && n.name.text === basisKey && !isPassThroughBasis(n)) ||
  (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === basisKey) ||
  (ts.isBindingElement(n) && (n.propertyName ?? n.name).getText() === basisKey);

export const checkCode = (c: CheckContext, report: CheckReport, localHostname = os.hostname()) => {
  for (const p of c.workFiles()) {
    if (!codeExtRegex.test(p) || /\.d\.[cm]?ts$/.test(p)) continue;
    const isRender = isRenderCode(p);
    const sourceText = c.读(p);
    if (!isRender && !sourceText.includes('getInputProps')) continue;
    const sf = parseSource(p, sourceText);
    walk(sf, (n) => {
      if (ts.isIdentifier(n) && n.text === 'getInputProps' && p !== 'engine/段/设置.ts') {
        report.错('getInputProps 只能在 engine/段/设置.ts 里用（别处从 useSettings() 取渲染设置）', p, lineNo(sf, n));
      }
      if (!isRender || isTestOrDecl(p)) return;
      if (readBasis(n) && !basisReadable.has(p)) report.错('渲染代码不许读时刻的 依据：它是写给人看的说明，不进指纹（pipeline/指纹/去依据.ts）。要画出来的字另写一个字段', p, lineNo(sf, n));
      if (ts.isPropertyAccessExpression(n)) {
        const accessPath = dotPath(n)?.join('.');
        if (accessPath === 'Math.random' || accessPath === 'Date.now') report.错(`渲染代码里不许用 ${accessPath}（同一帧每次渲出来要一样；要随机用固定种子）`, p, lineNo(sf, n));
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        if (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)) return; // import 来源由依赖图查
        if (isAssetDirKey(n)) return;
        const problem = hardcodedProblem(n.text, localHostname);
        if (problem) report.错(`渲染代码里有${problem}：${JSON.stringify(n.text.slice(0, 80))}（路径从数据源和资产 id 取）`, p, lineNo(sf, n));
      }
    });
  }
};

const rendererPkg = '@remotion/renderer';
const rendererEntry = 'pipeline/渲/渲染器.ts';
const entryHint = `值导入必须通过 ${rendererEntry}（绑定 CJS 混音补丁；类型可直引）`;

/** vitest 和 anim check 共用；不追踪拼接或变量，只守可直接识别的入口绕行。 */
export const checkRendererEntry = (file: string, sourceText: string): { 行: number; text: string }[] => {
  if (!file.startsWith('pipeline/') || !/\.[cm]?[jt]s$/.test(file) || /\.d\.[cm]?ts$/.test(file)) return [];
  const issues: { 行: number; text: string }[] = [];
  const isTest = /\.test\.[cm]?[jt]s$/.test(file);
  const sf = parseSource(file, sourceText);
  const isRendererSpec = (n: ts.Node | undefined) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
    (n.text === rendererPkg || n.text.startsWith(`${rendererPkg}/`));
  const isValueImport = (n: ts.ImportDeclaration) => {
    const c = n.importClause;
    if (!c) return true;
    if (c.isTypeOnly) return false;
    return !!c.name || !c.namedBindings || ts.isNamespaceImport(c.namedBindings) || c.namedBindings.elements.length === 0 || c.namedBindings.elements.some(x => !x.isTypeOnly);
  };

  // 文本兜底连注释、测试也检查，避免相对路径和 import 条件解析绕过 AST 包名匹配。
  const esmPath = 'renderer/' + 'dist/esm';
  const importResolveRegex = /import\s*\.\s*meta\s*\.\s*resolve\s*\(\s*(['"`])@remotion\/renderer\1/g;
  for (const m of sourceText.matchAll(new RegExp(esmPath, 'g'))) {
    issues.push({ 行: sf.getLineAndCharacterOfPosition(m.index).line + 1, text: `不许引用 renderer 的 ESM 路径：${entryHint}` });
  }
  for (const m of sourceText.matchAll(importResolveRegex)) {
    issues.push({ 行: sf.getLineAndCharacterOfPosition(m.index).line + 1, text: `不许用 import.meta.resolve 解析渲染器：${entryHint}` });
  }
  walk(sf, (n) => {
    if (isTest) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'vi' &&
          ['mock', 'doMock'].includes(n.expression.name.text) &&
          n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text === rendererPkg) {
        issues.push({ 行: lineNo(sf, n), text: `测试要 mock 渲染器.ts，不要 mock '${rendererPkg}'（拦不到 createRequire 加载的 CJS 渲染器）` });
      }
      return;
    }
    if (file === rendererEntry) return;
    const badImport = ts.isImportDeclaration(n) && isRendererSpec(n.moduleSpecifier) && isValueImport(n);
    const badExport = ts.isExportDeclaration(n) && isRendererSpec(n.moduleSpecifier) && !n.isTypeOnly &&
      (!n.exportClause || !ts.isNamedExports(n.exportClause) || n.exportClause.elements.some(x => !x.isTypeOnly));
    const badCall = ts.isCallExpression(n) && isRendererSpec(n.arguments[0]) &&
      !(ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'resolve');
    const badAlias = ts.isImportEqualsDeclaration(n) && !n.isTypeOnly && ts.isExternalModuleReference(n.moduleReference) && isRendererSpec(n.moduleReference.expression);
    if (badImport || badExport || badCall || badAlias) issues.push({ 行: lineNo(sf, n), text: entryHint });
  });
  return issues;
};

const renderTestRegex = /^(engine|库|作品)\/.*\.test\.[cm]?[jt]sx?$/;
const testPipelineHint = '渲染层的测试不许 import pipeline/：资产走 vitest 的 asset: 插件（pipeline/资产/vitest插件.ts，直接 import 被测模块），要引管线就把测试放到 pipeline/ 下';
const viModuleMethods = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock']);

/**
 * engine/、库/、作品/ 下的测试不许引 pipeline/（用户 11-17 定：不加别名，用检查拦越层）。测试不在 esbuild 打包图里，edgeIssue 查不到，这里解析源码单查：
 * import / export from、import()、require、import x = require、import('…') 类型、vi.mock 一类的模块路径都算，类型导入也算（同 edgeIssue 渲染层不许引 pipeline 的类型）。
 */
export const checkTestPipelineImport = (file: string, sourceText: string): { 行: number; text: string }[] => {
  if (!renderTestRegex.test(file)) return [];
  const issues: { 行: number; text: string }[] = [];
  const sf = parseSource(file, sourceText);
  const check = (n: ts.Node, spec: ts.Node | undefined) => {
    if (!spec || !ts.isStringLiteralLike(spec)) return;
    const target = spec.text.startsWith('.') ? path.posix.join(path.posix.dirname(file), spec.text) : spec.text;
    if (target.startsWith('pipeline/')) issues.push({ 行: lineNo(sf, n), text: `${testPipelineHint}：${file} → ${target}` });
  };
  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) check(n, n.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) check(n, n.moduleReference.expression);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) check(n, n.argument.literal);
    else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const isLoad = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require') ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'vi' && viModuleMethods.has(callee.name.text));
      if (isLoad) check(n, n.arguments[0]);
    }
  });
  return issues;
};

export const checkStructure = async (c: CheckContext, report: CheckReport) => {
  await checkLayers(c, report);
  checkCode(c, report);
  for (const p of c.file()) {
    if (renderTestRegex.test(p)) for (const q of checkTestPipelineImport(p, c.读(p))) report.错(q.text, p, q.行);
    if (!p.startsWith('pipeline/') || !/\.[cm]?[jt]s$/.test(p)) continue;
    for (const q of checkRendererEntry(p, c.读(p))) report.错(q.text, p, q.行);
  }
  checkSectionModelReg(c, report);
};
