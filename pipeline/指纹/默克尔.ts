// 默克尔指纹：模块哈希 = 规范化文本里每个 import 说明符换成目标的哈希后的 sha256。规范化用 esbuild transform（读仓库 tsconfig，去注释、类型、格式），
// 文件路径和说明符的写法都不进哈希，所以只改注释、挪文件、改 import 写法（相对路径换别名）都不改哈希。依赖图用 esbuild bundle 取，和打包同一套解析和插件。
// 时刻的 依据 说明文字也不进（去依据.ts）。这条没换 默克尔算法 的名字：换名字等于全部模块的哈希都变，而不含依据的模块本来就没变。
// 叶子：asset:<id> 记资产锁 sha；npm 包记 lockfile 版本加子路径；json、图片、音频等非代码文件记字节 sha。
// new URL('./x', import.meta.url)（Worker）当一条边；import.meta.webpackContext 只许出现在 注册.tsx，参数作为代码文本进哈希；有环的按强连通分量整体哈希。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { build, transform, type Loader, type Plugin } from 'esbuild';
import ts from 'typescript';
import { codeRoot } from '../环境/路径.ts';
import { esbuildAliasPlugin, esbuildAssetPlugin, nonCodeLoaders, type AssetRecordMap } from '../资产/esbuild插件.ts';
import { workRoot } from '../环境/作品.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { stripBasis } from './去依据.ts';

export const MERKLE_ALGORITHM = 'merkle-v1';
const sha = (x: crypto.BinaryLike) => crypto.createHash('sha256').update(x).digest('hex');

/** 影响 esbuild 输出的编译选项（webpack 那边 Remotion 的 esbuild-loader 也读仓库 tsconfig）；paths 只管解析，解析结果已在哈希里 */
const outputAffectingOptions = ['target', 'jsx', 'jsxFactory', 'jsxFragmentFactory', 'jsxImportSource', 'useDefineForClassFields', 'verbatimModuleSyntax', 'importsNotUsedAsValues', 'preserveValueImports', 'experimentalDecorators', 'alwaysStrict', 'strict'];
export const compileOptions = (): Record<string, unknown> => {
  const o = (JSON.parse(fs.readFileSync(path.join(codeRoot(), 'tsconfig.json'), 'utf8')).compilerOptions ?? {}) as Record<string, unknown>;
  return Object.fromEntries(outputAffectingOptions.filter((k) => k in o).map((k) => [k, o[k]]));
};

const codeLoaders: Record<string, Loader> = { '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx' };
const pkgName = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

/**
 * 读 pnpm-lock.yaml 里根项目直接依赖的版本（用户 11-06 定换 pnpm）。代码 import 的包都是直接依赖，只读 importers['.'] 就够。
 * 取出来的要和以前 package-lock 记的一字不差，否则全片指纹都变：去掉 peer 后缀「(react@…)」；git 依赖的 version 是 tarball 地址，到 packages 里取包自己的 version。
 */
export const parsePnpmLock = (text: string): Map<string, string> => {
  const versionMap = new Map<string, string>();
  const importersText = text.split(/^importers:\n/m)[1]?.split(/^\S/m)[0] ?? '';
  const packageSection = importersText.split(/^ {2}\S.*:\n/m)[1] ?? '';
  for (const m of packageSection.matchAll(/^ {6}'?(.+?)'?:\n {8}specifier: .*\n {8}version: (.+)$/gm)) {
    const pkgVersion = m[2]!.trim().replace(/\(.*$/, '');
    if (/^\d/.test(pkgVersion)) { versionMap.set(m[1]!, pkgVersion); continue; }
    const pkgBlock = text.split(`\n  '${m[1]}@${pkgVersion}':\n`)[1] ?? text.split(`\n  ${m[1]}@${pkgVersion}:\n`)[1] ?? '';
    const declaredVersion = /^ {4}version: (\S+)$/m.exec(pkgBlock.split(/\n\n/)[0]!)?.[1];
    versionMap.set(m[1]!, declaredVersion ?? pkgVersion);
  }
  return versionMap;
};
let lockCache: Map<string, string> | undefined;
export const lockedVersion = (pack: string): string | null => {
  lockCache ??= parsePnpmLock(fs.readFileSync(path.join(codeRoot(), 'pnpm-lock.yaml'), 'utf8'));
  return lockCache.get(pack) ?? null;
};

const transformCache = new Map<string, string>();
/** 去掉注释、类型和格式差异后的文本（同一份源码只转一次） */
export const normalizeSource = async (source: string, loader: Loader): Promise<string> => {
  const options = compileOptions();
  const key = sha(`${loader}\0${JSON.stringify(options)}\0${source}`);
  let t = transformCache.get(key);
  if (t === undefined) {
    t = (await transform(source, { loader, jsx: 'automatic', target: 'esnext', charset: 'utf8', legalComments: 'none', tsconfigRaw: { compilerOptions: options as never } })).code;
    transformCache.set(key, t);
  }
  return t;
};

type Target = { 路径: string; namespaceName: string; external: boolean };
type Edge = { specifier: string; 目标: Target };

/** 记下每条 import 的「说明符 → 解析结果」：自己先 build.resolve 一遍（带记号防递归），结果原样交回 */
const edgeRecordPlugin = (edgesByImporter: Map<string, Edge[]>): Plugin => ({
  name: 'anim-记边',
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind === 'entry-point' || (args.pluginData as { recordEdge?: boolean } | undefined)?.recordEdge) return undefined;
      const r = await b.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, namespace: args.namespace, with: args.with, pluginData: { recordEdge: true } });
      if (r.errors.length) return { errors: r.errors };
      const edgeList = edgesByImporter.get(args.importer) ?? [];
      edgeList.push({ specifier: args.path, 目标: { 路径: r.path, namespaceName: r.namespace, external: r.external } });
      edgesByImporter.set(args.importer, edgeList);
      return { path: r.path, external: r.external, namespace: r.namespace, sideEffects: r.sideEffects, suffix: r.suffix };
    });
  },
});

const newUrlRe = /new\s+URL\(\s*(["'])((?:\.\.?\/)[^"'\n]*)\1\s*,\s*import\.meta\.url\s*\)/g;

export type MerkleDetail = { 模块: Record<string, string>; 资产: Record<string, string> };
export type MerkleResult = { 根: string[]; 明细: MerkleDetail };
export type MerkleOptions = { /** 这条边不跟进去，换成固定占位（外壳到 清单.ts） */ skip?: (importer: string, target: string) => boolean };
/** 一次打包得到的全图：按任意一组入口取结果，和只拿这组入口单独打包算的一样（指纹.test.ts 有等值测试） */
export type MerkleGraph = { 取: (entries: string[]) => MerkleResult };

/** 入口（相对代码根）各自的默克尔哈希，和一份「路径 → 模块哈希」的明细（只给解释差异用） */
export const computeMerkle = async (entries: string[], options: MerkleOptions = {}): Promise<MerkleResult> => (await buildMerkleGraph(entries, options)).取(entries);

/**
 * 一次 esbuild 打包拿到所有入口的依赖图、算好闭包里每个模块的哈希，之后按段取（anim stale 不再逐段打包）。
 * 模块哈希只看它自己和它跟进的下游，环按强连通分量算，所以和从哪组入口出发无关；
 * 明细的 资产、非代码文件按「单独打包这组入口时 esbuild 会读到的文件」取：边全跟（含略过的边），加原文里 Worker 的 new URL。
 */
export const buildMerkleGraph = async (allEntries: string[], options: MerkleOptions = {}): Promise<MerkleGraph> => {
  const root = codeRoot();
  const assets: AssetRecordMap = new Map();
  const edgesByImporter = new Map<string, Edge[]>();
  const extraEntries = new Set<string>();
  /** 代码文件原文里 new URL 指向的文件：单独打包时它们会被当额外入口，读到的文件要算进那组入口 */
  const rawNewUrls = new Map<string, string[]>();
  const entries = [...new Set(allEntries)];
  const inputFiles = new Set<string>();
  // Worker 的 new URL 目标 esbuild 不跟，当额外入口再 build（只 build 新多出来的，边和输入并进来），直到不再多出文件
  for (let thisRound = entries; thisRound.length; ) {
    const r = await build({
      entryPoints: thisRound,
      absWorkingDir: root,
      bundle: true,
      write: false,
      metafile: true,
      outdir: 'out',
      // 只要依赖图不要产物：拆共用块省掉每个入口各出一份整包（几十个段入口时产物从 80 MB 降到 10 MB），不影响解析和 metafile.inputs
      splitting: true,
      platform: 'browser',
      format: 'esm',
      jsx: 'automatic',
      packages: 'external',
      loader: nonCodeLoaders,
      tsconfigRaw: { compilerOptions: compileOptions() as never },
      plugins: [edgeRecordPlugin(edgesByImporter), esbuildAliasPlugin(root), esbuildAssetPlugin(readWorkAssetLock(workRoot()), assets)],
      logLevel: 'silent',
    });
    for (const p of Object.keys(r.metafile.inputs)) if (!p.includes(':')) inputFiles.add(path.resolve(root, p));
    const newEntries: string[] = [];
    for (const f of inputFiles) {
      if (!codeLoaders[path.extname(f)] || rawNewUrls.has(f)) continue;
      const targets: string[] = [];
      for (const m of fs.readFileSync(f, 'utf8').matchAll(newUrlRe)) {
        const targetPath = path.resolve(path.dirname(f), m[2]!);
        if (!fs.existsSync(targetPath)) throw new Error(`${path.relative(root, f)}：new URL('${m[2]}', import.meta.url) 指向的文件不存在`);
        targets.push(targetPath);
        if (!inputFiles.has(targetPath) && !extraEntries.has(targetPath)) {
          extraEntries.add(targetPath);
          newEntries.push(path.relative(root, targetPath));
        }
      }
      rawNewUrls.set(f, targets);
    }
    thisRound = newEntries;
  }

  const moduleHashes = new Map<string, string>();
  const leafHash = (t: Target): string | undefined => {
    if (t.namespaceName === 'anim-资产') return `asset:${assets.get(t.路径)}`;
    if (t.external) return `npm:${pkgName(t.路径)}@${lockedVersion(pkgName(t.路径))}${t.路径.slice(pkgName(t.路径).length)}`;
    if (t.namespaceName !== 'file') throw new Error(`默克尔指纹不认识的命名空间 ${t.namespaceName}:${t.路径}`);
    if (!codeLoaders[path.extname(t.路径)]) return `file:${sha(fs.readFileSync(t.路径))}`;
    return undefined;
  };

  // 每个代码模块：规范化文本、说明符位置和对应目标
  type ModuleRecord = { 文本: string; loader: Loader; 引用: { 起: number; 止: number; 目标: Target }[] };
  const modules = new Map<string, ModuleRecord>();
  const readModule = async (f: string): Promise<ModuleRecord> => {
    const cached = modules.get(f);
    if (cached) return cached;
    const loader = codeLoaders[path.extname(f)]!;
    const sourceText = stripBasis(await normalizeSource(fs.readFileSync(f, 'utf8'), loader));
    const relPath = path.relative(root, f).split(path.sep).join('/');
    if (/\bimport\(\s*`/.test(sourceText)) throw new Error(`${relPath}：import() 的说明符要写字面量，不能用模板字符串`);
    if (/\bimport\.meta\.webpackContext\b|\brequire\.context\b/.test(sourceText) && path.basename(f) !== '注册.tsx') throw new Error(`${relPath}：webpackContext 只许在作品的 注册.tsx 里用（指纹按代码文本记它的参数）`);
    const bySpecifier = new Map<string, Target>();
    for (const e of edgesByImporter.get(f) ?? []) {
      const prevTarget = bySpecifier.get(e.specifier);
      if (prevTarget && stableKey(prevTarget) !== stableKey(e.目标)) throw new Error(`${relPath}：同一个说明符 ${e.specifier} 解析到了两个目标`);
      bySpecifier.set(e.specifier, e.目标);
    }
    const refs: ModuleRecord['引用'] = [];
    const seenFiles = new Set<string>();
    for (const imp of ts.preProcessFile(sourceText, true, true).importedFiles) {
      const end = imp.pos + imp.fileName.length + 2;
      const q = sourceText[imp.pos];
      if ((q !== '"' && q !== "'") || sourceText[end - 1] !== q || sourceText.slice(imp.pos + 1, end - 1) !== imp.fileName) throw new Error(`${relPath}：说明符 ${imp.fileName} 的位置对不上`);
      const t = bySpecifier.get(imp.fileName);
      if (!t) throw new Error(`${relPath}：规范化文本里的说明符 ${imp.fileName} 不在 esbuild 的依赖图里（tsconfig 两边不一致？）`);
      refs.push({ 起: imp.pos, 止: end, 目标: t });
      seenFiles.add(imp.fileName);
    }
    for (const m of sourceText.matchAll(newUrlRe)) {
      const targetPath = path.resolve(path.dirname(f), m[2]!);
      const startIndex = m.index! + m[0].indexOf(m[1]! + m[2]!);
      refs.push({ 起: startIndex, 止: startIndex + m[2]!.length + 2, 目标: { 路径: targetPath, namespaceName: 'file', external: false } });
    }
    const missing = [...bySpecifier.keys()].filter((s) => !seenFiles.has(s));
    if (missing.length) throw new Error(`${relPath}：esbuild 依赖图里的说明符 ${missing.join('、')} 在规范化文本里找不到（tsconfig 两边不一致？）`);
    refs.sort((a, b) => a.起 - b.起);
    const m = { 文本: sourceText, loader, 引用: refs };
    modules.set(f, m);
    return m;
  };

  const follow = (f: string, t: Target) => t.namespaceName === 'file' && !t.external && codeLoaders[path.extname(t.路径)] && !options.skip?.(f, t.路径);
  const substituteImports = (f: string, m: ModuleRecord, inCycle?: Set<string>) => {
    let out = '';
    let i = 0;
    for (const r of m.引用) {
      const leaf = leafHash(r.目标);
      const h = leaf ?? (options.skip?.(f, r.目标.路径) ? '略' : inCycle?.has(r.目标.路径) ? '环' : moduleHashes.get(r.目标.路径)!);
      out += `${m.文本.slice(i, r.起)}"«${h}»"`;
      i = r.止;
    }
    return out + m.文本.slice(i);
  };

  // Tarjan：强连通分量按依赖在前的顺序出来，依次算哈希
  const indexByKey = new Map<string, number>();
  const indexByFingerprint = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let n = 0;
  const visit = async (f: string): Promise<void> => {
    indexByKey.set(f, n);
    indexByFingerprint.set(f, n++);
    stack.push(f);
    onStack.add(f);
    const m = await readModule(f);
    for (const r of m.引用) {
      if (!follow(f, r.目标)) continue;
      const g = r.目标.路径;
      if (!indexByKey.has(g)) {
        await visit(g);
        indexByFingerprint.set(f, Math.min(indexByFingerprint.get(f)!, indexByFingerprint.get(g)!));
      } else if (onStack.has(g)) indexByFingerprint.set(f, Math.min(indexByFingerprint.get(f)!, indexByKey.get(g)!));
    }
    if (indexByFingerprint.get(f) !== indexByKey.get(f)) return;
    const component: string[] = [];
    for (;;) {
      const g = stack.pop()!;
      onStack.delete(g);
      component.push(g);
      if (g === f) break;
    }
    const selfLoop = component.length === 1 && m.引用.some((r) => follow(f, r.目标) && r.目标.路径 === f);
    if (component.length === 1 && !selfLoop) {
      moduleHashes.set(f, sha(`anim-${MERKLE_ALGORITHM}\0${m.loader}\0${substituteImports(f, m)}`));
      return;
    }
    const inCycle = new Set(component);
    const texts = component.map((g) => `${modules.get(g)!.loader}\0${substituteImports(g, modules.get(g)!, inCycle)}`).sort();
    const h = sha(`anim-${MERKLE_ALGORITHM}-环\0${texts.join('\0')}`);
    for (const g of component) moduleHashes.set(g, h);
  };
  for (const e of entries) {
    const f = path.resolve(root, e);
    if (codeLoaders[path.extname(f)] && !indexByKey.has(f)) await visit(f);
  }

  const relPath = (f: string) => path.relative(root, f).split(path.sep).join('/');
  const fileHashes = new Map<string, string>();
  const fileSha = (f: string) => {
    let h = fileHashes.get(f);
    if (h === undefined) fileHashes.set(f, (h = `file:${sha(fs.readFileSync(f))}`));
    return h;
  };
  const merkleOf = (entries: string[]): MerkleResult => {
    const absPaths = entries.map((e) => path.resolve(root, e));
    for (const f of absPaths) if (codeLoaders[path.extname(f)] && !moduleHashes.has(f)) throw new Error(`${relPath(f)} 不在建图时给的入口里`);
    const rootHashes = absPaths.map((f) => (codeLoaders[path.extname(f)] ? moduleHashes.get(f)! : fileSha(f)));
    // 跟进的闭包（进哈希的代码模块）
    const followed = new Set<string>();
    const toFollow = absPaths.filter((f) => codeLoaders[path.extname(f)]);
    while (toFollow.length) {
      const f = toFollow.pop()!;
      if (followed.has(f)) continue;
      followed.add(f);
      for (const r of modules.get(f)!.引用) if (follow(f, r.目标)) toFollow.push(r.目标.路径);
    }
    // 单独打包时 esbuild 读到的文件和 asset:（边全跟，加原文的 new URL）
    const readFiles = new Set<string>();
    const usedAssets = new Set<string>();
    const toRead = [...absPaths];
    while (toRead.length) {
      const f = toRead.pop()!;
      if (readFiles.has(f)) continue;
      readFiles.add(f);
      for (const e of edgesByImporter.get(f) ?? []) {
        if (e.目标.namespaceName === 'anim-资产') usedAssets.add(e.目标.路径);
        else if (e.目标.namespaceName === 'file' && !e.目标.external) toRead.push(e.目标.路径);
      }
      toRead.push(...(rawNewUrls.get(f) ?? []));
    }
    const moduleDetail: Record<string, string> = {};
    for (const f of [...followed].sort()) moduleDetail[relPath(f)] = moduleHashes.get(f)!;
    for (const f of [...readFiles].sort()) {
      if (!codeLoaders[path.extname(f)] && !(relPath(f) in moduleDetail)) moduleDetail[relPath(f)] = fileSha(f);
    }
    const assetRegistry = [...usedAssets].sort().map((id) => [id, assets.get(id)!] as const);
    return { 根: rootHashes, 明细: { 模块: moduleDetail, 资产: Object.fromEntries(assetRegistry) } };
  };
  return { 取: merkleOf };
};

const stableKey = (t: Target) => `${t.namespaceName}:${t.external}:${t.路径}`;

/** 单个文件规范化后的哈希，不跟它的 import（打包规则用：webpack.ts 等不跟闭包，免得改 pipeline 别处就全片失效） */
export const textFileHash = async (relPath: string) => {
  const f = path.join(codeRoot(), relPath);
  return sha(`anim-${MERKLE_ALGORITHM}\0${await normalizeSource(fs.readFileSync(f, 'utf8'), codeLoaders[path.extname(f)]!)}`);
};
