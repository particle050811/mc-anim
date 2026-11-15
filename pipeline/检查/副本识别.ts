// 认出代码里的函数是不是某个正本的副本（anim check 的「副本」规则用，正本表在 正本表.ts）。三种认法，一处只要一种认出就算：
// - 行为：小的纯函数（不碰外面的状态，只用 Math 这类内置和同一文件里同样能求值的辅助函数）拿正本的探针跑一遍，结果都一样就是副本。
//   改了参数名、换了写法（`a*(1-t)+b*t`）、拆成辅助函数都认得出。函数里有 while、for(;;) 这类循环、JSX、this 的不跑，免得卡死或有副作用。
// - 名字：在函数声明、或初值是函数的变量上用了正本表里登记的名字（lerp、toThree…）。
// - 记号：认得出的写法，比如 mulberry32 的常数 0x6d2b79f5、原版下落的 (v − 0.08) × 0.98。
// 只解析源码，不执行模块；被求值的只有通过上面检查的那一个函数（和它用到的同文件辅助函数）。
import { transformSync } from 'esbuild';
import { parseSource, walk, lineNo, ts } from './语法.ts';

export type FnNode = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;
export const isFnNode = (n: ts.Node): n is FnNode => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);

/** 求值时能用的全局名：Math 这些给冻结的拷贝，THREE、Vector3 给只记 x、y、z 的替身（toThree 一类要用） */
class FakeVector3 {
  x: number;
  y: number;
  z: number;
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
const frozenView = <T extends object>(o: T): T => Object.freeze(Object.create(o) as T);
export const availableGlobals: Record<string, unknown> = {
  Math: frozenView(Math),
  Number: frozenView(Number),
  Object: frozenView(Object),
  Array: frozenView(Array),
  Set,
  Map,
  Error,
  Infinity,
  NaN,
  undefined,
  THREE: Object.freeze({ Vector3: FakeVector3 }),
  Vector3: FakeVector3,
};
const allowedNew = new Set(['Set', 'Map', 'Error', 'Vector3', 'THREE.Vector3']);

/** 函数的名字：函数声明的名，或 `const 名 = (…) => …` 的变量名 */
export const functionName = (f: FnNode): string | undefined => {
  if (ts.isFunctionDeclaration(f)) return f.name?.text;
  const p = f.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === f) return p.name.text;
  if (ts.isFunctionExpression(f) && f.name) return f.name.text;
  return undefined;
};

const isInType = (n: ts.Node, stopNode: ts.Node) => {
  for (let p = n.parent; p && p !== stopNode; p = p.parent) if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
  return false;
};

/** 绑定名：参数、变量、内层函数声明的名字（不分块作用域，函数里任何地方声明的都算绑定） */
const collectBindings = (bindingName: ts.BindingName, names: Set<string>) => {
  if (ts.isIdentifier(bindingName)) names.add(bindingName.text);
  else for (const e of bindingName.elements) if (!ts.isOmittedExpression(e)) collectBindings(e.name, names);
};

export type FunctionInfo = {
  节点: FnNode;
  名?: string;
  行: number;
  paramCount: number;
  /** 能不能拿来求值（没有 JSX、this……）；不能的写原因 */
  unevaluable?: string;
  /** 有 while、do、for(;;)：规则里不求值（防卡死），测试里可以放开 */
  hasLoop: boolean;
  /** 用到的外面的名字（不含可用全局） */
  freeNames: Set<string>;
};

export const analyzeFunction = (sf: ts.SourceFile, f: FnNode): FunctionInfo => {
  const bindings = new Set<string>();
  for (const p of f.parameters) collectBindings(p.name, bindings);
  if (f.name && ts.isIdentifier(f.name)) bindings.add(f.name.text);
  const freeNames = new Set<string>();
  let unevaluable: string | undefined = f.body ? undefined : '没有函数体';
  if (f.asteriskToken || f.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) unevaluable ??= '生成器或 async';
  const refIdents: ts.Identifier[] = [];
  let hasLoop = false;
  walk(f, (n) => {
    if (n === f) return;
    if (ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isForStatement(n)) hasLoop = true;
    else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) unevaluable ??= '有 JSX';
    else if (n.kind === ts.SyntaxKind.ThisKeyword) unevaluable ??= '用了 this';
    else if (ts.isAwaitExpression(n) || ts.isYieldExpression(n) || ts.isClassLike(n)) unevaluable ??= '有 await、yield 或类';
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) unevaluable ??= '动态 import';
    else if (ts.isNewExpression(n) && !allowedNew.has(n.expression.getText(sf))) unevaluable ??= `new ${n.expression.getText(sf)}`;
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) collectBindings(n.name, bindings);
    else if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) bindings.add(n.name.text);
    else if (ts.isCatchClause(n) && n.variableDeclaration) collectBindings(n.variableDeclaration.name, bindings);
    if (ts.isIdentifier(n)) refIdents.push(n);
  });
  for (const n of refIdents) {
    const p = n.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)) && p.name === n) continue;
    if (ts.isBindingElement(p) && p.propertyName === n) continue;
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) && p.name === n) continue;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isTypeParameterDeclaration(p)) continue;
    if (isInType(n, f)) continue;
    if (bindings.has(n.text) || n.text in availableGlobals) continue;
    freeNames.add(n.text);
  }
  return { 节点: f, 名: functionName(f), 行: lineNo(sf, f), paramCount: f.parameters.length, unevaluable, hasLoop, freeNames };
};

const compileToJs = (sourceText: string): string => {
  const js = transformSync(`(${sourceText})`, { loader: 'ts', format: 'esm', minifyWhitespace: false, logLevel: 'silent' }).code.trim();
  return js.endsWith(';') ? js.slice(0, -1) : js;
};

export type CompileOptions = {
  /** 有循环的函数也编（只给测试用：规则里拿探针跑别人的代码，不冒卡死的险） */
  allowLoop?: boolean;
  /** 额外给的名字（测试里替副本补上它 import 进来的常数） */
  extra?: Record<string, unknown>;
  /** 换掉可用全局里的值（测试里给真的 THREE，好拿副本摆真相机） */
  globals?: Record<string, unknown>;
};

/** 一个文件里所有函数和简单常数，按名字找（同名不止一个就不用，免得认错作用域） */
export class FileFunctions {
  readonly sf: ts.SourceFile;
  readonly functions: FunctionInfo[] = [];
  #byNameIndex = new Map<string, FunctionInfo | null>();
  #constCache = new Map<string, number | null>();
  #compiledCache = new Map<FnNode, ((...a: unknown[]) => unknown) | null>();
  readonly #options: CompileOptions;

  constructor(file: string, source: string, options: CompileOptions = {}) {
    this.#options = options;
    this.sf = parseSource(file, source);
    walk(this.sf, (n) => {
      if (isFnNode(n)) {
        const fnInfo = analyzeFunction(this.sf, n);
        this.functions.push(fnInfo);
        if (fnInfo.名) this.#byNameIndex.set(fnInfo.名, this.#byNameIndex.has(fnInfo.名) ? null : fnInfo);
      } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !isFnNode(n.initializer)) {
        const constName = n.name.text;
        const constValue = numericConst(n.initializer);
        this.#constCache.set(constName, this.#constCache.has(constName) || constValue === undefined ? null : constValue);
      }
    });
  }

  byName = (fnName: string) => this.#byNameIndex.get(fnName) ?? undefined;

  /** 编出能调用的函数；用到的外面名字都得是可用全局、同文件能求值的函数或数值常量（或选项里给的额外名字），否则 null */
  wrap(f: FunctionInfo, depth = 0): ((...a: unknown[]) => unknown) | null {
    if (this.#compiledCache.has(f.节点)) return this.#compiledCache.get(f.节点)!;
    this.#compiledCache.set(f.节点, null); // 先占位，互相引用的不再往里走
    let r: ((...a: unknown[]) => unknown) | null = null;
    const extra = this.#options.extra ?? {};
    if (!f.unevaluable && (!f.hasLoop || this.#options.allowLoop) && depth <= 4 && f.节点.getText(this.sf).length <= 3000) {
      const names: string[] = [];
      const values: unknown[] = [];
      let rowOk = true;
      for (const freeName of f.freeNames) {
        if (freeName in extra) {
          names.push(freeName);
          values.push(extra[freeName]);
          continue;
        }
        const constValue = this.#constCache.get(freeName);
        if (typeof constValue === 'number') {
          names.push(freeName);
          values.push(constValue);
          continue;
        }
        const dependency = this.#byNameIndex.get(freeName);
        const dependencyFn = dependency ? this.wrap(dependency, depth + 1) : null;
        if (!dependencyFn) {
          rowOk = false;
          break;
        }
        names.push(freeName);
        values.push(dependencyFn);
      }
      if (rowOk) {
        try {
          const globals = { ...availableGlobals, ...this.#options.globals };
          const globalNames = Object.keys(globals);
          // 函数声明前面的 export、default 去掉，剩下的当函数表达式编
          const node = f.节点;
          const sourceText = ts.isFunctionDeclaration(node) && node.modifiers?.length ? this.sf.text.slice(node.modifiers.end, node.end).trim() : node.getText(this.sf);
          const js = compileToJs(sourceText);
          r = new Function(...globalNames, ...names, `"use strict"; return (${js});`)(...globalNames.map((k) => globals[k]), ...values) as (...a: unknown[]) => unknown;
        } catch {
          r = null;
        }
      }
    }
    this.#compiledCache.set(f.节点, r);
    return r;
  }
}

/** 数字字面量、负号、括号和四则运算组成的常量；别的给 undefined */
const numericConst = (n: ts.Expression): number | undefined => {
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (ts.isParenthesizedExpression(n)) return numericConst(n.expression);
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) {
    const v = numericConst(n.operand);
    return v === undefined ? undefined : -v;
  }
  if (ts.isBinaryExpression(n)) {
    const a = numericConst(n.left);
    const b = numericConst(n.right);
    if (a === undefined || b === undefined) return undefined;
    switch (n.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken: return a + b;
      case ts.SyntaxKind.MinusToken: return a - b;
      case ts.SyntaxKind.AsteriskToken: return a * b;
      case ts.SyntaxKind.SlashToken: return a / b;
      default: return undefined;
    }
  }
  return undefined;
};

// ---------- 比结果 ----------

/** 结果规范化：带 x、y、z 数的对象（three 的向量、替身向量）只留这三个；数组、普通对象逐项 */
export const canonicalValue = (v: unknown): unknown => {
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as ArrayLike<unknown>, canonicalValue);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number') return { x: o.x, y: o.y, z: o.z };
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonicalValue(o[k])]));
  }
  return v;
};

export const approxEqual = (a: unknown, b: unknown, tolerance = 1e-9): boolean => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => approxEqual(x, b[i], tolerance));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = new Set(Object.keys(b));
    return ka.length === kb.size && ka.every((k) => kb.has(k) && approxEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tolerance));
  }
  return a === b;
};

/** 探针的参数每次现拷一份（被测函数改了参数也不影响下一个） */
const cloneValue = (v: unknown): unknown => (typeof v === 'function' ? v : v === undefined ? undefined : structuredClone(v));

/** 拿一组探针比两个函数：都不抛错、结果都近似相等才算一样 */
export const isSameBehavior = (fnFirst: (...a: unknown[]) => unknown, secondFn: (...a: unknown[]) => unknown, probes: readonly (readonly unknown[])[]): boolean => {
  for (const params of probes) {
    let x: unknown;
    let y: unknown;
    try {
      x = canonicalValue(fnFirst(...params.map(cloneValue)));
      y = canonicalValue(secondFn(...params.map(cloneValue)));
    } catch {
      return false;
    }
    if (!approxEqual(x, y)) return false;
  }
  return true;
};

/** 从源码里按名字取出一个函数、编成能调用的（测试拿正本和副本对结果用）。取不到或不能求值就抛错，写清原因 */
export const getFunction = (file: string, source: string, fnName: string, options: CompileOptions = { allowLoop: true }): ((...a: unknown[]) => unknown) => {
  const fileFuncs = new FileFunctions(file, source, options);
  const f = fileFuncs.byName(fnName);
  if (!f) throw new Error(`${file} 里没有唯一的函数 ${fnName}`);
  const g = fileFuncs.wrap(f);
  if (!g) throw new Error(`${file} 的 ${fnName} 不能单独求值：${f.unevaluable ?? (f.hasLoop && !options.allowLoop ? '有循环' : `用到了 ${[...f.freeNames].join('、')}`)}`);
  return g;
};
