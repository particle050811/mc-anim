// Molang 子集：解析成语法树，再按环境求值。纯模块，不 import react、three。
// 优先级照车万女仆 1.5.3 里打包的 Molang 引擎（unnamed/mocha 分支，BinaryExpression.Op 反汇编），由低到高：
//   赋值 < ?? < 三元 ?: < || < && < == != < < <= > >= < + - < * / < 一元 ! - < 调用、成员
// 所以 `0.8+ysm.food_level<=6?-0.9:0` 是 ((0.8 + food) <= 6) ? −0.9 : 0。
// 支持：数字、'字符串'、true/false、q./query.、v./variable.（含 v.a.b 这种结构）、t./temp.、c./context.、math.*（角度制）、
// 其他命名空间（ysm.has_helmet 这类模组自己的）、函数调用、三元和二元条件（a ? b 不成立时得 0）、多句（; 分隔，return）。
// 不支持：loop、for_each、break、continue、数组、-> 箭头（遇到就报错，不静默算错）。
// 名字不分大小写（Molang 规范），一律转小写；字符串字面量保留原样。
// 数值：mocha 用 float 算（ExpressionEvaluatorImpl 反汇编），这里用 double，差在 1e-7 相对量级。

export type Molang值 = number | string;

type 节点 =
  | { k: '数'; v: number }
  | { k: '串'; v: string }
  | { k: '名'; 名: string }
  | { k: '调'; 名: string; 参: 节点[] }
  | { k: '一元'; op: '-' | '!'; a: 节点 }
  | { k: '二元'; op: string; a: 节点; b: 节点 }
  | { k: '条件'; c: 节点; a: 节点; b?: 节点 }
  | { k: '赋值'; 名: string; v: 节点 }
  | { k: '返回'; v: 节点 }
  | { k: '块'; 句: 节点[] };

/** 编译好的表达式：源文、语法树，以及能不能在解析时就算成常数（只含数字和 math 纯函数） */
export type Molang式 = { readonly 源: string; readonly 树: 节点; readonly 常量: boolean };

/**
 * 求值环境。变量表是唯一会被写的东西（赋值 v.x = …），调用方显式传进来、自己决定跨帧留不留；除此之外求值是纯函数。
 * 查询：q.anim_time → 查询.anim_time；函数型查询 q.position_delta(0) 给函数。
 * 外部：别的命名空间按全名查，如 { 'ysm.has_helmet': 1 }。
 * 没给的名字一律得 0（和游戏里一样不报错），名字记进 未知（给了的话），检查用。
 */
export type Molang环境 = {
  查询?: Readonly<Record<string, number | ((...参: number[]) => number)>>;
  变量?: Record<string, Molang值>;
  上下文?: Readonly<Record<string, number>>;
  外部?: Readonly<Record<string, number | ((...参: number[]) => number)>>;
  /** math.random、math.die_roll 用的随机源（0～1）；不给按 0 算，保证可复现 */
  随机?: () => number;
  未知?: Set<string>;
};

// ---- 词法 ----
type 记号 = { t: '数'; v: number } | { t: '串'; v: string } | { t: '名'; v: string } | { t: '符'; v: string };
const 符号们 = ['??', '&&', '||', '==', '!=', '<=', '>=', '->', '+', '-', '*', '/', '<', '>', '!', '?', ':', '(', ')', ',', '=', ';', '{', '}', '[', ']'];

const 切词 = (源: string): 记号[] => {
  const 出: 记号[] = [];
  let i = 0;
  while (i < 源.length) {
    const c = 源[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const 数 = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?f?/.exec(源.slice(i));
    if (数) {
      出.push({ t: '数', v: Number.parseFloat(数[0]) });
      i += 数[0].length;
      continue;
    }
    if (c === "'") {
      const j = 源.indexOf("'", i + 1);
      if (j < 0) throw new Error(`Molang：字符串没闭合：${源}`);
      出.push({ t: '串', v: 源.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const 名 = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(源.slice(i));
    if (名) {
      出.push({ t: '名', v: 名[0].toLowerCase() });
      i += 名[0].length;
      continue;
    }
    const 符 = 符号们.find((s) => 源.startsWith(s, i));
    if (!符) throw new Error(`Molang：认不出的字符 ${c}：${源}`);
    出.push({ t: '符', v: 符 });
    i += 符.length;
  }
  return 出;
};

// ---- 语法（优先级爬升） ----
const 二元优先级: Record<string, number> = {
  '??': 1200, '||': 1600, '&&': 1800, '==': 2000, '!=': 2000,
  '<': 2200, '<=': 2200, '>': 2200, '>=': 2200, '+': 2400, '-': 2400, '*': 2600, '/': 2600,
};
const 条件优先级 = 1400;
const 一元优先级 = 2800;

// 命名空间别名统一成短写
const 规范名 = (名: string): string =>
  名.replace(/^query\./, 'q.').replace(/^variable\./, 'v.').replace(/^temp\./, 't.').replace(/^context\./, 'c.');

const 解析 = (源: string): 节点 => {
  const 词 = 切词(源);
  let p = 0;
  const 看 = () => 词[p];
  const 是符 = (v: string) => 看()?.t === '符' && 看()!.v === v;
  const 吃 = (v: string) => {
    if (!是符(v)) throw new Error(`Molang：这里要 ${v}：${源}`);
    p++;
  };

  const 单项 = (): 节点 => {
    const w = 词[p++];
    if (!w) throw new Error(`Molang：表达式没写完：${源}`);
    if (w.t === '数') return { k: '数', v: w.v };
    if (w.t === '串') return { k: '串', v: w.v };
    if (w.t === '符') {
      if (w.v === '(') {
        const e = 表达式(0);
        吃(')');
        return e;
      }
      if (w.v === '{') {
        const 句 = 句们('}');
        吃('}');
        return { k: '块', 句 };
      }
      if (w.v === '-' || w.v === '!') return { k: '一元', op: w.v, a: 表达式(一元优先级) };
      throw new Error(`Molang：不支持的写法 ${w.v}：${源}`);
    }
    if (w.v === 'true' || w.v === 'false') return { k: '数', v: w.v === 'true' ? 1 : 0 };
    if (w.v === 'return') return { k: '返回', v: 表达式(0) };
    if (['loop', 'for_each', 'break', 'continue'].includes(w.v)) throw new Error(`Molang：不支持 ${w.v}：${源}`);
    const 名 = 规范名(w.v);
    if (是符('(')) {
      p++;
      const 参: 节点[] = [];
      while (!是符(')')) {
        参.push(表达式(0));
        if (是符(',')) p++;
        else break;
      }
      吃(')');
      return { k: '调', 名, 参 };
    }
    if (是符('=')) {
      p++;
      return { k: '赋值', 名, v: 表达式(0) };
    }
    return { k: '名', 名 };
  };

  const 表达式 = (最低: number): 节点 => {
    let 左 = 单项();
    for (;;) {
      const w = 看();
      if (!w || w.t !== '符') break;
      if (w.v === '?' && 条件优先级 >= 最低) {
        p++;
        const a = 表达式(条件优先级);
        let b: 节点 | undefined;
        if (是符(':')) {
          p++;
          b = 表达式(条件优先级);
        }
        左 = { k: '条件', c: 左, a, b };
        continue;
      }
      const 级 = 二元优先级[w.v];
      if (级 === undefined || 级 < 最低) break;
      if (w.v === '->') throw new Error(`Molang：不支持 ->：${源}`);
      p++;
      左 = { k: '二元', op: w.v, a: 左, b: 表达式(级 + 1) };
    }
    return 左;
  };

  const 句们 = (结束?: string): 节点[] => {
    const 出: 节点[] = [];
    while (p < 词.length && !(结束 && 是符(结束))) {
      if (是符(';')) {
        p++;
        continue;
      }
      出.push(表达式(0));
      if (p < 词.length && !(结束 && 是符(结束))) 吃(';');
    }
    return 出;
  };

  // 有分号就是「复合表达式」：按基岩规范，没有 return 时得 0
  const 有分号 = 词.some((w) => w.t === '符' && w.v === ';');
  const 句 = 句们();
  if (p !== 词.length) throw new Error(`Molang：多余的内容：${源}`);
  if (!有分号 && 句.length === 1) return 句[0]!;
  return { k: '块', 句 };
};

// ---- math（角度制，照基岩规范） ----
const 度 = Math.PI / 180;
const 数学: Record<string, (参: number[], 环境: Molang环境) => number> = {
  abs: ([a = 0]) => Math.abs(a),
  acos: ([a = 0]) => Math.acos(a) / 度,
  asin: ([a = 0]) => Math.asin(a) / 度,
  atan: ([a = 0]) => Math.atan(a) / 度,
  atan2: ([y = 0, x = 0]) => Math.atan2(y, x) / 度,
  ceil: ([a = 0]) => Math.ceil(a),
  clamp: ([v = 0, lo = 0, hi = 0]) => Math.min(hi, Math.max(lo, v)),
  cos: ([a = 0]) => Math.cos(a * 度),
  sin: ([a = 0]) => Math.sin(a * 度),
  exp: ([a = 0]) => Math.exp(a),
  floor: ([a = 0]) => Math.floor(a),
  hermite_blend: ([t = 0]) => 3 * t * t - 2 * t * t * t,
  lerp: ([a = 0, b = 0, t = 0]) => a + (b - a) * t,
  lerprotate: ([a = 0, b = 0, t = 0]) => {
    const 差 = ((((b - a) % 360) + 540) % 360) - 180;
    return a + 差 * t;
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
  random: ([lo = 0, hi = 0], 环境) => lo + (环境.随机?.() ?? 0) * (hi - lo),
  random_integer: ([lo = 0, hi = 0], 环境) => Math.round(lo + (环境.随机?.() ?? 0) * (hi - lo)),
  die_roll: ([n = 0, lo = 0, hi = 0], 环境) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += lo + (环境.随机?.() ?? 0) * (hi - lo);
    return s;
  },
};
const 纯数学 = new Set(Object.keys(数学).filter((k) => !['random', 'random_integer', 'die_roll'].includes(k)));

const 是常量树 = (n: 节点): boolean => {
  switch (n.k) {
    case '数':
    case '串':
      return true;
    case '名':
      return n.名 === 'math.pi';
    case '调':
      return n.名.startsWith('math.') && 纯数学.has(n.名.slice(5)) && n.参.every(是常量树);
    case '一元':
      return 是常量树(n.a);
    case '二元':
      return 是常量树(n.a) && 是常量树(n.b);
    case '条件':
      return 是常量树(n.c) && 是常量树(n.a) && (!n.b || 是常量树(n.b));
    default:
      return false;
  }
};

/** 编译一段 Molang；语法错误直接抛（解析期就暴露，不等渲染） */
export const 编译 = (源: string): Molang式 => {
  const 树 = 解析(源);
  return { 源, 树, 常量: 是常量树(树) };
};

const 转数 = (v: Molang值): number => (typeof v === 'number' ? v : 0);
const 真 = (v: Molang值): boolean => (typeof v === 'number' ? v !== 0 : v.length > 0);

class 返回信号 {
  v: Molang值;
  constructor(v: Molang值) {
    this.v = v;
  }
}

const 取名 = (名: string, 环境: Molang环境, 临时: Record<string, Molang值>): Molang值 | undefined => {
  const 点 = 名.indexOf('.');
  const 空间 = 点 < 0 ? '' : 名.slice(0, 点);
  const 余 = 名.slice(点 + 1);
  if (空间 === 'v') return 环境.变量?.[余];
  if (空间 === 't') return 临时[余];
  if (空间 === 'c') return 环境.上下文?.[余];
  if (空间 === 'q') {
    const q = 环境.查询?.[余];
    return typeof q === 'function' ? q() : q;
  }
  if (名 === 'math.pi') return Math.PI;
  const x = 环境.外部?.[名];
  return typeof x === 'function' ? x() : x;
};

const 求 = (n: 节点, 环境: Molang环境, 临时: Record<string, Molang值>): Molang值 => {
  switch (n.k) {
    case '数':
      return n.v;
    case '串':
      return n.v;
    case '名': {
      const v = 取名(n.名, 环境, 临时);
      if (v === undefined) {
        环境.未知?.add(n.名);
        return 0;
      }
      return v;
    }
    case '调': {
      const 参 = n.参.map((a) => 转数(求(a, 环境, 临时)));
      if (n.名.startsWith('math.')) {
        const f = 数学[n.名.slice(5)];
        if (f) return f(参, 环境);
      } else {
        const f = n.名.startsWith('q.') ? 环境.查询?.[n.名.slice(2)] : 环境.外部?.[n.名];
        if (typeof f === 'function') return f(...参);
        if (typeof f === 'number') return f;
      }
      环境.未知?.add(n.名);
      return 0;
    }
    case '一元': {
      const a = 求(n.a, 环境, 临时);
      return n.op === '-' ? -转数(a) : 真(a) ? 0 : 1;
    }
    case '二元': {
      if (n.op === '&&') return 真(求(n.a, 环境, 临时)) && 真(求(n.b, 环境, 临时)) ? 1 : 0;
      if (n.op === '||') return 真(求(n.a, 环境, 临时)) || 真(求(n.b, 环境, 临时)) ? 1 : 0;
      if (n.op === '??') {
        // 左边是没定义的名字才取右边
        if (n.a.k === '名' && 取名(n.a.名, 环境, 临时) === undefined) return 求(n.b, 环境, 临时);
        return 求(n.a, 环境, 临时);
      }
      const a = 求(n.a, 环境, 临时);
      const b = 求(n.b, 环境, 临时);
      if (n.op === '==') return a === b ? 1 : 0;
      if (n.op === '!=') return a !== b ? 1 : 0;
      const [x, y] = [转数(a), 转数(b)];
      switch (n.op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return y === 0 ? 0 : x / y; // mocha：除数是 0 得 0（魔法酒狐第一帧 v.s 还没赋值就要除它）
        case '<': return x < y ? 1 : 0;
        case '<=': return x <= y ? 1 : 0;
        case '>': return x > y ? 1 : 0;
        case '>=': return x >= y ? 1 : 0;
      }
      throw new Error(`Molang：不认识的运算 ${n.op}`);
    }
    case '条件':
      return 真(求(n.c, 环境, 临时)) ? 求(n.a, 环境, 临时) : n.b ? 求(n.b, 环境, 临时) : 0;
    case '赋值': {
      const v = 求(n.v, 环境, 临时);
      if (n.名.startsWith('v.')) {
        if (!环境.变量) throw new Error(`Molang：给 ${n.名} 赋值要传变量表`);
        环境.变量[n.名.slice(2)] = v;
      } else if (n.名.startsWith('t.')) 临时[n.名.slice(2)] = v;
      else throw new Error(`Molang：只能给 v.、t. 赋值：${n.名}`);
      return v;
    }
    case '返回':
      throw new 返回信号(求(n.v, 环境, 临时));
    case '块':
      for (const s of n.句) 求(s, 环境, 临时);
      return 0;
  }
};

/** 求一段 Molang 的值（数）。字符串结果按 0 算 */
export const 求值 = (式: Molang式, 环境: Molang环境 = {}): number => {
  try {
    return 转数(求(式.树, 环境, {}));
  } catch (e) {
    if (e instanceof 返回信号) return 转数(e.v);
    throw e;
  }
};

/** 数或 Molang 源文 → 数（常量直接算掉）或编译好的式子。动画文件里的值都过这一步，取材时就把能算的算成数 */
export const 烘焙 = (值: number | string): number | Molang式 => {
  if (typeof 值 === 'number') return 值;
  const 式 = 编译(值);
  return 式.常量 ? 求值(式) : 式;
};

/** 值（数或式子）在环境里取数 */
export const 取值 = (值: number | Molang式, 环境: Molang环境): number => (typeof 值 === 'number' ? 值 : 求值(值, 环境));
