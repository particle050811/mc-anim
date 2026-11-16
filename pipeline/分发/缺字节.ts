// 公开仓库只带 随仓库.toml 列的段要用的字节（docs/决策/0005-随仓库发字节.md），Remotion 却一次把整部作品的 段/、核对/ 都打进一个包。
// 数据根里没有的字节（私有的，或九胡、李樱这类没随仓库发的；随仓库发的打包前已补进 store，不会缺）打包不失败、也不悄悄换图：
//   段入口（画面.tsx、叠层*.tsx）闭包里碰到缺字节资产的，整个入口换成一渲就抛错的组件。只换 asset: 不够：库/角色/九胡.tsx 这类在模块顶层就取字节，
//   注册.tsx 注册时挨个求值所有段的画面，一抛整个包都读不出 Composition；
//   别处的 asset:<id> 换成一取值就抛错的占位模块（段.ts、外壳闭包里缺的，在模块顶层取就还是会拖垮包，打包前报出来）。
// 数据根字节都在（主检出）时什么都不做。接在 webpack改写 外面（渲/渲.ts 的 打包、remotion.config.ts），不改 webpack.ts：它的文本进所有段指纹的「打包规则」。
// 指纹：闭包里有缺字节资产的段记一项 缺字节（指纹/指纹.ts），补上字节就过期。
import fs from 'node:fs';
import path from 'node:path';
import type { WebpackOverrideFn } from '@remotion/bundler';
import { dataRoot } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { workName } from '../环境/作品.ts';
import { closure, CheckContext, type DepGraph } from '../源码/上下文.ts';
import { bytesPath, readWorkAssetLock, type AssetLock } from '../资产/资产锁.ts';

/** 这些 id 里登记了、字节又不在数据根的（不管私有还是提取） */
export const missingBytes = (ids: Iterable<string>, assetLock: AssetLock, dataRoot: string): string[] =>
  [...new Set(ids)].filter((id) => assetLock[id] && !fs.existsSync(bytesPath(assetLock[id]!, dataRoot))).sort();

const describeMissing = (ids: string[]) => `${ids.slice(0, 3).map((id) => `「${id}」`).join('')}${ids.length > 3 ? ` 等 ${ids.length} 件` : ''}`;

/** asset: 的占位：CommonJS 带 __esModule，webpack 的默认导入在用的地方才取 default，取的时候抛错 */
export const placeholderSource = (id: string, expectedPath: string) => {
  const message = `资产「${id}」的字节不在 ${expectedPath}（公开仓库只带 随仓库.toml 列的段要用的、不带私有的），用到它的画面渲不了`;
  return `// anim 生成：${message}\nmodule.exports = { __esModule: true, get default() { throw new Error(${JSON.stringify(message)}); } };\n`;
};

/** 段入口的占位：default 是一渲就抛错的组件，注册照常 */
export const entryPlaceholderSource = (entryName: string, ids: string[]) => {
  const message = `${entryName} 要的字节 ${describeMissing(ids)} 不在数据根（公开仓库只带 随仓库.toml 列的段要用的、不带私有的），这段渲不了`;
  return `// anim 生成：${message}\nmodule.exports = { __esModule: true, default: function 缺字节() { throw new Error(${JSON.stringify(message)}); } };\n`;
};

const writePlaceholder = (pluginName: string, sourceText: string, dataRoot: string) => {
  const file = path.join(dataRoot, 'cache', '缺字节', `${pluginName}.cjs`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== sourceText) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.写入中-${process.pid}`;
    fs.writeFileSync(tmp, sourceText);
    fs.renameSync(tmp, file);
  }
  return file;
};

/** 比路径用：Windows 上盘符大小写、分隔符可能不同 */
const canonicalPath = (p: string) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));

export type MissingBytesEntry = {
  /** 能换的段入口（相对代码根的正斜杠路径）→ 闭包里缺的 id */
  replaced: Map<string, string[]>;
  /** 换不了的入口（段.ts、作品 index.ts、设置.ts）→ 闭包里缺的 id */
  cannotReplace: Map<string, string[]>;
};

/** 按依赖图挑出闭包碰到缺字节资产的入口：注册.tsx 的 webpackContext 收的 段/、核对/ 下每段的 段.ts、画面.tsx、叠层*.tsx，加外壳 */
export const pickMissingBytesEntry = (depGraph: DepGraph, workDir: string, missing: ReadonlySet<string>): MissingBytesEntry => {
  const r: MissingBytesEntry = { replaced: new Map(), cannotReplace: new Map() };
  const segFilePattern = /^(段|核对)\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/;
  const entries = [...depGraph.edges.keys()].filter((p) => p.startsWith(`${workDir}/`) && segFilePattern.test(p.slice(workDir.length + 1)));
  for (const f of [...entries, `${workDir}/index.ts`, 'engine/段/设置.ts'].sort()) {
    if (!depGraph.edges.has(f)) continue;
    const ids = [...new Set([...closure(depGraph, [f])].flatMap((x) => depGraph.asset.get(x) ?? []))].filter((id) => missing.has(id)).sort();
    if (!ids.length) continue;
    (/\/(画面\.tsx|叠层[^/]*\.tsx)$/.test(f) ? r.replaced : r.cannotReplace).set(f, ids);
  }
  return r;
};

type ResolveRequest = { request: string; context?: string };
type Compiler = { hooks: { normalModuleFactory: { tap: (name: string, fn: (nmf: { hooks: { beforeResolve: { tap: (o: { name: string; stage: number }, fn: (d: ResolveRequest) => void) => void } } }) => void) => void } } };

/** 排在 webpack.ts 的 资产解析插件 前面：缺字节的段入口、asset: 改成占位模块的路径，那边见不是 asset: 就不管 */
export class MissingBytePlaceholderPlugin {
  readonly assetLock: AssetLock;
  readonly root: string;
  readonly entryMap: Map<string, { name: string; ids: string[] }>;
  readonly replaced: Set<string> = new Set();
  /** 入口：绝对路径 → 相对路径和缺的 id */
  constructor(assetLock: AssetLock, dataRoot: string, entryMap: Map<string, { name: string; ids: string[] }> = new Map()) {
    this.assetLock = assetLock;
    this.root = dataRoot;
    this.entryMap = new Map([...entryMap].map(([k, v]) => [canonicalPath(k), v]));
  }
  apply(compiler: Compiler) {
    compiler.hooks.normalModuleFactory.tap('anim-缺字节', (nmf) => {
      nmf.hooks.beforeResolve.tap({ name: 'anim-缺字节', stage: -10 }, (data) => {
        if (data.request.startsWith('asset:')) {
          const id = data.request.slice('asset:'.length);
          const entry = this.assetLock[id];
          if (!entry || fs.existsSync(bytesPath(entry, this.root))) return;
          if (!this.replaced.has(id)) console.error(`!! 资产「${id}」的字节不在数据根，打进包的是占位（用到它的画面渲的时候报错）`);
          this.replaced.add(id);
          data.request = writePlaceholder(entry.sha256, placeholderSource(id, bytesPath(entry, this.root)), this.root);
          return;
        }
        if (!this.entryMap.size || !data.context || !/^\.\.?[/\\]/.test(data.request)) return;
        const e = this.entryMap.get(canonicalPath(path.resolve(data.context, data.request)));
        if (!e) return;
        if (!this.replaced.has(e.name)) console.error(`!! ${e.name} 要的字节 ${describeMissing(e.ids)} 不在数据根，这段打进包的是占位（渲它会报错）`);
        this.replaced.add(e.name);
        data.request = writePlaceholder(`入口-${e.name.replace(/[/\\:]/g, '_')}`, entryPlaceholderSource(e.name, e.ids), this.root);
      });
    });
  }
}

/** 数据根里缺了这部作品锁里的字节时，用 anim check 的依赖图挑出要换的段入口；都在就不建图 */
export const computeMissingBytesEntry = async (assetLock: AssetLock, dataRoot: string): Promise<MissingBytesEntry | undefined> => {
  const missing = new Set(missingBytes(Object.keys(assetLock), assetLock, dataRoot));
  if (!missing.size) return undefined;
  const c = new CheckContext(codeRoot(), { work: workName() });
  try {
    return pickMissingBytesEntry(await c.depGraph(), c.workDir, missing);
  } finally {
    c.finalize();
  }
};

/** 给 webpack改写 套一层：插件放在最前面 */
export const fillMissingBytePlaceholders =
  (rewrite: WebpackOverrideFn, workRoot: string): WebpackOverrideFn =>
  async (config) => {
    const c = await rewrite(config);
    const assetLock = readWorkAssetLock(workRoot);
    const root = dataRoot();
    const entryReport = await computeMissingBytesEntry(assetLock, root);
    for (const [f, ids] of entryReport?.cannotReplace ?? []) console.error(`!! ${f} 的闭包要的字节 ${describeMissing(ids)} 不在数据根，换不了整段；在模块顶层取的话整个包都读不出 Composition`);
    const placeholderMap = new Map([...(entryReport?.replaced ?? [])].map(([f, ids]) => [path.join(codeRoot(), ...f.split('/')), { name: f, ids }]));
    return { ...c, plugins: [new MissingBytePlaceholderPlugin(assetLock, root, placeholderMap), ...(c.plugins ?? [])] };
  };
