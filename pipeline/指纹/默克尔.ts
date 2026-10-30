// 默克尔指纹：模块哈希 = 规范化文本里每个 import 说明符换成目标的哈希后的 sha256。规范化用 esbuild transform（读仓库 tsconfig，去注释、类型、格式），
// 文件路径和说明符的写法都不进哈希，所以只改注释、挪文件、改 import 写法（相对路径换别名）都不改哈希。依赖图用 esbuild bundle 取，和打包同一套解析和插件。
// 叶子：asset:<id> 记资产锁 sha；npm 包记 lockfile 版本加子路径；json、图片、音频等非代码文件记字节 sha。
// new URL('./x', import.meta.url)（Worker）当一条边；import.meta.webpackContext 只许出现在 注册.tsx，参数作为代码文本进哈希；有环的按强连通分量整体哈希。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { build, transform, type Loader, type Plugin } from 'esbuild';
import ts from 'typescript';
import { 代码根 } from '../环境/路径.ts';
import { esbuild别名插件, esbuild资产插件, 非代码loader, type 资产记录 } from '../资产/esbuild插件.ts';
import { 作品根 } from '../环境/作品.ts';
import { 读作品资产锁 } from '../资产/资产锁.ts';

export const 默克尔算法 = 'merkle-v1';
const sha = (x: crypto.BinaryLike) => crypto.createHash('sha256').update(x).digest('hex');

/** 影响 esbuild 输出的编译选项（webpack 那边 Remotion 的 esbuild-loader 也读仓库 tsconfig）；paths 只管解析，解析结果已在哈希里 */
const 影响输出的选项 = ['target', 'jsx', 'jsxFactory', 'jsxFragmentFactory', 'jsxImportSource', 'useDefineForClassFields', 'verbatimModuleSyntax', 'importsNotUsedAsValues', 'preserveValueImports', 'experimentalDecorators', 'alwaysStrict', 'strict'];
export const 编译选项 = (): Record<string, unknown> => {
  const o = (JSON.parse(fs.readFileSync(path.join(代码根(), 'tsconfig.json'), 'utf8')).compilerOptions ?? {}) as Record<string, unknown>;
  return Object.fromEntries(影响输出的选项.filter((k) => k in o).map((k) => [k, o[k]]));
};

const 代码loader: Record<string, Loader> = { '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx' };
const 包名 = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

let lock缓存: Record<string, { version?: string }> | undefined;
export const 锁定版本 = (包: string): string | null => {
  lock缓存 ??= JSON.parse(fs.readFileSync(path.join(代码根(), 'package-lock.json'), 'utf8')).packages as Record<string, { version?: string }>;
  return lock缓存[`node_modules/${包}`]?.version ?? null;
};

const 转换缓存 = new Map<string, string>();
/** 去掉注释、类型和格式差异后的文本（同一份源码只转一次） */
export const 规范化 = async (源码: string, loader: Loader): Promise<string> => {
  const 选项 = 编译选项();
  const key = sha(`${loader}\0${JSON.stringify(选项)}\0${源码}`);
  let t = 转换缓存.get(key);
  if (t === undefined) {
    t = (await transform(源码, { loader, jsx: 'automatic', target: 'esnext', charset: 'utf8', legalComments: 'none', tsconfigRaw: { compilerOptions: 选项 as never } })).code;
    转换缓存.set(key, t);
  }
  return t;
};

type 目标 = { 路径: string; 命名空间: string; 外部: boolean };
type 边 = { 说明符: string; 目标: 目标 };

/** 记下每条 import 的「说明符 → 解析结果」：自己先 build.resolve 一遍（带记号防递归），结果原样交回 */
const 记边插件 = (边表: Map<string, 边[]>): Plugin => ({
  name: 'anim-记边',
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind === 'entry-point' || (args.pluginData as { 记边?: boolean } | undefined)?.记边) return undefined;
      const r = await b.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, namespace: args.namespace, with: args.with, pluginData: { 记边: true } });
      if (r.errors.length) return { errors: r.errors };
      const 表 = 边表.get(args.importer) ?? [];
      表.push({ 说明符: args.path, 目标: { 路径: r.path, 命名空间: r.namespace, 外部: r.external } });
      边表.set(args.importer, 表);
      return { path: r.path, external: r.external, namespace: r.namespace, sideEffects: r.sideEffects, suffix: r.suffix };
    });
  },
});

const 新URL = /new\s+URL\(\s*(["'])((?:\.\.?\/)[^"'\n]*)\1\s*,\s*import\.meta\.url\s*\)/g;

export type 默克尔明细 = { 模块: Record<string, string>; 资产: Record<string, string> };
export type 默克尔结果 = { 根: string[]; 明细: 默克尔明细 };
export type 默克尔选项 = { /** 这条边不跟进去，换成固定占位（外壳到 清单.ts） */ 略过?: (importer: string, 目标: string) => boolean };
/** 一次打包得到的全图：按任意一组入口取结果，和只拿这组入口单独打包算的一样（指纹.test.ts 有等值测试） */
export type 默克尔图 = { 取: (入口: string[]) => 默克尔结果 };

/** 入口（相对代码根）各自的默克尔哈希，和一份「路径 → 模块哈希」的明细（只给解释差异用） */
export const 算默克尔 = async (入口: string[], 选项: 默克尔选项 = {}): Promise<默克尔结果> => (await 建默克尔图(入口, 选项)).取(入口);

/**
 * 一次 esbuild 打包拿到所有入口的依赖图、算好闭包里每个模块的哈希，之后按段取（anim stale 不再逐段打包）。
 * 模块哈希只看它自己和它跟进的下游，环按强连通分量算，所以和从哪组入口出发无关；
 * 明细的 资产、非代码文件按「单独打包这组入口时 esbuild 会读到的文件」取：边全跟（含略过的边），加原文里 Worker 的 new URL。
 */
export const 建默克尔图 = async (全部入口: string[], 选项: 默克尔选项 = {}): Promise<默克尔图> => {
  const 根 = 代码根();
  const 资产: 资产记录 = new Map();
  const 边表 = new Map<string, 边[]>();
  const 额外入口 = new Set<string>();
  /** 代码文件原文里 new URL 指向的文件：单独打包时它们会被当额外入口，读到的文件要算进那组入口 */
  const 原文新URL = new Map<string, string[]>();
  const 入口们 = [...new Set(全部入口)];
  const 输入集 = new Set<string>();
  // Worker 的 new URL 目标 esbuild 不跟，当额外入口再 build（只 build 新多出来的，边和输入并进来），直到不再多出文件
  for (let 这轮 = 入口们; 这轮.length; ) {
    const r = await build({
      entryPoints: 这轮,
      absWorkingDir: 根,
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
      loader: 非代码loader,
      tsconfigRaw: { compilerOptions: 编译选项() as never },
      plugins: [记边插件(边表), esbuild别名插件(根), esbuild资产插件(读作品资产锁(作品根()), 资产)],
      logLevel: 'silent',
    });
    for (const p of Object.keys(r.metafile.inputs)) if (!p.includes(':')) 输入集.add(path.resolve(根, p));
    const 新入口: string[] = [];
    for (const f of 输入集) {
      if (!代码loader[path.extname(f)] || 原文新URL.has(f)) continue;
      const 目标们: string[] = [];
      for (const m of fs.readFileSync(f, 'utf8').matchAll(新URL)) {
        const 目标 = path.resolve(path.dirname(f), m[2]!);
        if (!fs.existsSync(目标)) throw new Error(`${path.relative(根, f)}：new URL('${m[2]}', import.meta.url) 指向的文件不存在`);
        目标们.push(目标);
        if (!输入集.has(目标) && !额外入口.has(目标)) {
          额外入口.add(目标);
          新入口.push(path.relative(根, 目标));
        }
      }
      原文新URL.set(f, 目标们);
    }
    这轮 = 新入口;
  }

  const 模块哈希 = new Map<string, string>();
  const 叶子 = (t: 目标): string | undefined => {
    if (t.命名空间 === 'anim-资产') return `asset:${资产.get(t.路径)}`;
    if (t.外部) return `npm:${包名(t.路径)}@${锁定版本(包名(t.路径))}${t.路径.slice(包名(t.路径).length)}`;
    if (t.命名空间 !== 'file') throw new Error(`默克尔指纹不认识的命名空间 ${t.命名空间}:${t.路径}`);
    if (!代码loader[path.extname(t.路径)]) return `file:${sha(fs.readFileSync(t.路径))}`;
    return undefined;
  };

  // 每个代码模块：规范化文本、说明符位置和对应目标
  type 模块 = { 文本: string; loader: Loader; 引用: { 起: number; 止: number; 目标: 目标 }[] };
  const 模块们 = new Map<string, 模块>();
  const 读模块 = async (f: string): Promise<模块> => {
    const 有 = 模块们.get(f);
    if (有) return 有;
    const loader = 代码loader[path.extname(f)]!;
    const 文本 = await 规范化(fs.readFileSync(f, 'utf8'), loader);
    const 相对 = path.relative(根, f).split(path.sep).join('/');
    if (/\bimport\(\s*`/.test(文本)) throw new Error(`${相对}：import() 的说明符要写字面量，不能用模板字符串`);
    if (/\bimport\.meta\.webpackContext\b|\brequire\.context\b/.test(文本) && path.basename(f) !== '注册.tsx') throw new Error(`${相对}：webpackContext 只许在作品的 注册.tsx 里用（指纹按代码文本记它的参数）`);
    const 按说明符 = new Map<string, 目标>();
    for (const e of 边表.get(f) ?? []) {
      const 旧 = 按说明符.get(e.说明符);
      if (旧 && 稳定串(旧) !== 稳定串(e.目标)) throw new Error(`${相对}：同一个说明符 ${e.说明符} 解析到了两个目标`);
      按说明符.set(e.说明符, e.目标);
    }
    const 引用: 模块['引用'] = [];
    const 见到 = new Set<string>();
    for (const imp of ts.preProcessFile(文本, true, true).importedFiles) {
      const 止 = imp.pos + imp.fileName.length + 2;
      const q = 文本[imp.pos];
      if ((q !== '"' && q !== "'") || 文本[止 - 1] !== q || 文本.slice(imp.pos + 1, 止 - 1) !== imp.fileName) throw new Error(`${相对}：说明符 ${imp.fileName} 的位置对不上`);
      const t = 按说明符.get(imp.fileName);
      if (!t) throw new Error(`${相对}：规范化文本里的说明符 ${imp.fileName} 不在 esbuild 的依赖图里（tsconfig 两边不一致？）`);
      引用.push({ 起: imp.pos, 止, 目标: t });
      见到.add(imp.fileName);
    }
    for (const m of 文本.matchAll(新URL)) {
      const 目标路径 = path.resolve(path.dirname(f), m[2]!);
      const 起 = m.index! + m[0].indexOf(m[1]! + m[2]!);
      引用.push({ 起, 止: 起 + m[2]!.length + 2, 目标: { 路径: 目标路径, 命名空间: 'file', 外部: false } });
    }
    const 漏 = [...按说明符.keys()].filter((s) => !见到.has(s));
    if (漏.length) throw new Error(`${相对}：esbuild 依赖图里的说明符 ${漏.join('、')} 在规范化文本里找不到（tsconfig 两边不一致？）`);
    引用.sort((a, b) => a.起 - b.起);
    const m = { 文本, loader, 引用 };
    模块们.set(f, m);
    return m;
  };

  const 跟进 = (f: string, t: 目标) => t.命名空间 === 'file' && !t.外部 && 代码loader[path.extname(t.路径)] && !选项.略过?.(f, t.路径);
  const 替换 = (f: string, m: 模块, 环内?: Set<string>) => {
    let out = '';
    let i = 0;
    for (const r of m.引用) {
      const 叶 = 叶子(r.目标);
      const h = 叶 ?? (选项.略过?.(f, r.目标.路径) ? '略' : 环内?.has(r.目标.路径) ? '环' : 模块哈希.get(r.目标.路径)!);
      out += `${m.文本.slice(i, r.起)}"«${h}»"`;
      i = r.止;
    }
    return out + m.文本.slice(i);
  };

  // Tarjan：强连通分量按依赖在前的顺序出来，依次算哈希
  const 序号 = new Map<string, number>();
  const 低 = new Map<string, number>();
  const 栈: string[] = [];
  const 在栈 = new Set<string>();
  let n = 0;
  const 访 = async (f: string): Promise<void> => {
    序号.set(f, n);
    低.set(f, n++);
    栈.push(f);
    在栈.add(f);
    const m = await 读模块(f);
    for (const r of m.引用) {
      if (!跟进(f, r.目标)) continue;
      const g = r.目标.路径;
      if (!序号.has(g)) {
        await 访(g);
        低.set(f, Math.min(低.get(f)!, 低.get(g)!));
      } else if (在栈.has(g)) 低.set(f, Math.min(低.get(f)!, 序号.get(g)!));
    }
    if (低.get(f) !== 序号.get(f)) return;
    const 分量: string[] = [];
    for (;;) {
      const g = 栈.pop()!;
      在栈.delete(g);
      分量.push(g);
      if (g === f) break;
    }
    const 自环 = 分量.length === 1 && m.引用.some((r) => 跟进(f, r.目标) && r.目标.路径 === f);
    if (分量.length === 1 && !自环) {
      模块哈希.set(f, sha(`anim-${默克尔算法}\0${m.loader}\0${替换(f, m)}`));
      return;
    }
    const 环内 = new Set(分量);
    const 文本们 = 分量.map((g) => `${模块们.get(g)!.loader}\0${替换(g, 模块们.get(g)!, 环内)}`).sort();
    const h = sha(`anim-${默克尔算法}-环\0${文本们.join('\0')}`);
    for (const g of 分量) 模块哈希.set(g, h);
  };
  for (const e of 入口们) {
    const f = path.resolve(根, e);
    if (代码loader[path.extname(f)] && !序号.has(f)) await 访(f);
  }

  const 相对 = (f: string) => path.relative(根, f).split(path.sep).join('/');
  const 文件哈希 = new Map<string, string>();
  const 文件sha = (f: string) => {
    let h = 文件哈希.get(f);
    if (h === undefined) 文件哈希.set(f, (h = `file:${sha(fs.readFileSync(f))}`));
    return h;
  };
  const 取 = (入口: string[]): 默克尔结果 => {
    const 绝对 = 入口.map((e) => path.resolve(根, e));
    for (const f of 绝对) if (代码loader[path.extname(f)] && !模块哈希.has(f)) throw new Error(`${相对(f)} 不在建图时给的入口里`);
    const 根哈希 = 绝对.map((f) => (代码loader[path.extname(f)] ? 模块哈希.get(f)! : 文件sha(f)));
    // 跟进的闭包（进哈希的代码模块）
    const 跟到 = new Set<string>();
    const 待跟 = 绝对.filter((f) => 代码loader[path.extname(f)]);
    while (待跟.length) {
      const f = 待跟.pop()!;
      if (跟到.has(f)) continue;
      跟到.add(f);
      for (const r of 模块们.get(f)!.引用) if (跟进(f, r.目标)) 待跟.push(r.目标.路径);
    }
    // 单独打包时 esbuild 读到的文件和 asset:（边全跟，加原文的 new URL）
    const 读到 = new Set<string>();
    const 用到资产 = new Set<string>();
    const 待读 = [...绝对];
    while (待读.length) {
      const f = 待读.pop()!;
      if (读到.has(f)) continue;
      读到.add(f);
      for (const e of 边表.get(f) ?? []) {
        if (e.目标.命名空间 === 'anim-资产') 用到资产.add(e.目标.路径);
        else if (e.目标.命名空间 === 'file' && !e.目标.外部) 待读.push(e.目标.路径);
      }
      待读.push(...(原文新URL.get(f) ?? []));
    }
    const 模块: Record<string, string> = {};
    for (const f of [...跟到].sort()) 模块[相对(f)] = 模块哈希.get(f)!;
    for (const f of [...读到].sort()) {
      if (!代码loader[path.extname(f)] && !(相对(f) in 模块)) 模块[相对(f)] = 文件sha(f);
    }
    const 资产表 = [...用到资产].sort().map((id) => [id, 资产.get(id)!] as const);
    return { 根: 根哈希, 明细: { 模块, 资产: Object.fromEntries(资产表) } };
  };
  return { 取 };
};

const 稳定串 = (t: 目标) => `${t.命名空间}:${t.外部}:${t.路径}`;

/** 单个文件规范化后的哈希，不跟它的 import（打包规则用：webpack.ts 等不跟闭包，免得改 pipeline 别处就全片失效） */
export const 文本哈希 = async (相对路径: string) => {
  const f = path.join(代码根(), 相对路径);
  return sha(`anim-${默克尔算法}\0${await 规范化(fs.readFileSync(f, 'utf8'), 代码loader[path.extname(f)]!)}`);
};
