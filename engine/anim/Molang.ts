// Molang 子集：解析成语法树，再按环境求值。纯模块，不 import react、three。
// 优先级照车万女仆 1.5.3 里打包的 Molang 引擎（unnamed/mocha 分支，BinaryExpression.Op 反汇编），由低到高：
//   赋值 < ?? < 三元 ?: < || < && < == != < < <= > >= < + - < * / < 一元 ! - < 调用、成员
// 所以 `0.8+ysm.food_level<=6?-0.9:0` 是 ((0.8 + food) <= 6) ? −0.9 : 0。
// 支持：数字、'字符串'、true/false、q./query.、v./variable.（含 v.a.b 这种结构）、t./temp.、c./context.、math.*（角度制）、
// 其他命名空间（ysm.has_helmet 这类模组自己的）、函数调用、三元和二元条件（a ? b 不成立时得 0）、多句（; 分隔，return）。
// 不支持：loop、for_each、break、continue、数组、-> 箭头（遇到就报错，不静默算错）。
// 名字不分大小写（Molang 规范），一律转小写；字符串字面量保留原样。
// 数值精度看环境的 数值（默认 double）：
//   float：车万女仆 1.5.3 打包的 mocha（ExpressionEvaluatorImpl 的算术、比较 lambda 签名都是 float，javap 看的）；基岩版官方文档也说 Molang 的数都是 float。
//   double：GeckoLib 4 用的 mclib（IValue.get()、Operation.calculate 都是 double，geckolib-forge-1.20.1-4.8.4 的 jarjar/mclib-20.jar，javap 看的）。
// float 做法：字面量、读到的数、每步算术和函数结果都过 Math.fround（Java 的 float 运算就是每步舍入到 float）。

export type MolangValue = number | string;

type MolangNode =
  | { k: '数'; v: number }
  | { k: '串'; v: string }
  | { k: '名'; 名: string }
  | { k: '调'; 名: string; callParams: MolangNode[] }
  | { k: '一元'; op: '-' | '!'; a: MolangNode }
  | { k: '二元'; op: string; a: MolangNode; b: MolangNode }
  | { k: '条件'; c: MolangNode; a: MolangNode; b?: MolangNode }
  | { k: '赋值'; 名: string; v: MolangNode }
  | { k: '返回'; v: MolangNode }
  | { k: '块'; 句: MolangNode[] };

/** 编译好的表达式：源文、语法树，以及能不能在解析时就算成常数（只含数字和 math 纯函数） */
export type MolangExpr = { readonly 源: string; readonly 树: MolangNode; readonly isConst: boolean };

/**
 * 求值环境。变量表是唯一会被写的东西（赋值 v.x = …），调用方显式传进来、自己决定跨帧留不留；除此之外求值是纯函数。
 * 查询：q.anim_time → 查询.anim_time；函数型查询 q.position_delta(0) 给函数。
 * 外部：别的命名空间按全名查，如 { 'ysm.has_helmet': 1 }。
 * 没给的名字一律得 0（和游戏里一样不报错），名字记进 未知（给了的话），检查用。
 */
export type MolangEnv = {
  query?: Readonly<Record<string, number | ((...queryParams: number[]) => number)>>;
  变量?: Record<string, MolangValue>;
  context?: Readonly<Record<string, number>>;
  external?: Readonly<Record<string, number | ((...extParams: number[]) => number)>>;
  /** 要原样拿参数（含字符串）的函数，按全名查，先于 查询、外部：ysm.second_order('名字', 输入, …) 靠第一个字符串参数认是哪一个系统 */
  functions?: Readonly<Record<string, (argParams: readonly MolangValue[]) => MolangValue>>;
  /** 'float' 每步舍入到 32 位（mocha、基岩版），'double'（默认）不舍入（GeckoLib 4 的 mclib） */
  precision?: 'float' | 'double';
  /** math.random、math.die_roll 用的随机源（0～1）；不给按 0 算，保证可复现 */
  rng?: () => number;
  unresolved?: Set<string>;
};

// ---- 词法 ----
type Token = { t: '数'; v: number } | { t: '串'; v: string } | { t: '名'; v: string } | { t: '符'; v: string };
const operators = ['??', '&&', '||', '==', '!=', '<=', '>=', '->', '+', '-', '*', '/', '<', '>', '!', '?', ':', '(', ')', ',', '=', ';', '{', '}', '[', ']'];

const tokenize = (sourceText: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sourceText.length) {
    const c = sourceText[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const numToken = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?f?/.exec(sourceText.slice(i));
    if (numToken) {
      tokens.push({ t: '数', v: Number.parseFloat(numToken[0]) });
      i += numToken[0].length;
      continue;
    }
    if (c === "'") {
      const j = sourceText.indexOf("'", i + 1);
      if (j < 0) throw new Error(`Molang：字符串没闭合：${sourceText}`);
      tokens.push({ t: '串', v: sourceText.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const identName = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(sourceText.slice(i));
    if (identName) {
      tokens.push({ t: '名', v: identName[0].toLowerCase() });
      i += identName[0].length;
      continue;
    }
    const symbol = operators.find((s) => sourceText.startsWith(s, i));
    if (!symbol) throw new Error(`Molang：认不出的字符 ${c}：${sourceText}`);
    tokens.push({ t: '符', v: symbol });
    i += symbol.length;
  }
  return tokens;
};

// ---- 语法（优先级爬升） ----
const binaryPrecedence: Record<string, number> = {
  '??': 1200, '||': 1600, '&&': 1800, '==': 2000, '!=': 2000,
  '<': 2200, '<=': 2200, '>': 2200, '>=': 2200, '+': 2400, '-': 2400, '*': 2600, '/': 2600,
};
const ternaryPrecedence = 1400;
const unaryPrecedence = 2800;

// 命名空间别名统一成短写
const canonicalName = (rawName: string): string =>
  rawName.replace(/^query\./, 'q.').replace(/^variable\./, 'v.').replace(/^temp\./, 't.').replace(/^context\./, 'c.');

const parse = (sourceText: string): MolangNode => {
  const tokens = tokenize(sourceText);
  let p = 0;
  const peek = () => tokens[p];
  const isSymbol = (v: string) => peek()?.t === '符' && peek()!.v === v;
  const consume = (v: string) => {
    if (!isSymbol(v)) throw new Error(`Molang：这里要 ${v}：${sourceText}`);
    p++;
  };

  const parseTerm = (): MolangNode => {
    const w = tokens[p++];
    if (!w) throw new Error(`Molang：表达式没写完：${sourceText}`);
    if (w.t === '数') return { k: '数', v: w.v };
    if (w.t === '串') return { k: '串', v: w.v };
    if (w.t === '符') {
      if (w.v === '(') {
        const e = parseExpression(0);
        consume(')');
        return e;
      }
      if (w.v === '{') {
        const statements = parseStatements('}');
        consume('}');
        return { k: '块', 句: statements };
      }
      if (w.v === '-' || w.v === '!') return { k: '一元', op: w.v, a: parseExpression(unaryPrecedence) };
      throw new Error(`Molang：不支持的写法 ${w.v}：${sourceText}`);
    }
    if (w.v === 'true' || w.v === 'false') return { k: '数', v: w.v === 'true' ? 1 : 0 };
    if (w.v === 'return') return { k: '返回', v: parseExpression(0) };
    if (['loop', 'for_each', 'break', 'continue'].includes(w.v)) throw new Error(`Molang：不支持 ${w.v}：${sourceText}`);
    const name = canonicalName(w.v);
    if (isSymbol('(')) {
      p++;
      const callParams: MolangNode[] = [];
      while (!isSymbol(')')) {
        callParams.push(parseExpression(0));
        if (isSymbol(',')) p++;
        else break;
      }
      consume(')');
      return { k: '调', 名: name, callParams };
    }
    if (isSymbol('=')) {
      p++;
      return { k: '赋值', 名: name, v: parseExpression(0) };
    }
    return { k: '名', 名: name };
  };

  const parseExpression = (minPrec: number): MolangNode => {
    let leftOperand = parseTerm();
    for (;;) {
      const w = peek();
      if (!w || w.t !== '符') break;
      if (w.v === '?' && ternaryPrecedence >= minPrec) {
        p++;
        const a = parseExpression(ternaryPrecedence);
        let b: MolangNode | undefined;
        if (isSymbol(':')) {
          p++;
          b = parseExpression(ternaryPrecedence);
        }
        leftOperand = { k: '条件', c: leftOperand, a, b };
        continue;
      }
      const precedence = binaryPrecedence[w.v];
      if (precedence === undefined || precedence < minPrec) break;
      if (w.v === '->') throw new Error(`Molang：不支持 ->：${sourceText}`);
      p++;
      leftOperand = { k: '二元', op: w.v, a: leftOperand, b: parseExpression(precedence + 1) };
    }
    return leftOperand;
  };

  const parseStatements = (closer?: string): MolangNode[] => {
    const nodes: MolangNode[] = [];
    while (p < tokens.length && !(closer && isSymbol(closer))) {
      if (isSymbol(';')) {
        p++;
        continue;
      }
      nodes.push(parseExpression(0));
      if (p < tokens.length && !(closer && isSymbol(closer))) consume(';');
    }
    return nodes;
  };

  // 有分号就是「复合表达式」：按基岩规范，没有 return 时得 0
  const hasSemicolon = tokens.some((w) => w.t === '符' && w.v === ';');
  const statements = parseStatements();
  if (p !== tokens.length) throw new Error(`Molang：多余的内容：${sourceText}`);
  if (!hasSemicolon && statements.length === 1) return statements[0]!;
  return { k: '块', 句: statements };
};

// ---- math（角度制，照基岩规范） ----
const radPerDeg = Math.PI / 180;
const mathFuncs: Record<string, (mathParams: number[], env: MolangEnv) => number> = {
  abs: ([a = 0]) => Math.abs(a),
  acos: ([a = 0]) => Math.acos(a) / radPerDeg,
  asin: ([a = 0]) => Math.asin(a) / radPerDeg,
  atan: ([a = 0]) => Math.atan(a) / radPerDeg,
  atan2: ([y = 0, x = 0]) => Math.atan2(y, x) / radPerDeg,
  ceil: ([a = 0]) => Math.ceil(a),
  clamp: ([v = 0, lo = 0, hi = 0]) => Math.min(hi, Math.max(lo, v)),
  cos: ([a = 0]) => Math.cos(a * radPerDeg),
  sin: ([a = 0]) => Math.sin(a * radPerDeg),
  exp: ([a = 0]) => Math.exp(a),
  floor: ([a = 0]) => Math.floor(a),
  hermite_blend: ([t = 0]) => 3 * t * t - 2 * t * t * t,
  lerp: ([a = 0, b = 0, t = 0]) => a + (b - a) * t,
  lerprotate: ([a = 0, b = 0, t = 0]) => {
    const angleDiff = ((((b - a) % 360) + 540) % 360) - 180;
    return a + angleDiff * t;
  },
  ln: ([a = 0]) => Math.log(a),
  max: ([a = 0, b = 0]) => Math.max(a, b),
  min: ([a = 0, b = 0]) => Math.min(a, b),
  min_angle: ([a = 0]) => ((((a + 180) % 360) + 360) % 360) - 180,
  mod: ([a = 0, b = 0]) => a % b,
  pi: () => Math.PI,
  pow: ([a = 0, b = 0]) => a ** b,
  round: ([a = 0]) => Math.round(a),
  sqrt: ([a = 0]) => Math.sqrt(a),
  trunc: ([a = 0]) => Math.trunc(a),
  sign: ([a = 0]) => (a >= 0 ? 1 : -1),
  copy_sign: ([a = 0, b = 0]) => Math.abs(a) * (b >= 0 ? 1 : -1),
  random: ([lo = 0, hi = 0], env) => lo + (env.rng?.() ?? 0) * (hi - lo),
  random_integer: ([lo = 0, hi = 0], env) => Math.round(lo + (env.rng?.() ?? 0) * (hi - lo)),
  die_roll: ([n = 0, lo = 0, hi = 0], env) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += lo + (env.rng?.() ?? 0) * (hi - lo);
    return s;
  },
};
const pureMath = new Set(Object.keys(mathFuncs).filter((k) => !['random', 'random_integer', 'die_roll'].includes(k)));

const isConstTree = (n: MolangNode): boolean => {
  switch (n.k) {
    case '数':
    case '串':
      return true;
    case '名':
      return n.名 === 'math.pi';
    case '调':
      return n.名.startsWith('math.') && pureMath.has(n.名.slice(5)) && n.callParams.every(isConstTree);
    case '一元':
      return isConstTree(n.a);
    case '二元':
      return isConstTree(n.a) && isConstTree(n.b);
    case '条件':
      return isConstTree(n.c) && isConstTree(n.a) && (!n.b || isConstTree(n.b));
    default:
      return false;
  }
};

/** 编译一段 Molang；语法错误直接抛（解析期就暴露，不等渲染） */
export const compile = (sourceText: string): MolangExpr => {
  const tree = parse(sourceText);
  return { 源: sourceText, 树: tree, isConst: isConstTree(tree) };
};

const toNumber = (v: MolangValue): number => (typeof v === 'number' ? v : 0);
const truthy = (v: MolangValue): boolean => (typeof v === 'number' ? v !== 0 : v.length > 0);

class ReturnSignal {
  v: MolangValue;
  constructor(v: MolangValue) {
    this.v = v;
  }
}

const lookupName = (qualifiedName: string, env: MolangEnv, tempVars: Record<string, MolangValue>): MolangValue | undefined => {
  const dotIndex = qualifiedName.indexOf('.');
  const space = dotIndex < 0 ? '' : qualifiedName.slice(0, dotIndex);
  const varName = qualifiedName.slice(dotIndex + 1);
  if (space === 'v') return env.变量?.[varName];
  if (space === 't') return tempVars[varName];
  if (space === 'c') return env.context?.[varName];
  if (space === 'q') {
    const q = env.query?.[varName];
    return typeof q === 'function' ? q() : q;
  }
  if (qualifiedName === 'math.pi') return Math.PI;
  const x = env.external?.[qualifiedName];
  return typeof x === 'function' ? x() : x;
};

const noRound = (x: number) => x;
const rounder = (env: MolangEnv) => (env.precision === 'float' ? Math.fround : noRound);

const evalNode = (n: MolangNode, env: MolangEnv, tempVars: Record<string, MolangValue>): MolangValue => {
  const r = rounder(env);
  const evalValue = (v: MolangValue): MolangValue => (typeof v === 'number' ? r(v) : v);
  switch (n.k) {
    case '数':
      return r(n.v);
    case '串':
      return n.v;
    case '名': {
      const v = lookupName(n.名, env, tempVars);
      if (v === undefined) {
        env.unresolved?.add(n.名);
        return 0;
      }
      return evalValue(v);
    }
    case '调': {
      const rawArgs = n.callParams.map((a) => evalNode(a, env, tempVars));
      const original = env.functions?.[n.名];
      if (original) return evalValue(original(rawArgs));
      const numParams = rawArgs.map(toNumber);
      if (n.名.startsWith('math.')) {
        const f = mathFuncs[n.名.slice(5)];
        if (f) return r(f(numParams, env));
      } else {
        const f = n.名.startsWith('q.') ? env.query?.[n.名.slice(2)] : env.external?.[n.名];
        if (typeof f === 'function') return r(f(...numParams));
        if (typeof f === 'number') return r(f);
      }
      env.unresolved?.add(n.名);
      return 0;
    }
    case '一元': {
      const a = evalNode(n.a, env, tempVars);
      return n.op === '-' ? -toNumber(a) : truthy(a) ? 0 : 1; // 取负、取非不会多出精度
    }
    case '二元': {
      if (n.op === '&&') return truthy(evalNode(n.a, env, tempVars)) && truthy(evalNode(n.b, env, tempVars)) ? 1 : 0;
      if (n.op === '||') return truthy(evalNode(n.a, env, tempVars)) || truthy(evalNode(n.b, env, tempVars)) ? 1 : 0;
      if (n.op === '??') {
        // 左边是没定义的名字才取右边
        if (n.a.k === '名' && lookupName(n.a.名, env, tempVars) === undefined) return evalNode(n.b, env, tempVars);
        return evalNode(n.a, env, tempVars);
      }
      const a = evalNode(n.a, env, tempVars);
      const b = evalNode(n.b, env, tempVars);
      if (n.op === '==') return a === b ? 1 : 0;
      if (n.op === '!=') return a !== b ? 1 : 0;
      const [x, y] = [toNumber(a), toNumber(b)];
      switch (n.op) {
        case '+': return r(x + y);
        case '-': return r(x - y);
        case '*': return r(x * y);
        case '/': return y === 0 ? 0 : r(x / y); // mocha：除数是 0 得 0（魔法酒狐第一帧 v.s 还没赋值就要除它）
        case '<': return x < y ? 1 : 0;
        case '<=': return x <= y ? 1 : 0;
        case '>': return x > y ? 1 : 0;
        case '>=': return x >= y ? 1 : 0;
      }
      throw new Error(`Molang：不认识的运算 ${n.op}`);
    }
    case '条件':
      return truthy(evalNode(n.c, env, tempVars)) ? evalNode(n.a, env, tempVars) : n.b ? evalNode(n.b, env, tempVars) : 0;
    case '赋值': {
      const v = evalNode(n.v, env, tempVars);
      if (n.名.startsWith('v.')) {
        if (!env.变量) throw new Error(`Molang：给 ${n.名} 赋值要传变量表`);
        env.变量[n.名.slice(2)] = v;
      } else if (n.名.startsWith('t.')) tempVars[n.名.slice(2)] = v;
      else throw new Error(`Molang：只能给 v.、t. 赋值：${n.名}`);
      return v;
    }
    case '返回':
      throw new ReturnSignal(evalNode(n.v, env, tempVars));
    case '块':
      for (const s of n.句) evalNode(s, env, tempVars);
      return 0;
  }
};

/** 求一段 Molang 的值（数）。字符串结果按 0 算 */
export const evaluate = (expr: MolangExpr, env: MolangEnv = {}): number => {
  try {
    return toNumber(evalNode(expr.树, env, {}));
  } catch (e) {
    if (e instanceof ReturnSignal) return toNumber(e.v);
    throw e;
  }
};

/** 数或 Molang 源文 → 数（常量直接算掉）或编译好的式子。动画文件里的值都过这一步，取材时就把能算的算成数；数值 同 Molang环境 */
export const bake = (value: number | string, precision?: MolangEnv['precision']): number | MolangExpr => {
  if (typeof value === 'number') return value;
  const expr = compile(value);
  return expr.isConst ? evaluate(expr, { precision }) : expr;
};

/** 值（数或式子）在环境里取数 */
export const getValue = (value: number | MolangExpr, env: MolangEnv): number => (typeof value === 'number' ? value : evaluate(value, env));
