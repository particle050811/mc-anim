// anim check 各条规则共用的上下文：仓库根下的文件表、esbuild 依赖图、纯模块的执行结果，都只算一次。
// 根可以是任意目录（测试拿临时目录造一个小仓库），所以这里不调 代码根()，路径一律相对 根、用正斜杠。
// 一次只查一部作品（作品/<名>/）：别的作品的文件不进依赖图、纯模块、例外扫描，作品自己的表（清单、规矩、台词、旧名）从 作品目录 取。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build, type Plugin } from 'esbuild';
import { parse } from 'smol-toml';
import { esbuildAliasPlugin, nonCodeLoaders } from '../资产/esbuild插件.ts';
import { readAssetLock, type AssetLock } from '../资产/资产锁.ts';
import { WorkSelectError } from '../环境/作品.ts';

export const ruleNames = ['types', 'structure', 'layers', 'manifest', 'load', 'lines', 'assets', 'rules', 'platform', 'dupes', 'time', 'idents', 'debug', 'terrain'] as const;
export type RuleKind = (typeof ruleNames)[number];

export type Issue = { file?: string; 行?: number; text: string };

export class CheckReport {
  violations: Issue[] = [];
  pendingMigration: Issue[] = [];
  /** 提示：要处理但平时不算违规（发布锁和代码不一致，发布前才卡，用户 11-16 定） */
  notices: Issue[] = [];
  skipped: string[] = [];
  infoLines: string[] = [];
  错(messageText: string, file?: string, lineNo?: number) {
    this.violations.push({ text: messageText, file: file, 行: lineNo });
  }
  待(messageText: string, file?: string) {
    this.pendingMigration.push({ text: messageText, file: file });
  }
  notice(messageText: string, file?: string) {
    this.notices.push({ text: messageText, file: file });
  }
}

/** 代码文件（参与依赖图、语法扫描的） */
export const codeExtRegex = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const isTestOrDecl = (p: string) => /\.test\.[cm]?[jt]sx?$/.test(p) || /\.d\.[cm]?ts$/.test(p);
/** 渲染代码所在的层（打进 Remotion 包的） */
export const renderLayerPrefixes = ['engine/', '库/', '作品/'];
export const isRenderCode = (p: string) => renderLayerPrefixes.some((x) => p.startsWith(x)) && codeExtRegex.test(p) && !isTestOrDecl(p);

/**
 * 纯模块：pipeline 直接 import、Node 里直接执行的作品文件和 engine/段 的框架，闭包里不许有 react、three、remotion。
 * 方案三-2 列的是 清单.ts、段.ts、时间线.ts、末态.ts；段定义.ts、设置值.ts 也被 pipeline import，一并算；
 * 段框架（docs/新段.md）的 时间线、歌网格、声音助手、窗口段、场声音、老段接续、清单工具、核对段 是 段.ts、场时间线、清单.ts 引的，anim cues 也直接 import。
 * 段、场、核对目录下的 环境.ts（<环境> 的声明）也是：check 执行它、查声明。
 * 地形环境 只有两个环境变量名：页面和 pipeline/渲/地形注入.ts 共用。
 * 预载 是读组合时点名预载哪几段的环境变量：注册工厂.tsx 和 pipeline/渲/渲.ts、测速.ts 共用。
 * engine/core/调试开关.ts 是试看、调试开关的登记表：页面的 trialParams 和 pipeline 的 anim trial list、核对、check 共用。
 * engine/core/数据读取.ts 是数据源接口：页面源、pipeline/世界/node数据源.ts 共用报错写法和去重表。
 */
// 区段模型只做 TypedArray 与字节转换，编码、检查和浏览器共用同一份格式定义。
const enginePureModules = ['段定义', '设置值', '时间线', '歌网格', '声音助手', '窗口段', '场声音', '老段接续', '清单工具', '地形环境', '预载', '出帧', '按时取值', '核对段'].map((x) => `engine/段/${x}.ts`).concat('engine/voxel/区段模型.ts', 'engine/core/调试开关.ts', 'engine/core/数据读取.ts');
export const isPureModule = (p: string) =>
  enginePureModules.includes(p) || p === 'engine/anim/动作体检.ts' ||
  /^作品\/[^/]+\/清单\.ts$/.test(p) ||
  /^作品\/[^/]+\/(段|核对)\/[^/]+\/段\.ts$/.test(p) ||
  /^作品\/[^/]+\/场\/[^/]+\/(时间线|末态)\.ts$/.test(p) ||
  isEnvDecl(p);

/** 段、场、核对目录下的 环境.ts：<环境> 的描述或环境轨（engine/light/环境.ts），纯数据，anim check 照 环境声明.ts 查 */
export const isEnvDecl = (p: string) => /^作品\/[^/]+\/(段|核对|场)\/[^/]+\/环境\.ts$/.test(p);

export type Edge = { dest: string; external: boolean };
export type DepGraph = {
  /** 文件 → 它静态 import 的东西（仓库内文件是相对路径，外部是包名或 node: 模块） */
  edges: Map<string, Edge[]>;
  /** 文件 → 它 import 的 asset: id */
  asset: Map<string, string[]>;
  errors: string[];
};

/** 从入口们沿依赖图走到的全部仓库内文件 */
export const closure = (depGraph: DepGraph, entries: string[]) => {
  const visited = new Set(entries);
  const queue = [...entries];
  while (queue.length) for (const e of depGraph.edges.get(queue.shift()!) ?? []) if (!e.external && !visited.has(e.dest)) visited.add(e.dest), queue.push(e.dest);
  return visited;
};

const pkgName = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

/** asset:<id> 一律解析成字符串模块，记下谁引了哪个 id；锁里有没有交给 资产 规则查，好一次报全 */
const looseAssetPlugin = (importRecord?: Map<string, string[]>): Plugin => ({
  name: 'anim-检查-资产',
  setup(b) {
    b.onResolve({ filter: /^asset:/ }, (args) => {
      const id = args.path.slice('asset:'.length);
      if (importRecord && args.importer) {
        const k = args.importer;
        (importRecord.get(k) ?? importRecord.set(k, []).get(k)!).push(id);
      }
      return { path: id, namespace: 'anim-检查-资产' };
    });
    b.onLoad({ filter: /.*/, namespace: 'anim-检查-资产' }, (args) => ({ contents: `export default ${JSON.stringify('asset:' + args.path)};`, loader: 'js' }));
  },
});

export type LoadResult = { modules?: Record<string, unknown>; errors?: string };

export class CheckContext {
  readonly root: string;
  readonly deep: boolean;
  /** --release：发布前、推送前的严格档，发布锁对不上算违规、还查 Release 上附件齐不齐 */
  readonly release: boolean;
  readonly dataRoot: string | undefined;
  /** 规矩表出处 M/ 的根；不给就用配置 记忆（ANIM_MEMORY） */
  readonly memoryRoot: string | undefined;
  #cachedFiles?: string[];
  #graphCache?: Promise<DepGraph>;
  #loadCache = new Map<string, Promise<LoadResult>>();
  #tmp?: string;
  #workName?: string;
  #workPrivateCache?: boolean;

  constructor(root: string, options: { depthCheck?: boolean; release?: boolean; dataRoot?: string; memoryRoot?: string; work?: string } = {}) {
    this.root = fs.realpathSync(root);
    this.deep = options.depthCheck ?? false;
    this.release = options.release ?? false;
    this.dataRoot = options.dataRoot;
    this.memoryRoot = options.memoryRoot;
    this.#workName = options.work;
  }

  /** 查的是哪部作品：给了就用；没给时 作品/ 下只有一部（有 清单.ts 的目录）就用它，否则报错 */
  get workName(): string {
    if (this.#workName === undefined) {
      const matches = this.exists('作品')
        ? fs.readdirSync(this.absPath('作品'), { withFileTypes: true }).filter((e) => e.isDirectory() && this.exists(`作品/${e.name}/清单.ts`)).map((e) => e.name).sort()
        : [];
      if (matches.length !== 1) throw new WorkSelectError(matches.length ? `有 ${matches.length} 部作品（${matches.join('、')}），用 --work <名> 指定查哪部` : '一部作品都没有（作品/<名>/清单.ts）');
      this.#workName = matches[0]!;
    }
    return this.#workName;
  }
  /** 作品目录（相对 根），如 作品/<名> */
  get workDir() {
    return `作品/${this.workName}`;
  }
  workPath = (p: string) => `${this.workDir}/${p}`;
  /** 作品/ 下、不是这次查的作品的文件 */
  isOtherWork = (p: string) => p.startsWith('作品/') && !p.startsWith(`${this.workDir}/`);
  /** 文件() 去掉别的作品的 */
  workFiles = () => this.file().filter((p) => !this.isOtherWork(p));
  /** 本作品私有：作品目录被 .gitignore 挡住（0004：作品默认公开，要私有的逐个挡）；根不在 git 里就当公开 */
  get isWorkPrivate(): boolean {
    if (this.#workPrivateCache === undefined) {
      try {
        // 末尾带 /，.gitignore 里只对目录生效的规则（/作品/<名>/、!/作品/<名>/）才对得上
        execFileSync('git', ['-C', this.root, 'check-ignore', '-q', `${this.workDir}/`], { stdio: 'ignore' });
        this.#workPrivateCache = true;
      } catch {
        this.#workPrivateCache = false;
      }
    }
    return this.#workPrivateCache;
  }

  absPath = (p: string) => path.join(this.root, ...p.split('/'));
  exists = (p: string) => fs.existsSync(this.absPath(p));
  读 = (p: string) => fs.readFileSync(this.absPath(p), 'utf8');
  相对 = (abs: string) => path.relative(this.root, abs).split(path.sep).join('/');

  /** dir（相对 根）下 git 跟踪的 + 没被忽略的新文件；dir 不是 git 仓库的根就返回 null */
  #listGitFiles(dir: string): string[] | null {
    try {
      const abs = this.absPath(dir || '.');
      const top = execFileSync('git', ['-C', abs, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (fs.realpathSync(top) !== fs.realpathSync(abs)) return null;
      const out = execFileSync('git', ['-C', abs, '-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 1 << 28,
      });
      return [...new Set(out.split('\0').filter(Boolean))].map((p) => (dir ? `${dir}/${p}` : p)).filter((p) => this.exists(p));
    } catch {
      return null;
    }
  }

  /** dir 下整个走一遍（跳过 node_modules、.git、.venv） */
  #walk(dir: string, fileList: string[]) {
    for (const e of fs.readdirSync(this.absPath(dir || '.'), { withFileTypes: true })) {
      const p = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!['node_modules', '.git', '.venv', '__pycache__'].includes(e.name)) this.#walk(p, fileList);
      } else fileList.push(p);
    }
  }

  /**
   * 仓库里的文件（git 跟踪的 + 没被忽略的新文件）；不在 git 里就整个目录走一遍。
   * 作品/ 下被 .gitignore 挡住的私有作品（自己是 git 仓库或普通目录）也要查，按各自的根另列（方案批评补充二-1）。
   */
  file(): string[] {
    if (this.#cachedFiles) return this.#cachedFiles;
    let fileList = this.#listGitFiles('');
    if (!fileList) {
      fileList = [];
      this.#walk('', fileList);
    }
    if (this.exists('作品')) {
      for (const e of fs.readdirSync(this.absPath('作品'), { withFileTypes: true })) {
        const d = `作品/${e.name}`;
        if (!e.isDirectory() || fileList.some((p) => p.startsWith(`${d}/`))) continue;
        const privateFiles = this.#listGitFiles(d);
        if (privateFiles) fileList.push(...privateFiles);
        else this.#walk(d, fileList);
      }
    }
    return (this.#cachedFiles = [...new Set(fileList)].sort());
  }

  /** 参与依赖图的代码文件：engine、库、本作品、pipeline 下的源码（不含测试和 .d.ts） */
  codeFiles = () => this.workFiles().filter((p) => /^(engine|库|作品|pipeline)\//.test(p) && codeExtRegex.test(p) && !isTestOrDecl(p));

  /**
   * 全仓库一次 esbuild（每个代码文件都当入口），从 metafile 拿真实的 import 边。类型导入被擦掉，不算依赖。
   * 有打包错误时 esbuild 不给 metafile，就逐个入口重打，能打的照样收边，好一次把别的违规报全；错误记进 错误。
   */
  depGraph(): Promise<DepGraph> {
    return (this.#graphCache ??= (async () => {
      const depGraph: DepGraph = { edges: new Map(), asset: new Map(), errors: [] };
      const entries = this.codeFiles();
      if (!entries.length) return depGraph;
      const assetRecords = new Map<string, string[]>();
      const runBuild = (entryPoints: string[]) =>
        build({
          entryPoints: entryPoints,
          absWorkingDir: this.root,
          bundle: true,
          write: false,
          metafile: true,
          outdir: 'out',
          platform: 'node',
          format: 'esm',
          jsx: 'automatic',
          packages: 'external',
          loader: { ...nonCodeLoaders, '.json': 'json' },
          plugins: [esbuildAliasPlugin(this.root), looseAssetPlugin(assetRecords)],
          logLevel: 'silent',
        });
      const collectEdges = (inputs: Record<string, { imports: { path: string; external?: boolean }[] }>) => {
        for (const [p, info] of Object.entries(inputs)) {
          if (p.includes(':')) continue;
          const fromFile = p.split(path.sep).join('/');
          depGraph.edges.set(
            fromFile,
            info.imports
              .filter((i) => !i.path.startsWith('anim-检查-资产:'))
              .map((i) => (i.external ? { dest: i.path.startsWith('node:') ? i.path : pkgName(i.path), external: true } : { dest: i.path.split(path.sep).join('/'), external: false })),
          );
        }
      };
      const recordError = (e: unknown) => {
        const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
        const messages = errs?.length ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line}：${x.text}` : x.text)) : [(e as Error).message];
        for (const t of messages) if (!depGraph.errors.includes(t)) depGraph.errors.push(t);
      };
      try {
        collectEdges((await runBuild(entries)).metafile.inputs);
      } catch (e) {
        recordError(e);
        for (const entry of entries) {
          try {
            collectEdges((await runBuild([entry])).metafile.inputs);
          } catch (e2) {
            recordError(e2);
          }
        }
      }
      for (const [abs, ids] of assetRecords) depGraph.asset.set(this.相对(abs), [...new Set(ids)]);
      return depGraph;
    })());
  }

  /** 在 Node 里执行一个纯模块（esbuild 连依赖打成一个文件再 import），拿到导出；throw 了就记下错误 */
  loadModule(p: string): Promise<LoadResult> {
    let r = this.#loadCache.get(p);
    if (!r) {
      r = (async (): Promise<LoadResult> => {
        try {
          const out = await build({
            entryPoints: [this.absPath(p)],
            absWorkingDir: this.root,
            bundle: true,
            write: false,
            platform: 'node',
            format: 'esm',
            jsx: 'automatic',
            loader: { ...nonCodeLoaders, '.json': 'json' },
            plugins: [esbuildAliasPlugin(this.root), looseAssetPlugin()],
            logLevel: 'silent',
          });
          this.#tmp ??= fs.mkdtempSync(path.join(os.tmpdir(), 'anim-检查-'));
          const file = path.join(this.#tmp, `${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}.mjs`);
          fs.writeFileSync(file, out.outputFiles[0]!.text, 'utf8');
          return { modules: (await import(pathToFileURL(file).href)) as Record<string, unknown> };
        } catch (e) {
          const errs = (e as { errors?: { text: string }[] }).errors;
          return { errors: errs?.length ? errs.map((x) => x.text).join('；') : e instanceof Error ? e.message : String(e) };
        }
      })();
      this.#loadCache.set(p, r);
    }
    return r;
  }

  finalize() {
    if (this.#tmp) fs.rmSync(this.#tmp, { recursive: true, force: true });
  }

  // ---------- 常用的表 ----------

  readToml = (p: string): Record<string, unknown> | null => (this.exists(p) ? (parse(this.读(p)) as Record<string, unknown>) : null);
  readJson = (p: string): unknown => (this.exists(p) ? JSON.parse(this.读(p)) : null);
  /** 本作品用的两份资产锁：共用的和作品资产表那一侧的（目录不在就是空的） */
  assetLocks = (): { 共用: AssetLock; 作品: AssetLock } => ({
    共用: readAssetLock(this.absPath('assets/资产锁')),
    作品: readAssetLock(this.absPath(this.workPath('资产锁'))),
  });
}
