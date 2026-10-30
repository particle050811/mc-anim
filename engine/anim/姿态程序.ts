// 姿态程序：py/anim_py/动作翻译 从生物模型类 setupAnim（连同 prepareMobModel）的字节码自动翻出的表达式图，这里照 JVM 语义求值（float 每步舍入到 float32、
// int 32 位补码、Mth.sin/cos 查 65536 格的表、(int) 强转饱和）。格式和边界见 docs/决策/0007-字节码翻译动作.md。
// 用法：const 求 = 姿态求值器(程序, MODEL.root)；<EntityModel pose={求部件姿态(程序, MODEL.root, { limbSwing, limbSwingAmount, ageInTicks, … })} />
// 输入名照程序的「输入」表：setupAnim 参数（limbSwing、limbSwingAmount、ageInTicks、netHeadYaw、headPitch，单位同原版：度、刻）、
// 实体上的查询（entity.isAggressive()）、模型字段（model.attackTime）；没给的取「默认」，再没有取 0。枚举给常量名或序号，布尔给 true/false。
import type { EntityPart, PartPose } from '../model/实体模型.tsx';
import { restPose, toPartPoses, type MutablePose } from './关键帧动画.ts';

export type 姿态节点 = [string, string, ...unknown[]];
export type 输入说明 = { 类型: 'i' | 'j' | 'f' | 'd'; 来源: string; 枚举?: string[]; 枚举类?: string; 默认?: number | string };
export type 姿态程序 = {
  格式: '姿态程序/1';
  模型类: string;
  方法: string[];
  复位: boolean;
  输入: Record<string, 输入说明>;
  固定: Record<string, unknown>;
  节点: 姿态节点[];
  输出: Record<string, Record<string, number>>;
  警告: string[];
};
export type 姿态输入 = Record<string, number | boolean | string | undefined>;
type 值 = number | boolean | bigint;

const f32 = Math.fround;
const f2i = (x: number) => (Number.isNaN(x) ? 0 : x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const f2l = (x: number) => (Number.isNaN(x) ? 0n : x >= 9.223372036854776e18 ? 9223372036854775807n : x <= -9.223372036854776e18 ? -9223372036854775808n : BigInt(Math.trunc(x)));
// Mth.SIN[i] = (float) Math.sin(i * π * 2 / 65536)
const SIN = new Float32Array(65536);
for (let i = 0; i < 65536; i++) SIN[i] = Math.sin((i * Math.PI * 2) / 65536);
const SIN_SCALE = f32(10430.378);
const jmin = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : a === 0 && b === 0 ? (Object.is(a, -0) ? a : b) : Math.min(a, b));
const jmax = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : a === 0 && b === 0 ? (Object.is(a, 0) ? a : b) : Math.max(a, b));

/** 和 py/anim_py/动作翻译/图.py 的「内建」一一对应；名字带 JVM 描述符，版本间语义变了会换名字 */
export const 内建函数: Record<string, (...a: number[]) => number> = {
  'net/minecraft/util/Mth.sin(F)F': (x) => SIN[f2i(f32(x * SIN_SCALE)) & 65535],
  'net/minecraft/util/Mth.cos(F)F': (x) => SIN[f2i(f32(f32(x * SIN_SCALE) + 16384)) & 65535],
  'net/minecraft/util/Mth.sqrt(F)F': (x) => f32(Math.sqrt(x)),
  'net/minecraft/util/Mth.abs(F)F': (x) => Math.abs(x),
  'net/minecraft/util/Mth.abs(I)I': (x) => Math.abs(x) | 0,
  'net/minecraft/util/Mth.clamp(FFF)F': (v, lo, hi) => (v < lo ? lo : jmin(v, hi)),
  'net/minecraft/util/Mth.clamp(III)I': (v, lo, hi) => (v < lo ? lo : Math.min(v, hi)),
  'net/minecraft/util/Mth.clamp(DDD)D': (v, lo, hi) => (v < lo ? lo : jmin(v, hi)),
  'net/minecraft/util/Mth.lerp(FFF)F': (t, a, b) => f32(a + f32(t * f32(b - a))),
  'net/minecraft/util/Mth.lerp(DDD)D': (t, a, b) => a + t * (b - a),
  'net/minecraft/util/Mth.wrapDegrees(F)F': (x) => {
    let f = f32(x % 360);
    if (f >= 180) f = f32(f - 360);
    if (f < -180) f = f32(f + 360);
    return f;
  },
  'net/minecraft/util/Mth.square(F)F': (x) => f32(x * x),
  'net/minecraft/util/Mth.floor(F)I': (x) => f2i(Math.floor(x)),
  'java/lang/Math.sin(D)D': Math.sin,
  'java/lang/Math.cos(D)D': Math.cos,
  'java/lang/Math.sqrt(D)D': Math.sqrt,
  'java/lang/Math.abs(F)F': Math.abs,
  'java/lang/Math.abs(D)D': Math.abs,
  'java/lang/Math.abs(I)I': (x) => Math.abs(x) | 0,
  'java/lang/Math.min(FF)F': jmin,
  'java/lang/Math.max(FF)F': jmax,
  'java/lang/Math.min(DD)D': jmin,
  'java/lang/Math.max(DD)D': jmax,
  'java/lang/Math.min(II)I': Math.min,
  'java/lang/Math.max(II)I': Math.max,
  'java/lang/Math.pow(DD)D': Math.pow,
  'java/lang/Math.atan2(DD)D': Math.atan2,
  'java/lang/Math.exp(D)D': Math.exp,
  'java/lang/Math.signum(F)F': (x) => (x === 0 || Number.isNaN(x) ? x : Math.sign(x)),
};

const 读常量 = (v: unknown, t: string): 值 => {
  const n = v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v;
  if (t === 'z') return Boolean(n);
  if (t === 'j') return BigInt(n as number | string); // 超出 2^53 的 long 常量写成串
  return t === 'f' ? f32(n as number) : (n as number);
};

const 算 = (op: string, t: string, a: 值, b: 值): 值 => {
  if (t === 'f' || t === 'd') {
    const x = a as number;
    const y = b as number;
    let r: number;
    switch (op) {
      case '+': r = x + y; break;
      case '-': r = x - y; break;
      case '*': r = x * y; break;
      case '/': r = x / y; break;
      case '%': r = x % y; break; // JS 的 % 和 Java 的 frem/drem 一样按被除数取号
      default: throw new Error(`浮点不支持 ${op}`);
    }
    // double 算完再舍入到 float32 和 float 运算逐位相同（double 精度够两次舍入不出错）
    return t === 'f' ? f32(r) : r;
  }
  if (t === 'i') {
    const x = a as number;
    const y = b as number;
    switch (op) {
      case '+': return (x + y) | 0;
      case '-': return (x - y) | 0;
      case '*': return Math.imul(x, y);
      case '/': if (y === 0) throw new Error('整数除以 0'); return (x / y) | 0;
      case '%': if (y === 0) throw new Error('整数除以 0'); return x % y | 0;
      case 'shl': return x << (y & 31);
      case 'shr': return x >> (y & 31);
      case 'ushr': return (x >>> (y & 31)) | 0;
      case 'and': return x & y;
      case 'or': return x | y;
      case 'xor': return x ^ y;
    }
  }
  if (t === 'j') {
    const x = a as bigint;
    const y = b as bigint;
    const w = (v: bigint) => BigInt.asIntN(64, v);
    switch (op) {
      case '+': return w(x + y);
      case '-': return w(x - y);
      case '*': return w(x * y);
      case '/': if (y === 0n) throw new Error('整数除以 0'); return w(x / y);
      case '%': if (y === 0n) throw new Error('整数除以 0'); return w(x % y);
      case 'shl': return w(x << (y & 63n));
      case 'shr': return w(x >> (y & 63n));
      case 'ushr': return w(BigInt.asUintN(64, x) >> (y & 63n));
      case 'and': return w(x & y);
      case 'or': return w(x | y);
      case 'xor': return w(x ^ y);
    }
  }
  throw new Error(`不认识的运算 ${op}:${t}`);
};

const 转换 = (v: 值, 从: string, 到: string): 值 => {
  if (从 === 到) return v;
  if (到 === 'f') return f32(Number(v));
  if (到 === 'd') return Number(v);
  if (到 === 'i') return 从 === 'j' ? Number(BigInt.asIntN(32, v as bigint)) : 从 === 'i' ? (v as number) : f2i(v as number);
  if (到 === 'j') return 从 === 'i' ? BigInt(v as number) : f2l(v as number);
  throw new Error(`不支持的转换 ${从}→${到}`);
};

const 比较 = (op: string, a: 值, b: 值): boolean => {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return !(a === b);
  }
  throw new Error(op);
};

const 部件初始 = (根: EntityPart) => {
  const out: Record<string, { offset: number[]; rot: number[] }> = {};
  const walk = (p: EntityPart) => {
    out[p.name] = p.pose;
    p.children.forEach(walk);
  };
  walk(根);
  return out;
};
const 初始字段: Record<string, ['offset' | 'rot', number]> = { x: ['offset', 0], y: ['offset', 1], z: ['offset', 2], xRot: ['rot', 0], yRot: ['rot', 1], zRot: ['rot', 2] };

const 输入值 = (名: string, 说明: 输入说明, 给: 姿态输入): 值 => {
  let v: number | boolean | string | undefined = 给[名];
  if (v === undefined) v = 说明.默认 ?? 0;
  if (typeof v === 'string') {
    const i = 说明.枚举?.indexOf(v) ?? -1;
    if (i < 0) throw new Error(`输入 ${名} 的值 ${v} 不在枚举 ${说明.枚举?.join('/') ?? '（不是枚举）'} 里`);
    v = i;
  }
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (说明.类型 === 'f') return f32(v);
  if (说明.类型 === 'j') return BigInt(Math.trunc(v));
  if (说明.类型 === 'i') return v | 0;
  return v;
};

/** 编译一次、按帧求：返回 (输入) → 每个节点的值（测试和调试用；画面用 姿态求值器） */
export const 节点求值器 = (程序: 姿态程序, 根: EntityPart) => {
  if (程序.格式 !== '姿态程序/1') throw new Error(`不认识的姿态程序格式 ${String(程序.格式)}`);
  const 初始 = 部件初始(根);
  const 节点 = 程序.节点;
  for (const e of 节点) {
    if (e[0] === 'call' && !内建函数[e[2] as string]) throw new Error(`姿态程序用了没实现的内建函数 ${String(e[2])}`);
    if (e[0] === 'rest' && !初始[e[2] as string]) throw new Error(`姿态程序要部件 ${String(e[2])}，模型里没有`);
  }
  return (给: 姿态输入): 值[] => {
    const v: 值[] = new Array(节点.length);
    for (let i = 0; i < 节点.length; i++) {
      const e = 节点[i];
      const op = e[0];
      const t = e[1];
      let r: 值;
      switch (op) {
        case 'c': r = 读常量(e[2], t); break;
        case 'in': {
          const 名 = e[2] as string;
          r = 输入值(名, 程序.输入[名] ?? { 类型: t as 输入说明['类型'], 来源: '' }, 给);
          break;
        }
        case 'rest': {
          const [k, j] = 初始字段[e[3] as string];
          r = f32(初始[e[2] as string][k][j]);
          break;
        }
        case 'neg': {
          const a = v[e[2] as number];
          r = t === 'j' ? BigInt.asIntN(64, -(a as bigint)) : t === 'i' ? -(a as number) | 0 : -(a as number);
          break;
        }
        case 'conv': r = 转换(v[e[2] as number], 节点[e[2] as number][1], t); break;
        case '<': case '<=': case '>': case '>=': case '==': case '!=':
          r = 比较(op, v[e[2] as number], v[e[3] as number]);
          break;
        case 'not': r = !v[e[2] as number]; break;
        // 类型 z 的 and / or 是逻辑的；i、j 的是按位的，走 算
        case 'and': r = t === 'z' ? Boolean(v[e[2] as number]) && Boolean(v[e[3] as number]) : 算(op, t, v[e[2] as number], v[e[3] as number]); break;
        case 'or': r = t === 'z' ? Boolean(v[e[2] as number]) || Boolean(v[e[3] as number]) : 算(op, t, v[e[2] as number], v[e[3] as number]); break;
        case 'sel': r = v[e[2] as number] ? v[e[3] as number] : v[e[4] as number]; break;
        case 'call': {
          const args = (e.slice(3) as number[]).map((a) => v[a] as number);
          r = 内建函数[e[2] as string](...args);
          break;
        }
        case 'tab': {
          const 表 = e[2] as unknown[];
          const k = v[e[3] as number] as number;
          r = k >= 0 && k < 表.length ? 读常量(表[k], t) : t === 'j' ? 0n : 0;
          break;
        }
        default: r = 算(op, t, v[e[2] as number], v[e[3] as number]);
      }
      v[i] = r;
    }
    return v;
  };
};

/** 编译一次、按帧求：返回 (输入) → 部件姿态（从模型的初始姿态出发，程序写到的字段换成算出来的值）和不画的部件 */
export const 姿态求值器 = (程序: 姿态程序, 根: EntityPart) => {
  const 求 = 节点求值器(程序, 根);
  return (给: 姿态输入): { 姿态: MutablePose; 隐藏: string[] } => {
    const v = 求(给);
    const 姿态 = restPose(根);
    const 隐藏: string[] = [];
    for (const [部件, 字段们] of Object.entries(程序.输出)) {
      const p = 姿态[部件];
      if (!p) throw new Error(`模型里没有部件 ${部件}`);
      for (const [字段, i] of Object.entries(字段们)) {
        const x = Number(v[i]);
        if (字段 in 初始字段) {
          const [k, j] = 初始字段[字段];
          p[k][j] = x;
        } else if (字段 === 'xScale' || 字段 === 'yScale' || 字段 === 'zScale') p.scale['xyz'.indexOf(字段[0])] = x;
        else if (字段 === 'visible' && !x) 隐藏.push(部件);
      }
    }
    return { 姿态, 隐藏 };
  };
};

/** EntityModel 的 pose 参数（每次都重新编译，画面里一帧一个模型时够用；多帧、多只用 姿态求值器 编译一次） */
export const 求部件姿态 = (程序: 姿态程序, 根: EntityPart, 给: 姿态输入): Record<string, PartPose> => {
  const { 姿态, 隐藏 } = 姿态求值器(程序, 根)(给);
  const out = toPartPoses(姿态);
  for (const k of 隐藏) out[k] = { ...out[k], hide: true };
  return out;
};
