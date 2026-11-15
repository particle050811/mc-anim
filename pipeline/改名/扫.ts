// 扫：找出全部含汉字的标识符，按「必须一起改名的组」聚成组（一个组 = 一个符号连同 TS 认为必须同名的声明和引用）。
// - 局部的（本文件里声明、没导出、不是成员）只在本文件用检查器按符号归组，不调语言服务；
// - 成员、导出的、全局的从声明处调 findRenameLocations（带前后缀模式：简写 { 名 } 拆成属性、值两个「角色」，可以各起各的名），
//   导入导出说明符上的「名 as 名」前后缀不拆，导出方和不改名的导入方算一组；
// - 检查器解不出的属性（读 TOML、JSON 进来的 any）按名字归一组「未解析属性」；
// - 和组同名的字符串字面量：'名' in x、Pick<T, '名'>、keyof T 类型的变量初值这几种能解到属性的，并进组里一起改；
//   其余列成「字符串引用」，标上 TS 会不会查它（上下文类型是字面量联合的会查，string 的不查，比如时间线事件的 接: '第15句对视'）。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { HAN, identifierAt, walk, type Workspace } from './工程.ts';

/** 角色：'' 普通；简写 { 名 } 里 p = 属性名那一面、v = 值（变量）那一面 */
export type Role = '' | 'p' | 'v';
/** 一处要改的地方：文件、起止（字符串只含引号里面）、角色、是不是字符串 */
export type Loc = { file: string; start: number; end: number; role: Role; str?: boolean };
/** 字符串引用：via = 字面量（'名' 整个是这个名字）、嵌入代码（生成代码的模板字符串里）、文本文件（副本表、规矩.toml 的落点…） */
export type StringRef = { file: string; start: number; end: number; line: number; checked: boolean; via: '字面量' | '嵌入代码' | '文本文件' };

export type Group = {
  id: string;
  /** 组里其他声明的 id（文件#声明链），改名表里写哪个都行 */
  aliases?: string[];
  name: string;
  kind: string;
  kinds: string[];
  exported: boolean;
  files: number;
  count: number;
  decl?: { file: string; line: number; col: number };
  context?: { before: string[]; line: string; after: string[]; comment?: string };
  uses: { file: string; line: number; text: string }[];
  flags: {
    disk?: '是' | '疑似';
    diskEvidence?: string[];
    stringRefs?: number;
    stringRefsUnchecked?: number;
    stringRefSamples?: string[];
    stringRefsVia?: Record<string, number>;
    keyLike?: string[];
    jsxComponent?: boolean;
    cannotRename?: boolean;
    multiName?: string[];
  };
  locs: Loc[];
};

export type ScanResult = {
  root: string;
  hashes: Record<string, string>;
  groups: Group[];
  strings: Record<string, StringRef[]>;
  stats: Record<string, unknown>;
};

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const keyOf = (file: string, start: number, role: Role) => `${file}:${start}${role ? '#' + role : ''}`;

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) {
      this.parent.set(a, a);
      return a;
    }
    if (p === a) return a;
    const r = this.find(p);
    this.parent.set(a, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
  has(a: string) {
    return this.parent.has(a);
  }
  keys() {
    return this.parent.keys();
  }
}

const MEMBER = ts.SymbolFlags.Property | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor | ts.SymbolFlags.EnumMember | ts.SymbolFlags.Prototype;
const IDENT_LIKE = /^[\p{L}\p{N}_$]+$/u;
/** 读写盘的文件：出现这些写法的文件里的属性，名字又在盘上数据的键里，就算盘上字段 */
const IO_HINT = /JSON\.parse|JSON\.stringify|from 'smol-toml'|readFileSync|writeFileSync|readFile\(|writeFile\(|\.toml['`]|\.json['`]/;

/** 字符串里像代码的（生成代码的模板）：按标识符切开找组名 */
const CODE_HINT = /\b(import|export|const|let|from|function|return)\b|=>/;
const TOKEN = /[\p{L}\p{N}_$]+/gu;
/** 写了代码符号名的文本文件（anim check、副本规则会按名字查）；--text-files 可以再加 */
export const DEFAULT_TEXT_FILES = [/^docs\/副本表\.tsv$/, /^作品\/[^/]+\/规矩\.toml$/, /^rules\/[^/]+\.toml$/];

export type ScanOptions = {
  /** 另外要找符号名的文本文件（相对根的正则） */
  textFiles?: RegExp[];
  /** 只输出声明在这些前缀下的组（符号模式照样全仓扫；--ls 模式只扫这些文件的出现处，组靠语言服务跨全仓收齐） */
  only?: string[];
  /** 每个非局部的组都调语言服务 findRenameLocations（和 TS 的改名一模一样，但同名属性多时是平方级，全仓要几小时）；默认用检查器按声明位置并组 */
  useLs?: boolean;
  /** 盘上数据里出现过的键（disk-keys 命令产出） */
  diskKeys?: Set<string>;
  log?: (s: string) => void;
};

export const scan = (ws: Workspace, opt: ScanOptions = {}): ScanResult => {
  const log = opt.log ?? (() => {});
  const t0 = performance.now();
  const uf = new UnionFind();
  const locs = new Map<string, Loc>();
  const symKey = new Map<ts.Symbol, string>();
  const cannot = new Set<string>();
  const lsDone = new Set<string>();
  let lsCalls = 0;
  let mappedLinks = 0;
  let lsMs = 0;
  let occurrences = 0;
  const inOnly = (f: string) => !opt.only || opt.only.some((p) => f === p || f.startsWith(p.endsWith('/') ? p : p + '/'));
  const scanFiles = opt.useLs ? ws.files.filter(inOnly) : ws.files;
  let lsFallbacks = 0;

  const addLoc = (l: Loc) => {
    const k = keyOf(l.file, l.start, l.role);
    if (!locs.has(k)) locs.set(k, l);
    uf.find(k);
    return k;
  };
  const nodeLoc = (sf: ts.SourceFile, n: ts.Node, role: Role): Loc => ({ file: ws.rel(sf.fileName), start: n.getStart(sf), end: n.end, role });

  /** 从 (文件, 位置) 调 findRenameLocations，返回的每一处并进同一组 */
  const viaLs = (rel: string, pos: number, startKey: string) => {
    const ls = ws.serviceOf(rel);
    const t = performance.now();
    let r: readonly ts.RenameLocation[] | undefined;
    try {
      r = ls.findRenameLocations(ws.abs(rel), pos, false, false, { providePrefixAndSuffixTextForRename: true });
    } catch (e) {
      log(`findRenameLocations 出错 ${rel}:${pos} ${(e as Error).message.split('\n')[0]}`);
    }
    lsCalls++;
    lsMs += performance.now() - t;
    if (!r) {
      cannot.add(startKey);
      return;
    }
    for (const l of r) {
      const f = ws.rel(l.fileName);
      let start = l.textSpan.start;
      let end = start + l.textSpan.length;
      const text = ws.text(f);
      const q = text[start];
      const str = q === "'" || q === '"' || q === '`';
      if (str) {
        start++;
        end--;
      }
      const affix = (l.prefixText ?? '') + (l.suffixText ?? '');
      let role: Role = '';
      if (affix && !affix.includes(' as ')) role = l.prefixText ? 'v' : 'p';
      if (!str && !affix && /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f)) {
        // 不带前后缀却落在简写上：两面一起改，两面都并进来
        const sf = ws.sourceFile(f);
        const id = identifierAt(sf, start);
        if (id && isShorthand(id)) {
          uf.union(startKey, addLoc({ file: f, start, end, role: 'p' }));
          uf.union(startKey, addLoc({ file: f, start, end, role: 'v' }));
          continue;
        }
      }
      uf.union(startKey, addLoc({ file: f, start, end, role, ...(str ? { str } : {}) }));
    }
  };

  const inScope = (rel: string) => ws.fileSet.has(rel) || rel.endsWith('.json');

  /** 从一个声明名开始查（每个声明只查一次）。声明是简写 { 名 } 时语言服务在那里会挑值那一面，所以改从出现处 at 查 */
  const fromDecl = (decl: ts.Declaration, nodeKey: string, at?: { rel: string; pos: number }) => {
    const name = ts.getNameOfDeclaration(decl);
    const sf = decl.getSourceFile();
    const rel = ws.rel(sf.fileName);
    if (!name || !inScope(rel) || !(ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name))) {
      cannot.add(nodeKey);
      return;
    }
    const shorthand = ts.isShorthandPropertyAssignment(decl);
    const isStr = ts.isStringLiteral(name);
    const pos = name.getStart(sf) + (isStr ? 1 : 0);
    const dk = addLoc({ file: rel, start: pos, end: isStr ? name.end - 1 : name.end, role: shorthand ? 'p' : '', ...(isStr ? { str: true } : {}) });
    uf.union(nodeKey, dk);
    if (!opt.useLs || lsDone.has(dk)) return;
    if (shorthand) {
      if (!at) return;
      lsDone.add(dk);
      viaLs(at.rel, at.pos, nodeKey);
      return;
    }
    lsDone.add(dk);
    viaLs(rel, pos, dk);
  };

  const exportedCache = new Map<ts.SourceFile, Set<ts.Symbol>>();
  const exportedOf = (sf: ts.SourceFile, checker: ts.TypeChecker) => {
    let s = exportedCache.get(sf);
    if (s) return s;
    s = new Set();
    const ms = checker.getSymbolAtLocation(sf);
    if (ms)
      for (const e of checker.getExportsOfModule(ms)) {
        s.add(e);
        if (e.flags & ts.SymbolFlags.Alias) {
          const t = checker.getImmediateAliasedSymbol(e);
          if (t) s.add(t);
        }
      }
    exportedCache.set(sf, s);
    return s;
  };

  const isLocal = (sym: ts.Symbol, sf: ts.SourceFile, checker: ts.TypeChecker) => {
    if (sym.flags & MEMBER) return false;
    const decls = sym.declarations ?? [];
    if (!decls.length || decls.some((d) => d.getSourceFile() !== sf)) return false;
    if (!ts.isExternalModule(sf)) return false; // 脚本文件：顶层声明是全局的，整个文件都走语言服务
    const ex = exportedOf(sf, checker);
    if (ex.has(sym) || ex.has(checker.getExportSymbolOfSymbol(sym))) return false;
    if (decls.some((d) => ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Export)) return false;
    if (decls.some((d) => ts.findAncestor(d, (a) => ts.isModuleDeclaration(a) && (a.flags & ts.NodeFlags.GlobalAugmentation) !== 0))) return false;
    return true;
  };

  /** 导入、不改名的导出说明符一路追到真正的声明；碰到改了名的（a as b）停在那个说明符上 */
  const followAlias = (sym: ts.Symbol, checker: ts.TypeChecker): ts.Declaration | undefined => {
    let s: ts.Symbol | undefined = sym;
    for (let i = 0; s && i < 20; i++) {
      if (!(s.flags & ts.SymbolFlags.Alias)) return s.declarations?.[0];
      const d: ts.Declaration | undefined = s.declarations?.[0];
      if (!d) return undefined;
      if ((ts.isImportSpecifier(d) || ts.isExportSpecifier(d)) && !d.propertyName) {
        s = checker.getImmediateAliasedSymbol(s);
        continue;
      }
      return d; // 改了名的说明符、默认导入、import * as：停在这里
    }
    return undefined;
  };

  const isShorthand = (n: ts.Node) =>
    (ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) ||
    (ts.isBindingElement(n.parent) && n.parent.name === n && !n.parent.propertyName && ts.isObjectBindingPattern(n.parent.parent));

  const labelTarget = (n: ts.Identifier): ts.LabeledStatement | undefined => {
    const p = n.parent;
    if (ts.isLabeledStatement(p) && p.label === n) return p;
    if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === n)
      return ts.findAncestor(p, (a): a is ts.LabeledStatement => ts.isLabeledStatement(a) && a.label.text === n.text) as ts.LabeledStatement | undefined;
    return undefined;
  };

  /** 一处出现的一个角色归组 */
  const handle = (sf: ts.SourceFile, n: ts.Identifier | ts.PrivateIdentifier, role: Role, sym: ts.Symbol | undefined, checker: ts.TypeChecker) => {
    const known = locs.has(keyOf(ws.rel(sf.fileName), n.getStart(sf), role));
    const k = addLoc(nodeLoc(sf, n, role));
    if (!sym) {
      const lab = ts.isIdentifier(n) ? labelTarget(n) : undefined;
      if (lab) uf.union(k, `L:${ws.rel(sf.fileName)}:${lab.pos}`);
      else uf.union(k, `U:${n.text}`);
      return;
    }
    if (sym.flags & ts.SymbolFlags.Alias) {
      const d0 = sym.declarations?.[0];
      const specifier = d0 && (ts.isImportSpecifier(d0) || ts.isExportSpecifier(d0)) ? d0 : undefined;
      if (specifier && specifier.propertyName === n) {
        // a as b 里的 a：指向对面模块的导出
        const t = checker.getImmediateAliasedSymbol(sym);
        const d = t && followAlias(t, checker);
        if (d) fromDecl(d, k);
        else cannot.add(k);
        return;
      }
      if (specifier && !specifier.propertyName) {
        const d = followAlias(sym, checker);
        if (d) fromDecl(d, k);
        else cannot.add(k);
        return;
      }
      if (specifier && ts.isExportSpecifier(specifier)) {
        // export { a as b } 的 b：从这里查，导入方跟着（符号模式：导入方顺着别名追到这个说明符，并到这里）
        if (!opt.useLs) {
          fromDecl(specifier, k);
          return;
        }
        if (!lsDone.has(k)) {
          lsDone.add(k);
          viaLs(ws.rel(sf.fileName), n.getStart(sf), k);
        }
        return;
      }
      // 改了名的导入、默认导入、import * as：只在本文件
      let g = symKey.get(sym);
      if (!g) symKey.set(sym, (g = `S:${symKey.size}`));
      uf.union(k, g);
      return;
    }
    if (isLocal(sym, sf, checker)) {
      let g = symKey.get(sym);
      if (!g) symKey.set(sym, (g = `S:${symKey.size}`));
      uf.union(k, g);
      return;
    }
    if (!opt.useLs) {
      bySymbol(sf, n, k, sym, checker);
      return;
    }
    const d = sym.declarations?.[0];
    if (d && ts.getNameOfDeclaration(d) === n && !ts.isShorthandPropertyAssignment(d)) {
      if (!lsDone.has(k) && !known) {
        lsDone.add(k);
        viaLs(ws.rel(sf.fileName), n.getStart(sf), k);
      }
      return;
    }
    if (known) return; // 已经被别的查询收进组了
    // 联合类型上合成的属性、映射类型的属性没有自己的声明：从出现处查
    if (sym.flags & ts.SymbolFlags.Transient || !d) {
      lsDone.add(k);
      viaLs(ws.rel(sf.fileName), n.getStart(sf), k);
      // Record<K, …> 这类映射出来的键（K 从实参推出来，比如 事件 = 解事件(定义, 表) 的 事件.第15句对视）：语言服务连不回原来的键，
      // 顺着「变量初值 → 调用实参 / 箭头函数返回值」找有这个属性的类型，并进那个属性的组
      if (!d && (ts.isPropertyAccessExpression(n.parent) || ts.isElementAccessExpression(n.parent))) {
        for (const od of originDecls(n.parent.expression, n.text, checker, 0)) {
          mappedLinks++;
          fromDecl(od, k);
        }
      }
      return;
    }
    fromDecl(d, k, { rel: ws.rel(sf.fileName), pos: n.getStart(sf) });
  };

  /** 符号连同它的根符号（联合、交叉上合成的）、实例化前的原符号、映射前的原属性，全部声明的位置 */
  const declsOf = (sym: ts.Symbol, checker: ts.TypeChecker): ts.Declaration[] => {
    const out: ts.Declaration[] = [];
    const seen = new Set<ts.Symbol>();
    const visit = (x: ts.Symbol | undefined) => {
      if (!x || seen.has(x)) return;
      seen.add(x);
      for (const r of checker.getRootSymbols(x)) if (r !== x) visit(r);
      const links = (x as ts.Symbol & { links?: { syntheticOrigin?: ts.Symbol; target?: ts.Symbol } }).links;
      visit(links?.syntheticOrigin);
      visit(links?.target);
      for (const d of x.declarations ?? []) if (inScope(ws.rel(d.getSourceFile().fileName))) out.push(d);
    };
    visit(sym);
    return out;
  };
  const linkSymbol = (sym: ts.Symbol, k: string, checker: ts.TypeChecker) => {
    const ds = declsOf(sym, checker);
    for (const d of ds) fromDecl(d, k);
    return ds.length > 0;
  };
  const propsOfType = (t: ts.Type, name: string, checker: ts.TypeChecker): ts.Symbol[] => {
    const parts = t.isUnion() ? t.types : [t];
    return parts.flatMap((p) => {
      const x = checker.getPropertyOfType(checker.getApparentType(p), name);
      return x ? [x] : [];
    });
  };

  /** 符号模式：按声明位置并组，再补上 TS 改名会连带的几种关系 */
  const bySymbol = (sf: ts.SourceFile, n: ts.Identifier | ts.PrivateIdentifier, k: string, sym: ts.Symbol, checker: ts.TypeChecker) => {
    let found = linkSymbol(sym, k, checker);
    const p = n.parent;
    const isName = (p as ts.Node & { name?: ts.Node }).name === n;
    // 对象字面量里的属性、方法：并到上下文类型上的同名属性（{ 在: …, 依据: … } 写给 事件定义 的）
    if (isName && ts.isObjectLiteralExpression(p.parent) && (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p))) {
      const ct = checker.getContextualType(p.parent);
      if (ct) for (const x of propsOfType(ct, n.text, checker)) found = linkSymbol(x, k, checker) || found;
    }
    // 类、接口的成员：并到基类、实现的接口、继承的接口上的同名成员
    if (isName && (ts.isClassLike(p.parent) || ts.isInterfaceDeclaration(p.parent)) && !(ts.getCombinedModifierFlags(p as ts.Declaration) & ts.ModifierFlags.Static)) {
      const owner = p.parent;
      const bases: ts.Type[] = [];
      const t = checker.getTypeAtLocation(owner);
      if (t.isClassOrInterface()) bases.push(...checker.getBaseTypes(t));
      for (const h of owner.heritageClauses ?? []) if (h.token === ts.SyntaxKind.ImplementsKeyword) for (const e of h.types) bases.push(checker.getTypeAtLocation(e));
      for (const b of bases) for (const x of propsOfType(b, n.text, checker)) found = linkSymbol(x, k, checker) || found;
    }
    if (found) return;
    // 没有声明的：Record<K, …> 这类映射出来的键，顺着初值、实参找原来的键
    if (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) {
      for (const od of originDecls(p.expression, n.text, checker, 0)) {
        mappedLinks++;
        fromDecl(od, k);
        found = true;
      }
    }
    if (found) return;
    // 实在找不到：退回语言服务从出现处查（很少）
    lsFallbacks++;
    if (!lsDone.has(k)) {
      lsDone.add(k);
      viaLs(ws.rel(sf.fileName), n.getStart(sf), k);
    }
  };

  /** 映射键的来源：表达式的类型上这个属性有声明就用它，没有就往初值、调用实参、返回值、展开、类型注解里的 typeof 找。
   *  例：正片事件: Record<keyof typeof 合, …> = Object.fromEntries(…) as …，合 = { ...第15句.事件, … }，事件 = 解事件(定义, 表) */
  const MAX_ORIGIN_DEPTH = 10;
  const originDecls = (e: ts.Expression, name: string, checker: ts.TypeChecker, depth: number, seen = new Set<ts.Node>()): ts.Declaration[] => {
    if (depth > MAX_ORIGIN_DEPTH || seen.has(e)) return [];
    seen.add(e);
    const prop = checker.getPropertyOfType(checker.getTypeAtLocation(e), name);
    const own = prop ? checker.getRootSymbols(prop).flatMap((r) => r.declarations ?? []) : [];
    if (own.length) return own;
    const out: ts.Declaration[] = [];
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) {
      if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) out.push(...fromTypeNode(e.type, name, checker, depth + 1, seen));
      e = e.expression;
    }
    if (ts.isObjectLiteralExpression(e)) {
      for (const p of e.properties) if (ts.isSpreadAssignment(p)) out.push(...originDecls(p.expression, name, checker, depth + 1, seen));
      return out;
    }
    if (ts.isCallExpression(e)) {
      for (const a of e.arguments) out.push(...originDecls(a, name, checker, depth + 1, seen));
      if (out.length) return out;
      const c0 = checker.getSymbolAtLocation(e.expression);
      const callee = c0 && c0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(c0) : c0;
      const vd = callee?.valueDeclaration;
      const fn = vd && ts.isVariableDeclaration(vd) ? vd.initializer : vd;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) {
        if (fn.type) out.push(...fromTypeNode(fn.type, name, checker, depth + 1, seen));
        if (fn.body && !ts.isBlock(fn.body)) out.push(...originDecls(fn.body, name, checker, depth + 1, seen));
      }
      return out;
    }
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) out.push(...fromSymbol(checker.getSymbolAtLocation(e), name, checker, depth + 1, seen));
    return out;
  };
  /** 变量：类型注解里的 typeof 加上初值 */
  const fromSymbol = (s: ts.Symbol | undefined, name: string, checker: ts.TypeChecker, depth: number, seen: Set<ts.Node>): ts.Declaration[] => {
    const t = s && s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    const vd = t?.valueDeclaration;
    if (!vd || !ts.isVariableDeclaration(vd)) return [];
    const out: ts.Declaration[] = [];
    if (vd.type) out.push(...fromTypeNode(vd.type, name, checker, depth, seen));
    if (vd.initializer) out.push(...originDecls(vd.initializer, name, checker, depth, seen));
    return out;
  };
  /** 类型注解：找里面的 typeof X（经过类型别名），从 X 接着找 */
  const fromTypeNode = (tn: ts.TypeNode, name: string, checker: ts.TypeChecker, depth: number, seen: Set<ts.Node>): ts.Declaration[] => {
    if (depth > MAX_ORIGIN_DEPTH || seen.has(tn)) return [];
    seen.add(tn);
    const out: ts.Declaration[] = [];
    const visit = (x: ts.Node) => {
      if (ts.isTypeQueryNode(x)) out.push(...fromSymbol(checker.getSymbolAtLocation(x.exprName), name, checker, depth + 1, seen));
      else if (ts.isTypeReferenceNode(x)) {
        const s0 = checker.getSymbolAtLocation(x.typeName);
        const s = s0 && s0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s0) : s0;
        for (const d of s?.declarations ?? []) if (ts.isTypeAliasDeclaration(d)) out.push(...fromTypeNode(d.type, name, checker, depth + 1, seen));
      }
      ts.forEachChild(x, visit);
    };
    visit(tn);
    return out;
  };

  /** 简写里属性那一面：有上下文类型（或解构来源类型）上的属性就从它的声明查；查不到的留单独一处 */
  const handleProp = (sf: ts.SourceFile, n: ts.Identifier, checker: ts.TypeChecker) => {
    const k = addLoc(nodeLoc(sf, n, 'p'));
    let type: ts.Type | undefined;
    if (ts.isShorthandPropertyAssignment(n.parent)) type = checker.getContextualType(n.parent.parent as ts.ObjectLiteralExpression);
    else type = checker.getTypeAtLocation(n.parent.parent);
    let prop = type && checker.getPropertyOfType(checker.getApparentType(type), n.text);
    if (!prop && !opt.useLs && ts.isShorthandPropertyAssignment(n.parent)) prop = checker.getSymbolAtLocation(n);
    if (!prop) {
      if (ts.isBindingElement(n.parent)) {
        const t = type;
        if (!t || t.flags & ts.TypeFlags.Any) uf.union(k, `U:${n.text}`);
      }
      return;
    }
    if (!opt.useLs) {
      linkSymbol(prop, k, checker);
      return;
    }
    const roots = checker.getRootSymbols(prop);
    const d = roots.flatMap((r) => r.declarations ?? []).find((x) => inScope(ws.rel(x.getSourceFile().fileName)));
    if (!d) return;
    if (d.getSourceFile() === sf && ts.getNameOfDeclaration(d) === n) return; // 就是它自己
    fromDecl(d, k);
  };

  /** 字符串字面量（扫的文件里、内容像标识符、含汉字的），后面解强引用、列字符串引用用 */
  const strings: { sf: ts.SourceFile; node: ts.StringLiteralLike; checker: ts.TypeChecker }[] = [];
  const codeStrings: { sf: ts.SourceFile; node: ts.Node }[] = [];
  const codeSeen = new Set<ts.Node>();

  /** 赋值处（实参、带注解的初值、返回值、属性值、数组元素、JSX 属性）：值不是当场写的对象字面量时，
   *  TS 改名不连源类型和目标类型的同名属性（结构类型），漏了要么编译错，目标属性是可选的就静默丢值。后面按类型配对并组 */
  const flows: { node: ts.Expression; checker: ts.TypeChecker }[] = [];
  const isFlowSite = (n: ts.Node): n is ts.Expression => {
    if (!(ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isCallExpression(n) || ts.isElementAccessExpression(n) || ts.isAsExpression(n) || ts.isAwaitExpression(n))) return false;
    const p = n.parent;
    if (!p) return false;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(n as ts.Expression)) return true;
    if (ts.isVariableDeclaration(p) && p.initializer === n && p.type) return true;
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) return true;
    if (ts.isPropertyAssignment(p) && p.initializer === n) return true;
    if (ts.isShorthandPropertyAssignment(p) && p.name === n) return true;
    if (ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p) || ts.isJsxExpression(p)) return true;
    if (ts.isBinaryExpression(p) && p.right === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return true;
    return false;
  };

  /** 模板字符串按整段认是不是代码：生成代码的模板 import 写在开头，后面 ${…} 之间的片段单看不像代码 */
  const codeTemplateCache = new Map<ts.Node, boolean>();
  const codeTemplate = (n: ts.Node): boolean => {
    const t = ts.findAncestor(n, ts.isTemplateExpression);
    if (!t) return false;
    let r = codeTemplateCache.get(t);
    if (r === undefined) codeTemplateCache.set(t, (r = CODE_HINT.test([t.head.text, ...t.templateSpans.map((x) => x.literal.text)].join(''))));
    return r;
  };

  let fileNo = 0;
  for (const rel of scanFiles) {
    fileNo++;
    if (fileNo % 200 === 0) log(`扫 ${fileNo}/${scanFiles.length}，语言服务查询 ${lsCalls} 次（${(lsMs / 1000).toFixed(0)} 秒），${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
    const text = ws.text(rel);
    if (!HAN.test(text)) continue;
    const sf = ws.sourceFile(rel);
    const checker = ws.program(rel).getTypeChecker();
    walk(sf, (n) => {
      if (!opt.useLs && isFlowSite(n)) flows.push({ node: n, checker });
      if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        if (ts.isStringLiteralLike(n) && HAN.test(n.text) && IDENT_LIKE.test(n.text)) strings.push({ sf, node: n, checker });
        else if (HAN.test(n.text) && (CODE_HINT.test(n.text) || codeTemplate(n))) {
          // 模板按整段扫一次（片段单扫会从生成代码的字符串中间开始）
          const t = ts.isStringLiteralLike(n) ? n : ts.findAncestor(n, ts.isTemplateExpression);
          if (t && !codeSeen.has(t)) {
            codeSeen.add(t);
            codeStrings.push({ sf, node: t });
          }
        }
        return;
      }
      if (!(ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) || !HAN.test(n.text)) return;
      occurrences++;
      if (ts.isIdentifier(n) && isShorthand(n)) {
        const v = ts.isShorthandPropertyAssignment(n.parent) ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n);
        handle(sf, n, 'v', v, checker);
        handleProp(sf, n, checker);
        return;
      }
      handle(sf, n, '', checker.getSymbolAtLocation(n), checker);
    });
  }
  log(`出现处走完：${occurrences} 处，语言服务查询 ${lsCalls} 次（${(lsMs / 1000).toFixed(0)} 秒）`);

  // ---- 结构配对：源类型、目标类型上同名（含汉字）的属性并组，顺着属性值、索引值、数组元素往里走 ----
  let structLinks = 0;
  let structKey = 0;
  const typeId = (t: ts.Type) => (t as ts.Type & { id: number }).id;
  const isObjectish = (t: ts.Type) => (t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Union | ts.TypeFlags.Intersection)) !== 0;
  /** 目标上 name 对应的值类型：属性、字符串索引，或 Record<K, V>、Readonly<…> 这类别名里的 V（K 还是类型参数时） */
  const targetValueTypes = (t: ts.Type, name: string, checker: ts.TypeChecker): ts.Type[] => {
    const out: ts.Type[] = [];
    for (const part of t.isUnion() ? t.types : [t]) {
      const a = checker.getApparentType(part);
      const p = checker.getPropertyOfType(a, name);
      if (p) out.push(checker.getTypeOfSymbol(p));
      else {
        const ix = checker.getIndexTypeOfType(a, ts.IndexKind.String);
        if (ix) out.push(ix);
        else if (part.aliasSymbol?.name === 'Record' && part.aliasTypeArguments?.[1]) out.push(part.aliasTypeArguments[1]);
        else if (part.aliasSymbol && ['Readonly', 'Partial', 'Required'].includes(part.aliasSymbol.name) && part.aliasTypeArguments?.[0])
          out.push(...targetValueTypes(part.aliasTypeArguments[0], name, checker));
      }
    }
    return out;
  };
  const pair = (src: ts.Type, tgt: ts.Type, checker: ts.TypeChecker, depth: number, seen: Set<string>) => {
    if (depth > 6 || !isObjectish(src) || !isObjectish(tgt)) return;
    const pk = `${typeId(src)}:${typeId(tgt)}`;
    if (seen.has(pk) || typeId(src) === typeId(tgt)) return;
    seen.add(pk);
    for (const sp of src.isUnion() ? src.types : [src]) {
      // 数组、元组：元素对元素
      const se = checker.getIndexTypeOfType(sp, ts.IndexKind.Number);
      if (se && (checker.isArrayType(sp) || checker.isTupleType(sp))) {
        for (const tp of tgt.isUnion() ? tgt.types : [tgt]) {
          const te = checker.getIndexTypeOfType(checker.getApparentType(tp), ts.IndexKind.Number);
          if (te) pair(se, te, checker, depth + 1, seen);
        }
        continue;
      }
      for (const prop of checker.getPropertiesOfType(sp)) {
        // 外层键是 ASCII（a、b）里面的属性也可能含汉字：只并含汉字的，但都往里走
        const sd = HAN.test(prop.name) ? declsOf(prop, checker) : [];
        const td = sd.length ? propsOfType(tgt, prop.name, checker).flatMap((x) => declsOf(x, checker)) : [];
        if (sd.length && td.length) {
          const k = `T:${structKey++}`;
          for (const d of [...sd, ...td]) fromDecl(d, k);
          structLinks++;
        }
        for (const tv of targetValueTypes(tgt, prop.name, checker)) pair(checker.getTypeOfSymbol(prop), tv, checker, depth + 1, seen);
      }
    }
  };
  for (const { node, checker } of flows) {
    let tgt = checker.getContextualType(node);
    // [...xs] 里的 xs 自己没有上下文类型，用外面数组字面量的
    if (!tgt && ts.isSpreadElement(node.parent) && ts.isArrayLiteralExpression(node.parent.parent)) tgt = checker.getContextualType(node.parent.parent);
    if (!tgt || tgt.flags & ts.TypeFlags.Any) continue;
    pair(checker.getTypeAtLocation(node), tgt, checker, 0, new Set());
  }
  log(`结构配对：赋值处 ${flows.length} 个，并组 ${structLinks} 次`);

  // ---- 字符串：能解到属性的并进组，其余列成字符串引用 ----
  const declKeyOf = (sym: ts.Symbol, checker: ts.TypeChecker): string[] => {
    const out: string[] = [];
    for (const r of [sym])
      for (const d of declsOf(r, checker)) {
        const nm = ts.getNameOfDeclaration(d);
        if (!nm) continue;
        const f = ws.rel(d.getSourceFile().fileName);
        const pos = nm.getStart(d.getSourceFile()) + (ts.isStringLiteral(nm) ? 1 : 0);
        const k = keyOf(f, pos, ts.isShorthandPropertyAssignment(d) ? 'p' : '');
        if (uf.has(k)) out.push(k);
      }
    return out;
  };
  const propsOf = (t: ts.Type, name: string, checker: ts.TypeChecker): ts.Symbol[] => {
    const parts = t.isUnion() ? t.types : [t];
    return parts.flatMap((p) => {
      const s = checker.getPropertyOfType(checker.getApparentType(p), name);
      return s ? [s] : [];
    });
  };
  const strongTargets = (s: ts.StringLiteralLike, checker: ts.TypeChecker): ts.Symbol[] => {
    const p = s.parent;
    // o['名']（符号模式；语言服务模式由 findRenameLocations 收）
    if (ts.isElementAccessExpression(p) && p.argumentExpression === s) {
      const x = checker.getSymbolAtLocation(s);
      return x ? [x] : [];
    }
    // '名' in x
    if (ts.isBinaryExpression(p) && p.left === s && p.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      const direct = propsOf(checker.getTypeAtLocation(p.right), s.text, checker);
      if (direct.length || !ts.isIdentifier(p.right)) return direct;
      // 类型守卫 (t: object): t is 基本时刻 => '接' in t：t 本身是 object，属性在谓词的类型上
      const right = p.right;
      const fn = ts.findAncestor(p, (a): a is ts.SignatureDeclaration => ts.isFunctionLike(a) && !!a.type && ts.isTypePredicateNode(a.type));
      const pred = fn?.type && ts.isTypePredicateNode(fn.type) ? fn.type : undefined;
      if (pred?.type && ts.isIdentifier(pred.parameterName) && pred.parameterName.text === right.text) return propsOf(checker.getTypeFromTypeNode(pred.type), s.text, checker);
      return [];
    }
    if (ts.isLiteralTypeNode(p)) {
      let top: ts.Node = p;
      while (ts.isUnionTypeNode(top.parent)) top = top.parent;
      const ref = top.parent;
      // Pick<T, '名'>、Omit<T, '名' | …> 这类：头一个类型实参上的属性
      if (ts.isTypeReferenceNode(ref) && ref.typeArguments && ref.typeArguments.indexOf(top as ts.TypeNode) >= 1)
        return propsOf(checker.getTypeFromTypeNode(ref.typeArguments[0]!), s.text, checker);
      if (ts.isIndexedAccessTypeNode(ref) && ref.indexType === top) return propsOf(checker.getTypeFromTypeNode(ref.objectType), s.text, checker);
      return [];
    }
    // const k: keyof T = '名'
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isPropertyDeclaration(p)) && p.initializer === s && p.type) {
      if (ts.isTypeOperatorNode(p.type) && p.type.operator === ts.SyntaxKind.KeyOfKeyword) return propsOf(checker.getTypeFromTypeNode(p.type.type), s.text, checker);
    }
    return [];
  };
  const isChecked = (s: ts.StringLiteralLike, checker: ts.TypeChecker) => {
    if (ts.isLiteralTypeNode(s.parent)) return true; // 类型位置上的字面量，TS 总会查
    if (ts.isExpression(s)) {
      const ct = checker.getContextualType(s);
      if (!ct) return false;
      const parts = ct.isUnion() ? ct.types : [ct];
      return parts.some((x) => x.isStringLiteral() && x.value === s.text) && !parts.some((x) => x.flags & ts.TypeFlags.String);
    }
    return false;
  };
  const weak = new Map<string, StringRef[]>();
  let strong = 0;
  for (const { sf, node, checker } of strings) {
    const rel = ws.rel(sf.fileName);
    const start = node.getStart(sf) + 1;
    const k = keyOf(rel, start, '');
    if (uf.has(k)) continue; // 语言服务已经收进组了（下标访问 o['名'] 这类）
    const targets = strongTargets(node, checker).flatMap((t) => declKeyOf(t, checker));
    if (targets.length) {
      strong++;
      addLoc({ file: rel, start, end: node.end - 1, role: '', str: true });
      for (const t of targets) uf.union(k, t);
      continue;
    }
    const list = weak.get(node.text) ?? [];
    list.push({ file: rel, start, end: node.end - 1, line: sf.getLineAndCharacterOfPosition(start).line + 1, checked: isChecked(node, checker), via: '字面量' });
    weak.set(node.text, list);
  }
  const tokenRefs = (file: string, text: string, from: number, to: number, via: StringRef['via'], lineOf: (p: number) => number) => {
    const seg = text.slice(from, to);
    for (const m of seg.matchAll(TOKEN)) {
      if (!HAN.test(m[0])) continue;
      const start = from + m.index;
      const list = weak.get(m[0]) ?? [];
      list.push({ file, start, end: start + m[0].length, line: lineOf(start), checked: false, via });
      weak.set(m[0], list);
    }
  };
  for (const { sf, node } of codeStrings) {
    const rel = ws.rel(sf.fileName);
    const from = node.getStart(sf) + 1;
    for (const id of embeddedIdentifiers(sf, from, node.end - 1, ts.isTemplateExpression(node) ? node : undefined)) {
      if (!HAN.test(id.text)) continue;
      const list = weak.get(id.text) ?? [];
      list.push({ file: rel, start: id.start, end: id.start + id.text.length, line: sf.getLineAndCharacterOfPosition(id.start).line + 1, checked: false, via: '嵌入代码' });
      weak.set(id.text, list);
    }
  }
  const textRe = [...DEFAULT_TEXT_FILES, ...(opt.textFiles ?? [])];
  const textFiles = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: ws.root, maxBuffer: 1 << 28 })
    .toString()
    .split('\0')
    .filter((f) => f && textRe.some((r) => r.test(f)));
  for (const f of textFiles) {
    const text = ws.text(f);
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const lineOf = (p: number) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid]! <= p) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    };
    tokenRefs(f, text, 0, text.length, '文本文件', lineOf);
  }

  // ---- 成组 ----
  const members = new Map<string, string[]>();
  for (const k of [...uf.keys()]) {
    if (!locs.has(k)) continue;
    const r = uf.find(k);
    const m = members.get(r) ?? [];
    m.push(k);
    members.set(r, m);
  }
  const groups: Group[] = [];
  const usedIds = new Map<string, number>();
  const ioFile = new Map<string, boolean>();
  const isIo = (f: string) => {
    let v = ioFile.get(f);
    if (v === undefined) ioFile.set(f, (v = IO_HINT.test(ws.text(f))));
    return v;
  };
  const lines = new Map<string, string[]>();
  const lineOf = (f: string, i: number) => {
    let l = lines.get(f);
    if (!l) lines.set(f, (l = ws.text(f).split('\n')));
    const s = l[i] ?? '';
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  };
  const unresolvedRoots = new Set<string>();
  for (const k of uf.keys()) if (k.startsWith('U:')) unresolvedRoots.add(uf.find(k));

  for (const [r, keys] of members) {
    const ls = keys.map((k) => locs.get(k)!).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start || a.role.localeCompare(b.role)));
    const names = new Set(ls.map((l) => ws.text(l.file).slice(l.start, l.end)));
    const name = [...names].find((x) => HAN.test(x)) ?? [...names][0]!;
    const kinds = new Set<string>();
    let exported = false;
    let jsx = false;
    let declLoc: Loc | undefined;
    let declNode: ts.Node | undefined;
    let declKindNow = '';
    let keyLike: string[] | undefined;
    let hasSignature = false;
    const declIds = new Set<string>();
    const declFiles = new Set<string>();
    for (const l of ls) {
      if (l.str || !/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(l.file)) {
        if (/\.json$/.test(l.file)) kinds.add('JSON 键');
        continue;
      }
      const sf = ws.sourceFile(l.file);
      const id = identifierAt(sf, l.start);
      if (!id) continue;
      const p = id.parent;
      if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) jsx = true;
      const dk = declKind(id, l.role);
      if (!dk) continue;
      kinds.add(dk.kind);
      declIds.add(`${l.file}#${chainOf(dk.decl, name)}`);
      declFiles.add(l.file);
      if (ts.isPropertySignature(dk.decl) || ts.isPropertyDeclaration(dk.decl) || ts.isMethodSignature(dk.decl)) hasSignature = true;
      const sig = ts.isPropertySignature(dk.decl) || ts.isPropertyDeclaration(dk.decl) || ts.isMethodSignature(dk.decl) || ts.isMethodDeclaration(dk.decl);
      const curSig = !!declNode && (ts.isPropertySignature(declNode) || ts.isPropertyDeclaration(declNode) || ts.isMethodSignature(declNode) || ts.isMethodDeclaration(declNode));
      if (!declLoc || rank(dk.kind) < rank(declKindNow) || (rank(dk.kind) === rank(declKindNow) && sig && !curSig)) {
        declLoc = l;
        declNode = dk.decl;
        declKindNow = dk.kind;
      }
      if (ts.getCombinedModifierFlags(dk.decl as ts.Declaration) & ts.ModifierFlags.Export) exported = true;
      else if (ts.isSourceFile(dk.decl.parent) || (ts.isVariableDeclaration(dk.decl) && ts.isSourceFile(dk.decl.parent.parent.parent))) {
        const checker = ws.program(l.file).getTypeChecker();
        const s = checker.getSymbolAtLocation(id);
        const ex = exportedOf(sf, checker);
        if (s && (ex.has(s) || ex.has(checker.getExportSymbolOfSymbol(s)))) exported = true;
      }
    }
    const unresolved = unresolvedRoots.has(r);
    let kind = unresolved ? '未解析属性' : declNode ? declKindNow : '无声明';
    if (kind === '局部变量' && exported) kind = '变量';
    if (jsx && ['函数', '变量', '类', '局部变量', '导入别名'].includes(kind)) kind = kind === '导入别名' ? '导入别名' : 'JSX 组件';
    if (declNode && (ts.isPropertyAssignment(declNode) || ts.isShorthandPropertyAssignment(declNode)) && !hasSignature) {
      const reasons = keyLikeReasons(declNode.parent as ts.ObjectLiteralExpression, ws);
      if (reasons.length) keyLike = reasons;
    }
    const fileSet = new Set(ls.map((l) => l.file));
    // 组 id：声明所在文件 # 外层具名声明链（名字和位置无关，改上面几行不变）
    const chainNode = declNode;
    const firstFile = (declLoc ?? ls[0]!).file;
    let id = unresolved
      ? `?${name}`
      : `${firstFile}#${chainNode ? chainOf(chainNode, name) : `~${name}@${ws.sourceFile(firstFile).getLineAndCharacterOfPosition(ls[0]!.start).line + 1}`}`;
    const dup = usedIds.get(id) ?? 0;
    usedIds.set(id, dup + 1);
    if (dup) id += `~${dup + 1}`;
    const g: Group = {
      id,
      name,
      kind,
      kinds: [...kinds],
      exported,
      files: fileSet.size,
      count: ls.length,
      uses: [],
      flags: {},
      locs: ls,
    };
    // 结构配对、映射键会把别处的声明并进来，组 id 跟着最靠前的声明变；表里写组里任何一个声明的 id 都认
    declIds.delete(id);
    if (declIds.size) g.aliases = [...declIds];
    if (names.size > 1) g.flags.multiName = [...names];
    if (keys.some((k) => cannot.has(k))) g.flags.cannotRename = true;
    if (jsx) g.flags.jsxComponent = true;
    if (keyLike) g.flags.keyLike = keyLike;
    const anchor = declLoc ?? ls[0]!;
    if (!opt.useLs && opt.only && !inOnly(anchor.file) && ![...declFiles].some(inOnly)) continue;
    const asf = /\.json$/.test(anchor.file) ? undefined : ws.sourceFile(anchor.file);
    if (asf) {
      const lc = asf.getLineAndCharacterOfPosition(anchor.start);
      g.decl = { file: anchor.file, line: lc.line + 1, col: lc.character + 1 };
      g.context = {
        before: [lineOf(anchor.file, lc.line - 2), lineOf(anchor.file, lc.line - 1)].filter((x, i) => lc.line - 2 + i >= 0),
        line: lineOf(anchor.file, lc.line),
        after: [lineOf(anchor.file, lc.line + 1), lineOf(anchor.file, lc.line + 2)],
      };
      if (declNode) {
        const c = leadingComment(declNode, asf);
        if (c) g.context.comment = c;
      }
      const seen = new Set<string>([anchor.file]);
      const others = ls.filter((l) => l !== anchor);
      const pick = [...others.filter((l) => !seen.has(l.file)), ...others.filter((l) => l.file === anchor.file)];
      for (const l of pick) {
        if (g.uses.length >= 3) break;
        if (l.file !== anchor.file && seen.has(l.file)) continue;
        if (l.file === anchor.file && g.uses.some((u) => u.file === anchor.file)) continue;
        seen.add(l.file);
        if (/\.json$/.test(l.file)) continue;
        const line = ws.sourceFile(l.file).getLineAndCharacterOfPosition(l.start).line;
        g.uses.push({ file: l.file, line: line + 1, text: lineOf(l.file, line).trim() });
      }
    }
    // 盘上字段：名字出现在盘上数据的键里；组里有读写盘的文件（或就在 JSON 里）算「是」，没有算「疑似」
    if (['属性', '未解析属性', '方法', '无声明', 'JSON 键'].includes(kind) || kinds.has('属性')) {
      const inJson = ls.some((l) => /\.json$/.test(l.file));
      if (inJson || opt.diskKeys?.has(name)) {
        const io = [...fileSet].filter((f) => /\.json$/.test(f) || isIo(f));
        g.flags.disk = inJson || io.length ? '是' : '疑似';
        if (io.length) g.flags.diskEvidence = io.slice(0, 5);
      }
    }
    const refs = weak.get(name);
    if (refs?.length) {
      g.flags.stringRefs = refs.length;
      g.flags.stringRefsUnchecked = refs.filter((x) => !x.checked).length;
      g.flags.stringRefSamples = refs.slice(0, 8).map((x) => `${x.file}:${x.line}${x.via === '字面量' ? (x.checked ? '' : '（TS 不查）') : `（${x.via}）`}`);
      const via: Record<string, number> = {};
      for (const x of refs) via[x.via] = (via[x.via] ?? 0) + 1;
      g.flags.stringRefsVia = via;
    }
    groups.push(g);
  }
  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const hashes: Record<string, string> = {};
  const touched = new Set<string>();
  for (const g of groups) for (const l of g.locs) touched.add(l.file);
  const names = new Set(groups.map((g) => g.name));
  for (const [k, s] of weak) if (names.has(k)) for (const x of s) touched.add(x.file);
  for (const f of touched) hashes[f] = sha1(ws.text(f));

  const byKind: Record<string, number> = {};
  for (const g of groups) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
  const stats = {
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    filesScanned: scanFiles.length,
    occurrences,
    groups: groups.length,
    distinctNames: new Set(groups.map((g) => g.name)).size,
    lsCalls,
    lsSeconds: Math.round(lsMs / 100) / 10,
    strongStringRefs: strong,
    mappedKeyLinks: mappedLinks,
    structLinks,
    mode: opt.useLs ? '语言服务' : '符号',
    lsFallbacks,
    byKind,
    flags: {
      disk是: groups.filter((g) => g.flags.disk === '是').length,
      disk疑似: groups.filter((g) => g.flags.disk === '疑似').length,
      stringRefs: groups.filter((g) => g.flags.stringRefs).length,
      stringRefsUnchecked: groups.filter((g) => g.flags.stringRefsUnchecked).length,
      stringRefsEmbeddedCode: groups.filter((g) => g.flags.stringRefsVia?.['嵌入代码']).length,
      stringRefsTextFile: groups.filter((g) => g.flags.stringRefsVia?.['文本文件']).length,
      keyLike: groups.filter((g) => g.flags.keyLike).length,
      exported: groups.filter((g) => g.exported).length,
      crossFile: groups.filter((g) => g.files > 1).length,
      cannotRename: groups.filter((g) => g.flags.cannotRename).length,
      multiName: groups.filter((g) => g.flags.multiName).length,
    },
  };
  const groupNames = new Set(groups.map((g) => g.name));
  return { root: ws.root, hashes, groups, strings: Object.fromEntries([...weak].filter(([k]) => groupNames.has(k))), stats };
};

// ---------- 种类、id、上下文 ----------

const KIND_RANK = ['类', '接口', '类型', '函数', '方法', '访问器', '属性', '枚举成员', '枚举', '命名空间', '变量', '局部变量', '参数', '类型参数', '导入别名', '导出别名', '标签'];
const rank = (k: string) => {
  const i = KIND_RANK.indexOf(k);
  return i < 0 ? 99 : i;
};

const isFunctionInit = (e: ts.Expression | undefined): boolean => {
  if (!e) return false;
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return true;
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) return isFunctionInit(e.expression);
  return false;
};

/** 标识符是不是某个声明的名字；是就给声明和种类 */
const declKind = (id: ts.Identifier | ts.PrivateIdentifier, role: Role): { decl: ts.Node; kind: string } | undefined => {
  const p = id.parent;
  if (role === 'v' && ts.isShorthandPropertyAssignment(p)) return undefined;
  if (role === 'p' && ts.isBindingElement(p)) return undefined;
  if (ts.isLabeledStatement(p) && p.label === id) return { decl: p, kind: '标签' };
  const named = p as ts.Node & { name?: ts.Node };
  if (named.name !== id && !(ts.isImportClause(p) || ts.isNamespaceImport(p))) return undefined;
  if (ts.isImportClause(p) && p.name !== id) return undefined;
  return { decl: p, kind: kindOf(p) };
};

const kindOf = (d: ts.Node): string => {
  if (ts.isVariableDeclaration(d)) {
    if (isFunctionInit(d.initializer)) return '函数';
    return ts.isVariableStatement(d.parent.parent) && ts.isSourceFile(d.parent.parent.parent) ? '变量' : '局部变量';
  }
  if (ts.isBindingElement(d)) return '局部变量';
  if (ts.isParameter(d)) return '参数';
  if (ts.isFunctionDeclaration(d) || ts.isFunctionExpression(d)) return '函数';
  if (ts.isClassDeclaration(d) || ts.isClassExpression(d)) return '类';
  if (ts.isInterfaceDeclaration(d)) return '接口';
  if (ts.isTypeAliasDeclaration(d)) return '类型';
  if (ts.isTypeParameterDeclaration(d)) return '类型参数';
  if (ts.isEnumDeclaration(d)) return '枚举';
  if (ts.isEnumMember(d)) return '枚举成员';
  if (ts.isModuleDeclaration(d)) return '命名空间';
  if (ts.isPropertyAssignment(d) || ts.isShorthandPropertyAssignment(d)) return isFunctionInit(ts.isPropertyAssignment(d) ? d.initializer : undefined) ? '方法' : '属性';
  if (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) return '属性';
  if (ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) return '方法';
  if (ts.isGetAccessor(d) || ts.isSetAccessor(d)) return '访问器';
  if (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d) || ts.isImportEqualsDeclaration(d)) return '导入别名';
  if (ts.isExportSpecifier(d)) return '导出别名';
  if (ts.isLabeledStatement(d)) return '标签';
  if (ts.isJsxAttribute(d)) return '属性';
  return '其他';
};

/** 外层具名声明链：解事件.名、时刻.秒、定义.第15句对视 */
/** 字符串里写的代码（生成代码的模板、测试里的代码样本）中的标识符。按源码原文扫（位置就是源码位置）：
 *  ${…} 换成等长空白，转义的引号去掉反斜杠，用 TS 的扫描器跳过代码里的字符串、模板、注释 */
const embeddedIdentifiers = (sf: ts.SourceFile, from: number, to: number, tpl?: ts.TemplateExpression): { text: string; start: number }[] => {
  const raw = sf.text.slice(from, to).split('');
  if (tpl)
    for (const span of tpl.templateSpans) {
      // ${ 在表达式前两个字符，} 在表达式之后（中间可能有空白）
      const a = span.expression.pos - 2 - from;
      const b = span.literal.getStart(sf) + 1 - from;
      for (let i = Math.max(0, a); i < Math.min(raw.length, b); i++) if (raw[i] !== '\n') raw[i] = ' ';
    }
  for (let i = 0; i + 1 < raw.length; i++) if (raw[i] === '\\' && /['"`]/.test(raw[i + 1]!)) raw[i] = ' ';
  const code = raw.join('');
  const sc = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  const out: { text: string; start: number }[] = [];
  const braces: number[] = []; // 模板 ${ 的花括号深度
  let depth = 0;
  for (let k = sc.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = sc.scan()) {
    if (k === ts.SyntaxKind.Identifier) out.push({ text: sc.getTokenValue(), start: from + sc.getTokenStart() });
    else if (k === ts.SyntaxKind.TemplateHead) braces.push(depth);
    else if (k === ts.SyntaxKind.OpenBraceToken) depth++;
    else if (k === ts.SyntaxKind.CloseBraceToken) {
      if (braces.length && braces.at(-1) === depth) {
        const r = sc.reScanTemplateToken(false);
        if (r === ts.SyntaxKind.TemplateTail) braces.pop();
      } else depth--;
    }
  }
  return out;
};

const chainOf = (decl: ts.Node, name: string): string => {
  const parts = [name];
  for (let a: ts.Node | undefined = decl.parent; a && !ts.isSourceFile(a); a = a.parent) {
    const nm = (a as ts.Node & { name?: ts.Node }).name;
    if (
      nm &&
      (ts.isIdentifier(nm) || ts.isStringLiteral(nm) || ts.isPrivateIdentifier(nm)) &&
      (ts.isFunctionLike(a) ||
        ts.isClassLike(a) ||
        ts.isInterfaceDeclaration(a) ||
        ts.isTypeAliasDeclaration(a) ||
        ts.isVariableDeclaration(a) ||
        ts.isPropertyAssignment(a) ||
        ts.isPropertySignature(a) ||
        ts.isPropertyDeclaration(a) ||
        ts.isModuleDeclaration(a))
    )
      parts.push(nm.text);
  }
  return parts.reverse().join('.');
};

const leadingComment = (decl: ts.Node, sf: ts.SourceFile): string | undefined => {
  let host: ts.Node = decl;
  if (ts.isVariableDeclaration(decl) && ts.isVariableDeclarationList(decl.parent) && ts.isVariableStatement(decl.parent.parent)) host = decl.parent.parent;
  const text = sf.text;
  const ranges = [...(ts.getLeadingCommentRanges(text, host.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(text, host.end) ?? [])];
  if (!ranges.length) return undefined;
  const c = ranges
    .map((r) => text.slice(r.pos, r.end))
    .join('\n')
    .trim();
  return c.length > 300 ? c.slice(0, 300) + '…' : c;
};

/** 对象字面量是不是当表用（键是数据）：给出看出来的理由 */
const keyLikeReasons = (ol: ts.ObjectLiteralExpression, ws: Workspace): string[] => {
  const reasons: string[] = [];
  const sf = ol.getSourceFile();
  const checker = ws.program(ws.rel(sf.fileName)).getTypeChecker();
  let top: ts.Node = ol;
  while (ts.isAsExpression(top.parent) || ts.isSatisfiesExpression(top.parent) || ts.isParenthesizedExpression(top.parent)) {
    const p = top.parent;
    if ((ts.isAsExpression(p) || ts.isSatisfiesExpression(p)) && !ts.isConstTypeReference(p.type)) {
      const t = checker.getTypeFromTypeNode(p.type);
      if (checker.getIndexInfosOfType(t).length) reasons.push(`${ts.isAsExpression(p) ? 'as' : 'satisfies'} 带索引签名的类型`);
    }
    top = p;
  }
  const ct = checker.getContextualType(ol);
  if (ct && checker.getIndexInfosOfType(ct).length && !reasons.length) reasons.push('上下文类型带索引签名');
  // 容器变量在本文件里的用法：Object.keys/entries/values、动态下标、keyof typeof、for in
  if (ts.isVariableDeclaration(top.parent) && ts.isIdentifier(top.parent.name)) {
    const v = checker.getSymbolAtLocation(top.parent.name);
    const seen = new Set<string>();
    walk(sf, (n) => {
      if (!ts.isIdentifier(n) || n.text !== (top.parent as ts.VariableDeclaration).name.getText(sf) || checker.getSymbolAtLocation(n) !== v) return;
      const p = n.parent;
      if (ts.isCallExpression(p) && p.arguments[0] === n && /^Object\.(keys|entries|values)$/.test(p.expression.getText(sf))) seen.add(p.expression.getText(sf));
      else if (ts.isElementAccessExpression(p) && p.expression === n && !ts.isStringLiteralLike(p.argumentExpression)) seen.add('动态下标');
      else if (ts.isTypeQueryNode(p) && ts.isTypeOperatorNode(p.parent)) seen.add('keyof typeof');
      else if (ts.isForInStatement(p)) seen.add('for in');
    });
    reasons.push(...seen);
  }
  return reasons;
};
