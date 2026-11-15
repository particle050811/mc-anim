// 中文标识符改英文的工具（docs/待办.md「代码和命令改英文」）用的工程：按根下 tsconfig.json 开语言服务，
// 不在 tsconfig 里的进 Git 的代码（.claude 钩子、wasm 的 AssemblyScript、sourcing 的 mjs）另开一个 allowJs 的语言服务。
// 源码可以在内存里换掉（改名后先核对、核对过才落盘），换了的文件版本号加一，语言服务只重解析这几个文件。
// 迁移做完整个 pipeline/改名/ 删掉，git 历史留着。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** 汉字（含扩展 A、兼容区、扩展 B 起的补充平面） */
export const HAN = /[㐀-鿿豈-﫿\u{20000}-\u{3134f}]/u;
export const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

type Service = { ls: ts.LanguageService; files: Set<string> };

export class Workspace {
  readonly root: string;
  /** 进 Git 的全部代码文件（相对根、/ 分隔） */
  readonly files: string[];
  readonly fileSet: Set<string>;
  private readonly overrides = new Map<string, string>();
  /** 读盘缓存、program 缓存：语言服务每次 getProgram 都要把全部文件的版本对一遍，扫描时一次几万回，缓存住；setText 清掉 */
  private readonly diskCache = new Map<string, string | undefined>();
  private readonly programCache = new Map<ts.LanguageService, ts.Program>();
  private readonly versions = new Map<string, number>();
  private readonly main: Service;
  private readonly extra: Service;

  constructor(root: string) {
    this.root = path.resolve(root);
    const listed = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: this.root, maxBuffer: 1 << 28 })
      .toString()
      .split('\0')
      .filter((f) => CODE_EXT.test(f) && fs.existsSync(path.join(this.root, f)));
    this.files = listed.sort();
    this.fileSet = new Set(this.files);
    const cfgPath = path.join(this.root, 'tsconfig.json');
    const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, this.root, undefined, cfgPath);
    const mainFiles = new Set(parsed.fileNames.map((f) => this.rel(f)));
    this.main = this.service(parsed.options, mainFiles);
    const rest = new Set(this.files.filter((f) => !mainFiles.has(f)));
    this.extra = this.service({ ...parsed.options, allowJs: true, checkJs: false, noEmit: true }, rest);
  }

  rel(abs: string) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }
  abs(rel: string) {
    return path.join(this.root, rel);
  }

  private service(options: ts.CompilerOptions, files: Set<string>): Service {
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [...files].map((f) => this.abs(f)),
      getScriptVersion: (f) => String(this.versions.get(this.rel(f)) ?? 0),
      getScriptSnapshot: (f) => {
        const t = this.readAbs(f);
        return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
      },
      getCurrentDirectory: () => this.root,
      getCompilationSettings: () => options,
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: (f) => this.overrides.has(this.rel(f)) || ts.sys.fileExists(f),
      readFile: (f) => this.readAbs(f),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    };
    return { ls: ts.createLanguageService(host, ts.createDocumentRegistry()), files };
  }

  private readAbs(abs: string): string | undefined {
    const r = this.rel(abs);
    const o = this.overrides.get(r);
    if (o !== undefined) return o;
    if (this.diskCache.has(abs)) return this.diskCache.get(abs);
    const t = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined;
    this.diskCache.set(abs, t);
    return t;
  }

  text(rel: string): string {
    const t = this.readAbs(this.abs(rel));
    if (t === undefined) throw new Error(`读不到 ${rel}`);
    return t;
  }

  /** 内存里换掉一个文件的源码（不落盘） */
  setText(rel: string, text: string) {
    this.overrides.set(rel, text);
    this.versions.set(rel, (this.versions.get(rel) ?? 0) + 1);
    this.programCache.clear();
  }

  changed(): Map<string, string> {
    return new Map(this.overrides);
  }

  /** 这个文件归哪个语言服务：tsconfig 里的归主服务，其余归附加服务 */
  serviceOf(rel: string): ts.LanguageService {
    return this.main.files.has(rel) ? this.main.ls : this.extra.ls;
  }
  get services(): ts.LanguageService[] {
    return [this.main.ls, this.extra.ls];
  }
  isMain(rel: string) {
    return this.main.files.has(rel);
  }

  program(rel: string): ts.Program {
    const ls = this.serviceOf(rel);
    let p = this.programCache.get(ls);
    if (!p) {
      p = ls.getProgram();
      if (!p) throw new Error('语言服务没有 program');
      this.programCache.set(ls, p);
    }
    return p;
  }
  sourceFile(rel: string): ts.SourceFile {
    const sf = this.program(rel).getSourceFile(this.abs(rel));
    if (!sf) throw new Error(`program 里没有 ${rel}`);
    return sf;
  }
}

/** 位置上最内层的标识符（含 #私有名）；没有返回 undefined */
export const identifierAt = (sf: ts.SourceFile, pos: number): ts.Identifier | ts.PrivateIdentifier | undefined => {
  let n: ts.Node = sf;
  for (;;) {
    let next: ts.Node | undefined;
    n.forEachChild((c) => {
      if (!next && c.getStart(sf) <= pos && pos < c.end) next = c;
    });
    if (!next) break;
    n = next;
  }
  return ts.isIdentifier(n) || ts.isPrivateIdentifier(n) ? n : undefined;
};

/** 位置上的字符串字面量（下标、in、类型实参里的 '名'） */
export const stringAt = (sf: ts.SourceFile, pos: number): ts.StringLiteralLike | undefined => {
  let n: ts.Node = sf;
  for (;;) {
    let next: ts.Node | undefined;
    n.forEachChild((c) => {
      if (!next && c.getStart(sf) <= pos && pos < c.end) next = c;
    });
    if (!next) break;
    n = next;
  }
  return ts.isStringLiteralLike(n) ? n : undefined;
};

/** 递归走全部子节点（不进 JSDoc） */
export const walk = (n: ts.Node, fn: (n: ts.Node) => void) => {
  fn(n);
  n.forEachChild((c) => walk(c, fn));
};

/** 新名能不能用：只收 ASCII 标识符，不收保留字（含严格模式保留的 let、static、yield…） */
export const badNewName = (name: string): string | undefined => {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return '不是 ASCII 标识符';
  const k = ts.identifierToKeywordKind(ts.factory.createIdentifier(name));
  if (
    k !== undefined &&
    ((k >= ts.SyntaxKind.FirstReservedWord && k <= ts.SyntaxKind.LastReservedWord) ||
      (k >= ts.SyntaxKind.FirstFutureReservedWord && k <= ts.SyntaxKind.LastFutureReservedWord))
  )
    return '是保留字';
  return undefined;
};
