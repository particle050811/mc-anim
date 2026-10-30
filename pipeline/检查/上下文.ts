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
import { esbuild别名插件, 非代码loader } from '../资产/esbuild插件.ts';
import type { 资产锁 } from '../资产/资产锁.ts';
import { 选作品错误 } from '../环境/作品.ts';

export const 规则名 = ['类型', '结构', '清单', '加载', '台词', '资产', '规矩', '平台', '副本'] as const;
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
export const 渲染层前缀 = ['engine/', '库/', '作品/'];
export const 是渲染代码 = (p: string) => 渲染层前缀.some((x) => p.startsWith(x)) && 代码后缀.test(p) && !是测试或声明(p);

/**
 * 纯模块：pipeline 直接 import、Node 里直接执行的作品文件和 engine/段 的框架，闭包里不许有 react、three、remotion。
 * 方案三-2 列的是 清单.ts、段.ts、时间线.ts、末态.ts；段定义.ts、设置值.ts 也被 pipeline import，一并算。
 */
export const 是纯模块 = (p: string) =>
  ['engine/段/段定义.ts', 'engine/段/设置值.ts'].includes(p) ||
  /^作品\/[^/]+\/清单\.ts$/.test(p) ||
  /^作品\/[^/]+\/(段|核对)\/[^/]+\/段\.ts$/.test(p) ||
  /^作品\/[^/]+\/场\/[^/]+\/(时间线|末态)\.ts$/.test(p);

export type 边 = { 到: string; 外部: boolean };
export type 依赖图 = {
  /** 文件 → 它静态 import 的东西（仓库内文件是相对路径，外部是包名或 node: 模块） */
  边: Map<string, 边[]>;
  /** 文件 → 它 import 的 asset: id */
  资产: Map<string, string[]>;
  错误: string[];
};

/** 从入口们沿依赖图走到的全部仓库内文件 */
export const 闭包 = (图: 依赖图, 入口: string[]) => {
  const 到过 = new Set(入口);
  const 队 = [...入口];
  while (队.length) for (const e of 图.边.get(队.shift()!) ?? []) if (!e.外部 && !到过.has(e.到)) 到过.add(e.到), 队.push(e.到);
  return 到过;
};

const 包名 = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

/** asset:<id> 一律解析成字符串模块，记下谁引了哪个 id；锁里有没有交给 资产 规则查，好一次报全 */
const 宽松资产插件 = (记录?: Map<string, string[]>): Plugin => ({
  name: 'anim-检查-资产',
  setup(b) {
    b.onResolve({ filter: /^asset:/ }, (args) => {
      const id = args.path.slice('asset:'.length);
      if (记录 && args.importer) {
        const k = args.importer;
        (记录.get(k) ?? 记录.set(k, []).get(k)!).push(id);
      }
      return { path: id, namespace: 'anim-检查-资产' };
    });
    b.onLoad({ filter: /.*/, namespace: 'anim-检查-资产' }, (args) => ({ contents: `export default ${JSON.stringify('asset:' + args.path)};`, loader: 'js' }));
  },
});

export type 加载结果 = { 模块?: Record<string, unknown>; 错误?: string };

export class 检查上下文 {
  readonly 根: string;
  readonly 深: boolean;
  readonly 数据根: string | undefined;
  /** 规矩表出处 M/ 的根；不给就用配置 记忆（ANIM_MEMORY） */
  readonly 记忆根: string | undefined;
  #文件?: string[];
  #图?: Promise<依赖图>;
  #加载 = new Map<string, Promise<加载结果>>();
  #tmp?: string;
  #作品?: string;
  #私有?: boolean;

  constructor(根: string, 选项: { 深?: boolean; 数据根?: string; 记忆根?: string; 作品?: string } = {}) {
    this.根 = fs.realpathSync(根);
    this.深 = 选项.深 ?? false;
    this.数据根 = 选项.数据根;
    this.记忆根 = 选项.记忆根;
    this.#作品 = 选项.作品;
  }

  /** 查的是哪部作品：给了就用；没给时 作品/ 下只有一部（有 清单.ts 的目录）就用它，否则报错 */
  get 作品名(): string {
    if (this.#作品 === undefined) {
      const 们 = this.存在('作品')
        ? fs.readdirSync(this.绝对('作品'), { withFileTypes: true }).filter((e) => e.isDirectory() && this.存在(`作品/${e.name}/清单.ts`)).map((e) => e.name).sort()
        : [];
      if (们.length !== 1) throw new 选作品错误(们.length ? `有 ${们.length} 部作品（${们.join('、')}），用 --作品 <名> 指定查哪部` : '一部作品都没有（作品/<名>/清单.ts）');
      this.#作品 = 们[0]!;
    }
    return this.#作品;
  }
  /** 作品目录（相对 根），如 作品/<名> */
  get 作品目录() {
    return `作品/${this.作品名}`;
  }
  作品路径 = (p: string) => `${this.作品目录}/${p}`;
  /** 作品/ 下、不是这次查的作品的文件 */
  是别的作品 = (p: string) => p.startsWith('作品/') && !p.startsWith(`${this.作品目录}/`);
  /** 文件() 去掉别的作品的 */
  本作品文件 = () => this.文件().filter((p) => !this.是别的作品(p));
  /** 本作品私有：作品目录被 .gitignore 挡住（0004：作品默认公开，要私有的逐个挡）；根不在 git 里就当公开 */
  get 作品私有(): boolean {
    if (this.#私有 === undefined) {
      try {
        // 末尾带 /，.gitignore 里只对目录生效的规则（/作品/<名>/、!/作品/<名>/）才对得上
        execFileSync('git', ['-C', this.根, 'check-ignore', '-q', `${this.作品目录}/`], { stdio: 'ignore' });
        this.#私有 = true;
      } catch {
        this.#私有 = false;
      }
    }
    return this.#私有;
  }

  绝对 = (p: string) => path.join(this.根, ...p.split('/'));
  存在 = (p: string) => fs.existsSync(this.绝对(p));
  读 = (p: string) => fs.readFileSync(this.绝对(p), 'utf8');
  相对 = (abs: string) => path.relative(this.根, abs).split(path.sep).join('/');

  /** dir（相对 根）下 git 跟踪的 + 没被忽略的新文件；dir 不是 git 仓库的根就返回 null */
  #git文件(dir: string): string[] | null {
    try {
      const abs = this.绝对(dir || '.');
      const top = execFileSync('git', ['-C', abs, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (fs.realpathSync(top) !== fs.realpathSync(abs)) return null;
      const out = execFileSync('git', ['-C', abs, '-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 1 << 28,
      });
      return [...new Set(out.split('\0').filter(Boolean))].map((p) => (dir ? `${dir}/${p}` : p)).filter((p) => this.存在(p));
    } catch {
      return null;
    }
  }

  /** dir 下整个走一遍（跳过 node_modules、.git、.venv） */
  #走(dir: string, 表: string[]) {
    for (const e of fs.readdirSync(this.绝对(dir || '.'), { withFileTypes: true })) {
      const p = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!['node_modules', '.git', '.venv', '__pycache__'].includes(e.name)) this.#走(p, 表);
      } else 表.push(p);
    }
  }

  /**
   * 仓库里的文件（git 跟踪的 + 没被忽略的新文件）；不在 git 里就整个目录走一遍。
   * 作品/ 下被 .gitignore 挡住的私有作品（自己是 git 仓库或普通目录）也要查，按各自的根另列（方案批评补充二-1）。
   */
  文件(): string[] {
    if (this.#文件) return this.#文件;
    let 表 = this.#git文件('');
    if (!表) {
      表 = [];
      this.#走('', 表);
    }
    if (this.存在('作品')) {
      for (const e of fs.readdirSync(this.绝对('作品'), { withFileTypes: true })) {
        const d = `作品/${e.name}`;
        if (!e.isDirectory() || 表.some((p) => p.startsWith(`${d}/`))) continue;
        const 私有 = this.#git文件(d);
        if (私有) 表.push(...私有);
        else this.#走(d, 表);
      }
    }
    return (this.#文件 = [...new Set(表)].sort());
  }

  /** 参与依赖图的代码文件：engine、库、本作品、pipeline 下的源码（不含测试和 .d.ts） */
  代码文件 = () => this.本作品文件().filter((p) => /^(engine|库|作品|pipeline)\//.test(p) && 代码后缀.test(p) && !是测试或声明(p));

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
          plugins: [esbuild别名插件(this.根), 宽松资产插件(资产记录)],
          logLevel: 'silent',
        });
      const 收边 = (inputs: Record<string, { imports: { path: string; external?: boolean }[] }>) => {
        for (const [p, info] of Object.entries(inputs)) {
          if (p.includes(':')) continue;
          const 从 = p.split(path.sep).join('/');
          图.边.set(
            从,
            info.imports
              .filter((i) => !i.path.startsWith('anim-检查-资产:'))
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
            plugins: [esbuild别名插件(this.根), 宽松资产插件()],
            logLevel: 'silent',
          });
          this.#tmp ??= fs.mkdtempSync(path.join(os.tmpdir(), 'anim-检查-'));
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
  /** 本作品用的两份资产锁：共用的和作品资产表那一侧的（文件不在就是空的） */
  资产锁 = (): { 共用: 资产锁; 作品: 资产锁 } => ({
    共用: (this.读json('assets/资产锁.json') ?? {}) as 资产锁,
    作品: (this.读json(this.作品路径('资产锁.json')) ?? {}) as 资产锁,
  });
}
