// 认出代码里的函数是不是某个正本的副本（anim check 的「副本」规则用，正本表在 正本表.ts）。三种认法，一处只要一种认出就算：
// - 行为：小的纯函数（不碰外面的状态，只用 Math 这类内置和同一文件里同样能求值的辅助函数）拿正本的探针跑一遍，结果都一样就是副本。
//   改了参数名、换了写法（`a*(1-t)+b*t`）、拆成辅助函数都认得出。函数里有 while、for(;;) 这类循环、JSX、this 的不跑，免得卡死或有副作用。
// - 名字：在函数声明、或初值是函数的变量上用了正本表里登记的名字（lerp、toThree…）。
// - 记号：认得出的写法，比如 mulberry32 的常数 0x6d2b79f5、原版下落的 (v − 0.08) × 0.98。
// 只解析源码，不执行模块；被求值的只有通过上面检查的那一个函数（和它用到的同文件辅助函数）。
import { transformSync } from 'esbuild';
import { 解析, 遍历, 行号, ts } from './语法.ts';

export type 函数节点 = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;
export const 是函数节点 = (n: ts.Node): n is 函数节点 => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);

/** 求值时能用的全局名：Math 这些给冻结的拷贝，THREE、Vector3 给只记 x、y、z 的替身（toThree 一类要用） */
class 替身向量 {
  x: number;
  y: number;
  z: number;
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
const 冻 = <T extends object>(o: T): T => Object.freeze(Object.create(o) as T);
export const 可用全局: Record<string, unknown> = {
  Math: 冻(Math),
  Number: 冻(Number),
  Object: 冻(Object),
  Array: 冻(Array),
  Set,
  Map,
  Error,
  Infinity,
  NaN,
  undefined,
  THREE: Object.freeze({ Vector3: 替身向量 }),
  Vector3: 替身向量,
};
const 可以new = new Set(['Set', 'Map', 'Error', 'Vector3', 'THREE.Vector3']);

/** 函数的名字：函数声明的名，或 `const 名 = (…) => …` 的变量名 */
export const 函数名 = (f: 函数节点): string | undefined => {
  if (ts.isFunctionDeclaration(f)) return f.name?.text;
  const p = f.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === f) return p.name.text;
  if (ts.isFunctionExpression(f) && f.name) return f.name.text;
  return undefined;
};

const 在类型里 = (n: ts.Node, 止: ts.Node) => {
  for (let p = n.parent; p && p !== 止; p = p.parent) if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
  return false;
};

/** 绑定名：参数、变量、内层函数声明的名字（不分块作用域，函数里任何地方声明的都算绑定） */
const 收绑定 = (名: ts.BindingName, 表: Set<string>) => {
  if (ts.isIdentifier(名)) 表.add(名.text);
  else for (const e of 名.elements) if (!ts.isOmittedExpression(e)) 收绑定(e.name, 表);
};

export type 函数信息 = {
  节点: 函数节点;
  名?: string;
  行: number;
  参数数: number;
  /** 能不能拿来求值（没有 JSX、this……）；不能的写原因 */
  不可求值?: string;
  /** 有 while、do、for(;;)：规则里不求值（防卡死），测试里可以放开 */
  有循环: boolean;
  /** 用到的外面的名字（不含可用全局） */
  自由名: Set<string>;
};

export const 分析函数 = (sf: ts.SourceFile, f: 函数节点): 函数信息 => {
  const 绑定 = new Set<string>();
  for (const p of f.parameters) 收绑定(p.name, 绑定);
  if (f.name && ts.isIdentifier(f.name)) 绑定.add(f.name.text);
  const 自由名 = new Set<string>();
  let 不可求值: string | undefined = f.body ? undefined : '没有函数体';
  if (f.asteriskToken || f.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) 不可求值 ??= '生成器或 async';
  const 引用们: ts.Identifier[] = [];
  let 有循环 = false;
  遍历(f, (n) => {
    if (n === f) return;
    if (ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isForStatement(n)) 有循环 = true;
    else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) 不可求值 ??= '有 JSX';
    else if (n.kind === ts.SyntaxKind.ThisKeyword) 不可求值 ??= '用了 this';
    else if (ts.isAwaitExpression(n) || ts.isYieldExpression(n) || ts.isClassLike(n)) 不可求值 ??= '有 await、yield 或类';
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) 不可求值 ??= '动态 import';
    else if (ts.isNewExpression(n) && !可以new.has(n.expression.getText(sf))) 不可求值 ??= `new ${n.expression.getText(sf)}`;
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) 收绑定(n.name, 绑定);
    else if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) 绑定.add(n.name.text);
    else if (ts.isCatchClause(n) && n.variableDeclaration) 收绑定(n.variableDeclaration.name, 绑定);
    if (ts.isIdentifier(n)) 引用们.push(n);
  });
  for (const n of 引用们) {
    const p = n.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)) && p.name === n) continue;
    if (ts.isBindingElement(p) && p.propertyName === n) continue;
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) && p.name === n) continue;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isTypeParameterDeclaration(p)) continue;
    if (在类型里(n, f)) continue;
    if (绑定.has(n.text) || n.text in 可用全局) continue;
    自由名.add(n.text);
  }
  return { 节点: f, 名: 函数名(f), 行: 行号(sf, f), 参数数: f.parameters.length, 不可求值, 有循环, 自由名 };
};

const 编成JS = (源: string): string => {
  const js = transformSync(`(${源})`, { loader: 'ts', format: 'esm', minifyWhitespace: false, logLevel: 'silent' }).code.trim();
  return js.endsWith(';') ? js.slice(0, -1) : js;
};

export type 编选项 = {
  /** 有循环的函数也编（只给测试用：规则里拿探针跑别人的代码，不冒卡死的险） */
  允许循环?: boolean;
  /** 额外给的名字（测试里替副本补上它 import 进来的常数） */
  额外?: Record<string, unknown>;
  /** 换掉可用全局里的值（测试里给真的 THREE，好拿副本摆真相机） */
  全局?: Record<string, unknown>;
};

/** 一个文件里所有函数和简单常数，按名字找（同名不止一个就不用，免得认错作用域） */
export class 文件函数 {
  readonly sf: ts.SourceFile;
  readonly 函数们: 函数信息[] = [];
  #按名 = new Map<string, 函数信息 | null>();
  #常数 = new Map<string, number | null>();
  #编好 = new Map<函数节点, ((...a: unknown[]) => unknown) | null>();
  readonly #选项: 编选项;

  constructor(文件: string, 源码: string, 选项: 编选项 = {}) {
    this.#选项 = 选项;
    this.sf = 解析(文件, 源码);
    遍历(this.sf, (n) => {
      if (是函数节点(n)) {
        const 信息 = 分析函数(this.sf, n);
        this.函数们.push(信息);
        if (信息.名) this.#按名.set(信息.名, this.#按名.has(信息.名) ? null : 信息);
      } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !是函数节点(n.initializer)) {
        const 名 = n.name.text;
        const 值 = 数值常量(n.initializer);
        this.#常数.set(名, this.#常数.has(名) || 值 === undefined ? null : 值);
      }
    });
  }

  按名 = (名: string) => this.#按名.get(名) ?? undefined;

  /** 编出能调用的函数；用到的外面名字都得是可用全局、同文件能求值的函数或数值常量（或选项里给的额外名字），否则 null */
  编(f: 函数信息, 深 = 0): ((...a: unknown[]) => unknown) | null {
    if (this.#编好.has(f.节点)) return this.#编好.get(f.节点)!;
    this.#编好.set(f.节点, null); // 先占位，互相引用的不再往里走
    let r: ((...a: unknown[]) => unknown) | null = null;
    const 额外 = this.#选项.额外 ?? {};
    if (!f.不可求值 && (!f.有循环 || this.#选项.允许循环) && 深 <= 4 && f.节点.getText(this.sf).length <= 3000) {
      const 名们: string[] = [];
      const 值们: unknown[] = [];
      let 行 = true;
      for (const 名 of f.自由名) {
        if (名 in 额外) {
          名们.push(名);
          值们.push(额外[名]);
          continue;
        }
        const 常 = this.#常数.get(名);
        if (typeof 常 === 'number') {
          名们.push(名);
          值们.push(常);
          continue;
        }
        const 依赖 = this.#按名.get(名);
        const 依赖函数 = 依赖 ? this.编(依赖, 深 + 1) : null;
        if (!依赖函数) {
          行 = false;
          break;
        }
        名们.push(名);
        值们.push(依赖函数);
      }
      if (行) {
        try {
          const 全局 = { ...可用全局, ...this.#选项.全局 };
          const 全局名 = Object.keys(全局);
          // 函数声明前面的 export、default 去掉，剩下的当函数表达式编
          const 节 = f.节点;
          const 源 = ts.isFunctionDeclaration(节) && 节.modifiers?.length ? this.sf.text.slice(节.modifiers.end, 节.end).trim() : 节.getText(this.sf);
          const js = 编成JS(源);
          r = new Function(...全局名, ...名们, `"use strict"; return (${js});`)(...全局名.map((k) => 全局[k]), ...值们) as (...a: unknown[]) => unknown;
        } catch {
          r = null;
        }
      }
    }
    this.#编好.set(f.节点, r);
    return r;
  }
}

/** 数字字面量、负号、括号和四则运算组成的常量；别的给 undefined */
const 数值常量 = (n: ts.Expression): number | undefined => {
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (ts.isParenthesizedExpression(n)) return 数值常量(n.expression);
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) {
    const v = 数值常量(n.operand);
    return v === undefined ? undefined : -v;
  }
  if (ts.isBinaryExpression(n)) {
    const a = 数值常量(n.left);
    const b = 数值常量(n.right);
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
export const 规范 = (v: unknown): unknown => {
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as ArrayLike<unknown>, 规范);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number') return { x: o.x, y: o.y, z: o.z };
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, 规范(o[k])]));
  }
  return v;
};

export const 近似相等 = (a: unknown, b: unknown, 容差 = 1e-9): boolean => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    return Math.abs(a - b) <= 容差 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => 近似相等(x, b[i], 容差));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = new Set(Object.keys(b));
    return ka.length === kb.size && ka.every((k) => kb.has(k) && 近似相等((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], 容差));
  }
  return a === b;
};

/** 探针的参数每次现拷一份（被测函数改了参数也不影响下一个） */
const 拷 = (v: unknown): unknown => (typeof v === 'function' ? v : v === undefined ? undefined : structuredClone(v));

/** 拿一组探针比两个函数：都不抛错、结果都近似相等才算一样 */
export const 行为一样 = (甲: (...a: unknown[]) => unknown, 乙: (...a: unknown[]) => unknown, 探针: readonly (readonly unknown[])[]): boolean => {
  for (const 参数 of 探针) {
    let x: unknown;
    let y: unknown;
    try {
      x = 规范(甲(...参数.map(拷)));
      y = 规范(乙(...参数.map(拷)));
    } catch {
      return false;
    }
    if (!近似相等(x, y)) return false;
  }
  return true;
};

/** 从源码里按名字取出一个函数、编成能调用的（测试拿正本和副本对结果用）。取不到或不能求值就抛错，写清原因 */
export const 取函数 = (文件: string, 源码: string, 名: string, 选项: 编选项 = { 允许循环: true }): ((...a: unknown[]) => unknown) => {
  const 表 = new 文件函数(文件, 源码, 选项);
  const f = 表.按名(名);
  if (!f) throw new Error(`${文件} 里没有唯一的函数 ${名}`);
  const g = 表.编(f);
  if (!g) throw new Error(`${文件} 的 ${名} 不能单独求值：${f.不可求值 ?? (f.有循环 && !选项.允许循环 ? '有循环' : `用到了 ${[...f.自由名].join('、')}`)}`);
  return g;
};
