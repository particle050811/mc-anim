// sr check 各条规则共用的上下文：仓库根下的文件表、esbuild 依赖图、纯模块的执行结果，都只算一次。
// 根可以是任意目录（测试拿临时目录造一个小仓库），所以这里不调 代码根()，路径一律相对 根、用正斜杠。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build, type Plugin } from 'esbuild';
import { parse } from 'smol-toml';
import { 非代码loader } from '../资产/esbuild插件.ts';

export const 规则名 = ['类型', '结构', '清单', '加载', '台词', '资产', '规矩', '平台'] as const;
export type 规则类 = (typeof 规则名)[number];

export type 问题 = { 文件?: string; 行?: number; 文本: string };

export class 报告 {
  违规: 问题[] = [];
  待迁移: 问题[] = [];
  跳过: string[] = [];
  信息: string[] = [];
  错(文本: string, 文件?: string, 行?: number) {
    this.违规.push({ 文本, 文件, 行 });
  }
  待(文本: string, 文件?: string) {
    this.待迁移.push({ 文本, 文件 });
  }
}

/** 代码文件（参与依赖图、语法扫描的） */
export const 代码后缀 = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const 是测试或声明 = (p: string) => /\.test\.[cm]?[jt]sx?$/.test(p) || /\.d\.[cm]?ts$/.test(p);
/** 渲染代码所在的层（打进 Remotion 包的） */
export const 渲染层前缀 = ['engine/', 'world/', 'content/'];
export const 是渲染代码 = (p: string) => 渲染层前缀.some((x) => p.startsWith(x)) && 代码后缀.test(p) && !是测试或声明(p);

/**
 * 纯模块：pipeline 直接 import、Node 里直接执行的 content 文件，闭包里不许有 react、three、remotion。
 * 方案三-2 列的是 清单.ts、段.ts、时间线.ts、末态.ts；段定义.ts、设置值.ts 也被 pipeline import，一并算。
 */
export const 是纯模块 = (p: string) =>
  ['content/清单.ts', 'content/段定义.ts', 'content/设置值.ts'].includes(p) ||
  /^content\/(段|核对)\/[^/]+\/段\.ts$/.test(p) ||
  /^content\/场\/[^/]+\/(时间线|末态)\.ts$/.test(p);

export type 边 = { 到: string; 外部: boolean };
export type 依赖图 = {
  /** 文件 → 它静态 import 的东西（仓库内文件是相对路径，外部是包名或 node: 模块） */
  边: Map<string, 边[]>;
  /** 文件 → 它 import 的 asset: id */
  资产: Map<string, string[]>;
  错误: string[];
};

const 包名 = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

/** asset:<id> 一律解析成字符串模块，记下谁引了哪个 id；锁里有没有交给 资产 规则查，好一次报全 */
const 宽松资产插件 = (记录?: Map<string, string[]>): Plugin => ({
  name: 'sr-检查-资产',
  setup(b) {
    b.onResolve({ filter: /^asset:/ }, (args) => {
      const id = args.path.slice('asset:'.length);
      if (记录 && args.importer) {
        const k = args.importer;
        (记录.get(k) ?? 记录.set(k, []).get(k)!).push(id);
      }
      return { path: id, namespace: 'sr-检查-资产' };
    });
    b.onLoad({ filter: /.*/, namespace: 'sr-检查-资产' }, (args) => ({ contents: `export default ${JSON.stringify('asset:' + args.path)};`, loader: 'js' }));
  },
});

export type 加载结果 = { 模块?: Record<string, unknown>; 错误?: string };

export class 检查上下文 {
  readonly 根: string;
  readonly 深: boolean;
  readonly 数据根: string | undefined;
  #文件?: string[];
  #图?: Promise<依赖图>;
  #加载 = new Map<string, Promise<加载结果>>();
  #tmp?: string;

  constructor(根: string, 选项: { 深?: boolean; 数据根?: string } = {}) {
    this.根 = fs.realpathSync(根);
    this.深 = 选项.深 ?? false;
    this.数据根 = 选项.数据根;
  }

  绝对 = (p: string) => path.join(this.根, ...p.split('/'));
  存在 = (p: string) => fs.existsSync(this.绝对(p));
  读 = (p: string) => fs.readFileSync(this.绝对(p), 'utf8');
  相对 = (abs: string) => path.relative(this.根, abs).split(path.sep).join('/');

  /** 仓库里的文件（git 跟踪的 + 没被忽略的新文件）；不在 git 里就整个目录走一遍（跳过 node_modules、.git、.venv） */
  文件(): string[] {
    if (this.#文件) return this.#文件;
    let 表: string[] | null = null;
    try {
      const top = execFileSync('git', ['-C', this.根, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (fs.realpathSync(top) === this.根) {
        const out = execFileSync('git', ['-C', this.根, '-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 1 << 28,
        });
        表 = [...new Set(out.split('\0').filter(Boolean))].filter((p) => this.存在(p));
      }
    } catch {
      // 不是 git 仓库
    }
    if (!表) {
      表 = [];
      const 走 = (dir: string) => {
        for (const e of fs.readdirSync(this.绝对(dir || '.'), { withFileTypes: true })) {
          const p = dir ? `${dir}/${e.name}` : e.name;
          if (e.isDirectory()) {
            if (!['node_modules', '.git', '.venv', '__pycache__'].includes(e.name)) 走(p);
          } else 表!.push(p);
        }
      };
      走('');
    }
    return (this.#文件 = 表.sort());
  }

  /** 参与依赖图的代码文件：engine、world、content、pipeline 下的源码（不含测试和 .d.ts） */
  代码文件 = () => this.文件().filter((p) => /^(engine|world|content|pipeline)\//.test(p) && 代码后缀.test(p) && !是测试或声明(p));

  /**
   * 全仓库一次 esbuild（每个代码文件都当入口），从 metafile 拿真实的 import 边。类型导入被擦掉，不算依赖。
   * 有打包错误时 esbuild 不给 metafile，就逐个入口重打，能打的照样收边，好一次把别的违规报全；错误记进 错误。
   */
  依赖图(): Promise<依赖图> {
    return (this.#图 ??= (async () => {
      const 图: 依赖图 = { 边: new Map(), 资产: new Map(), 错误: [] };
      const 入口 = this.代码文件();
      if (!入口.length) return 图;
      const 资产记录 = new Map<string, string[]>();
      const 打 = (入: string[]) =>
        build({
          entryPoints: 入,
          absWorkingDir: this.根,
          bundle: true,
          write: false,
          metafile: true,
          outdir: 'out',
          platform: 'node',
          format: 'esm',
          jsx: 'automatic',
          packages: 'external',
          loader: { ...非代码loader, '.json': 'json' },
          plugins: [宽松资产插件(资产记录)],
          logLevel: 'silent',
        });
      const 收边 = (inputs: Record<string, { imports: { path: string; external?: boolean }[] }>) => {
        for (const [p, info] of Object.entries(inputs)) {
          if (p.includes(':')) continue;
          const 从 = p.split(path.sep).join('/');
          图.边.set(
            从,
            info.imports
              .filter((i) => !i.path.startsWith('sr-检查-资产:'))
              .map((i) => (i.external ? { 到: i.path.startsWith('node:') ? i.path : 包名(i.path), 外部: true } : { 到: i.path.split(path.sep).join('/'), 外部: false })),
          );
        }
      };
      const 记错 = (e: unknown) => {
        const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
        const 文 = errs?.length ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line}：${x.text}` : x.text)) : [(e as Error).message];
        for (const t of 文) if (!图.错误.includes(t)) 图.错误.push(t);
      };
      try {
        收边((await 打(入口)).metafile.inputs);
      } catch (e) {
        记错(e);
        for (const 入 of 入口) {
          try {
            收边((await 打([入])).metafile.inputs);
          } catch (e2) {
            记错(e2);
          }
        }
      }
      for (const [abs, ids] of 资产记录) 图.资产.set(this.相对(abs), [...new Set(ids)]);
      return 图;
    })());
  }

  /** 在 Node 里执行一个纯模块（esbuild 连依赖打成一个文件再 import），拿到导出；throw 了就记下错误 */
  加载(p: string): Promise<加载结果> {
    let r = this.#加载.get(p);
    if (!r) {
      r = (async (): Promise<加载结果> => {
        try {
          const out = await build({
            entryPoints: [this.绝对(p)],
            absWorkingDir: this.根,
            bundle: true,
            write: false,
            platform: 'node',
            format: 'esm',
            jsx: 'automatic',
            loader: { ...非代码loader, '.json': 'json' },
            plugins: [宽松资产插件()],
            logLevel: 'silent',
          });
          this.#tmp ??= fs.mkdtempSync(path.join(os.tmpdir(), 'sr-检查-'));
          const file = path.join(this.#tmp, `${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}.mjs`);
          fs.writeFileSync(file, out.outputFiles[0]!.text, 'utf8');
          return { 模块: (await import(pathToFileURL(file).href)) as Record<string, unknown> };
        } catch (e) {
          const errs = (e as { errors?: { text: string }[] }).errors;
          return { 错误: errs?.length ? errs.map((x) => x.text).join('；') : e instanceof Error ? e.message : String(e) };
        }
      })();
      this.#加载.set(p, r);
    }
    return r;
  }

  收尾() {
    if (this.#tmp) fs.rmSync(this.#tmp, { recursive: true, force: true });
  }

  // ---------- 常用的表 ----------

  读toml = (p: string): Record<string, unknown> | null => (this.存在(p) ? (parse(this.读(p)) as Record<string, unknown>) : null);
  读json = (p: string): unknown => (this.存在(p) ? JSON.parse(this.读(p)) : null);
}
