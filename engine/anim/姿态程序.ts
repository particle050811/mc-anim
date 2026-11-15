// 姿态程序：py/anim_py/动作翻译 从生物模型类 setupAnim（连同 prepareMobModel）的字节码自动翻出的表达式图，这里照 JVM 语义求值（float 每步舍入到 float32、
// int 32 位补码、Mth.sin/cos 查 65536 格的表、(int) 强转饱和）。格式和边界见 docs/决策/0007-字节码翻译动作.md。
// 用法：const 求 = 姿态求值器(程序, MODEL.root)；<EntityModel pose={求部件姿态(程序, MODEL.root, { limbSwing, limbSwingAmount, ageInTicks, … })} />
// 输入名照程序的「输入」表：setupAnim 参数（limbSwing、limbSwingAmount、ageInTicks、netHeadYaw、headPitch，单位同原版：度、刻）、
// 实体上的查询（entity.isAggressive()）、模型字段（model.attackTime）；没给的取「默认」，再没有取 0。枚举给常量名或序号，布尔给 true/false。
import type { EntityPart, PartPose } from '../model/实体模型.tsx';
import { clamp } from '../core/数学.ts';
import { restPose, toPartPoses, type MutablePose } from './关键帧动画.ts';

export type PoseNode = [string, string, ...unknown[]];
// 默认：枚举给常量名；long 超出 2^53 的写成十进制串（AnimationState.lastTime 的 Long.MAX_VALUE）
export type InputSpec = { 类型: 'i' | 'j' | 'f' | 'd'; 来源: string; 枚举?: string[]; 枚举类?: string; 默认?: number | string };
export type PoseProgram = {
  格式: '姿态程序/1';
  模型类: string;
  方法: string[];
  复位: boolean;
  输入: Record<string, InputSpec>;
  固定: Record<string, unknown>;
  节点: PoseNode[];
  输出: Record<string, Record<string, number>>;
  警告: string[];
};
export type PoseInput = Record<string, number | bigint | boolean | string | undefined>;
type ConstValue = number | boolean | bigint;

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
export const builtins: Record<string, (...a: number[]) => number> = {
  'net/minecraft/util/Mth.sin(F)F': (x) => SIN[f2i(f32(x * SIN_SCALE)) & 65535],
  'net/minecraft/util/Mth.cos(F)F': (x) => SIN[f2i(f32(f32(x * SIN_SCALE) + 16384)) & 65535],
  // 1.21.x：参数是 double，乘 double 常量、(long) 强转再 & 65535
  'net/minecraft/util/Mth.sin(D)F': (x) => SIN[Number(BigInt.asUintN(16, f2l(x * 10430.378350470453)))],
  'net/minecraft/util/Mth.cos(D)F': (x) => SIN[Number(BigInt.asUintN(16, f2l(x * 10430.378350470453 + 16384)))],
  'net/minecraft/util/Mth.sqrt(F)F': (x) => f32(Math.sqrt(x)),
  'net/minecraft/util/Mth.abs(F)F': (x) => Math.abs(x),
  'net/minecraft/util/Mth.abs(I)I': (x) => Math.abs(x) | 0,
  // 浮点版是 v < lo ? lo : Math.min(v, hi)：lo > hi、v = -0 落在 lo = 0 上时和正本 clamp 不一样，所以下界自己判，上界交给正本
  'net/minecraft/util/Mth.clamp(FFF)F': (v, lo, hi) => (v < lo ? lo : clamp(v, -Infinity, hi)),
  'net/minecraft/util/Mth.clamp(III)I': clamp, // 1.20.1 是 Math.min(Math.max(v, lo), hi)，lo > hi 时取 hi，整数上和正本一样
  'net/minecraft/util/Mth.clamp(DDD)D': (v, lo, hi) => (v < lo ? lo : clamp(v, -Infinity, hi)),
  'net/minecraft/util/Mth.lerp(FFF)F': (t, a, b) => f32(a + f32(t * f32(b - a))),
  'net/minecraft/util/Mth.lerp(DDD)D': (t, a, b) => a + t * (b - a),
  'net/minecraft/util/Mth.wrapDegrees(F)F': (x) => {
    let f = f32(x % 360);
    if (f >= 180) f = f32(f - 360);
    if (f < -180) f = f32(f + 360);
    return f;
  },
  'net/minecraft/util/Mth.square(F)F': (x) => f32(x * x),
  // i = (int) x；x < (float) i ? i - 1 : i：比 -2^31 还小时溢出成 2^31 - 1，照 1.20.1 抄
  'net/minecraft/util/Mth.floor(F)I': (x) => {
    const i = f2i(x);
    return x < f32(i) ? (i - 1) | 0 : i;
  },
  // ModelUtils.rotlerpRad(FFF)F（1.20.1，蜜蜂）：两个 while 把差归到 [-π, π)，循环次数看输入所以做成内建。
  // 差大到加减 2π 不动了（|差| 过 2^27，或是无穷）时 JVM 永远不返回，这里给 NaN；和 py 的 图._rotlerp_rad 一致。
  // 不设次数上限：只要还在动就单调逼近，一定会停；2^27 以内 JVM 要转近 1810 万圈才出来，照样算
  'net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F': (a, b, t) => {
    const PI = f32(Math.PI);
    const TAU = f32(Math.PI * 2);
    let d = f32(b - a);
    while (d < -PI) {
      const e = f32(d + TAU);
      if (e === d) return NaN;
      d = e;
    }
    while (d >= PI) {
      const e = f32(d - TAU);
      if (e === d) return NaN;
      d = e;
    }
    return f32(a + f32(t * d));
  },
  // 1.21.x 挪进 Mth、参数次序改成 (t, 从, 到)，算法一样
  'net/minecraft/util/Mth.rotLerpRad(FFF)F': (t, a, b) => builtins['net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F'](a, b, t),
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

const readConst = (v: unknown, t: string): ConstValue => {
  const n = v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v;
  if (t === 'z') return Boolean(n);
  if (t === 'j') return BigInt(n as number | string); // 超出 2^53 的 long 常量写成串
  return t === 'f' ? f32(n as number) : (n as number);
};

const applyOp = (op: string, t: string, a: ConstValue, b: ConstValue): ConstValue => {
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

const convert = (v: ConstValue, fromName: string, toConvention: string): ConstValue => {
  if (fromName === toConvention) return v;
  if (toConvention === 'f') return f32(Number(v));
  if (toConvention === 'd') return Number(v);
  if (toConvention === 'i') return fromName === 'j' ? Number(BigInt.asIntN(32, v as bigint)) : fromName === 'i' ? (v as number) : f2i(v as number);
  if (toConvention === 'j') return fromName === 'i' ? BigInt(v as number) : f2l(v as number);
  throw new Error(`不支持的转换 ${fromName}→${toConvention}`);
};

const compare = (op: string, a: ConstValue, b: ConstValue): boolean => {
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

const partInitialPose = (root: EntityPart) => {
  const out: Record<string, { offset: number[]; rot: number[] }> = {};
  const walk = (p: EntityPart) => {
    out[p.name] = p.pose;
    p.children.forEach(walk);
  };
  walk(root);
  return out;
};
const initialFields: Record<string, ['offset' | 'rot', number]> = { x: ['offset', 0], y: ['offset', 1], z: ['offset', 2], xRot: ['rot', 0], yRot: ['rot', 1], zRot: ['rot', 2] };

const inputValue = (inputName: string, inputSpec: InputSpec, inputs: PoseInput): ConstValue => {
  let v: number | bigint | boolean | string | undefined = inputs[inputName];
  if (v === undefined) v = inputSpec.默认 ?? 0;
  if (inputSpec.类型 === 'j' && !inputSpec.枚举) return BigInt.asIntN(64, typeof v === 'bigint' || typeof v === 'string' ? BigInt(v) : BigInt(Math.trunc(Number(v))));
  if (typeof v === 'bigint') v = Number(v);
  if (typeof v === 'string') {
    const i = inputSpec.枚举?.indexOf(v) ?? -1;
    if (i < 0) throw new Error(`输入 ${inputName} 的值 ${v} 不在枚举 ${inputSpec.枚举?.join('/') ?? '（不是枚举）'} 里`);
    v = i;
  }
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (inputSpec.类型 === 'f') return f32(v);
  if (inputSpec.类型 === 'j') return BigInt(Math.trunc(v));
  if (inputSpec.类型 === 'i') return v | 0;
  return v;
};

/**
 * 1.20.1 的 AnimationState（关键帧动画的播放状态，监守者吼叫、骆驼坐下这些）在姿态程序里是两个 long 输入：`<名>.lastTime`、`<名>.accumulatedTime`。
 * 这里按「第 开始刻 刻 start()，之后每帧照常 updateTime、速度 1」给出它们：程序里那次 updateTime 一步补齐，和游戏逐帧累加的结果一样
 * （每帧差值在 2^24 毫秒内 float 不丢位）。速度不是 1 的动画逐帧取整跟历史有关，对不上。不给开始刻 = 没开始（游戏里 stop() 的状态）。
 * 名 照程序的输入名写，如 'entity.roarAnimationState'。
 */
export const animState = (animName: string, startTick?: number): PoseInput =>
  startTick === undefined
    ? { [`${animName}.lastTime`]: 9223372036854775807n, [`${animName}.accumulatedTime`]: 0n }
    : { [`${animName}.lastTime`]: (BigInt(Math.trunc(startTick)) * 1000n) / 20n, [`${animName}.accumulatedTime`]: 0n };

/** 编译一次、按帧求：返回 (输入) → 每个节点的值（测试和调试用；画面用 姿态求值器） */
export const nodeEvaluator = (poseProgram: PoseProgram, root: EntityPart) => {
  if (poseProgram.格式 !== '姿态程序/1') throw new Error(`不认识的姿态程序格式 ${String(poseProgram.格式)}`);
  const initialPose = partInitialPose(root);
  const nodes = poseProgram.节点;
  for (const e of nodes) {
    if (e[0] === 'call' && !builtins[e[2] as string]) throw new Error(`姿态程序用了没实现的内建函数 ${String(e[2])}`);
    if (e[0] === 'rest' && !initialPose[e[2] as string]) throw new Error(`姿态程序要部件 ${String(e[2])}，模型里没有`);
  }
  return (inputs: PoseInput): ConstValue[] => {
    const v: ConstValue[] = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const e = nodes[i];
      const op = e[0];
      const t = e[1];
      let r: ConstValue;
      switch (op) {
        case 'c': r = readConst(e[2], t); break;
        case 'in': {
          const inputName = e[2] as string;
          r = inputValue(inputName, poseProgram.输入[inputName] ?? { 类型: t as InputSpec['类型'], 来源: '' }, inputs);
          break;
        }
        case 'rest': {
          const [k, j] = initialFields[e[3] as string];
          r = f32(initialPose[e[2] as string][k][j]);
          break;
        }
        case 'neg': {
          const a = v[e[2] as number];
          r = t === 'j' ? BigInt.asIntN(64, -(a as bigint)) : t === 'i' ? -(a as number) | 0 : -(a as number);
          break;
        }
        case 'conv': r = convert(v[e[2] as number], nodes[e[2] as number][1], t); break;
        case '<': case '<=': case '>': case '>=': case '==': case '!=':
          r = compare(op, v[e[2] as number], v[e[3] as number]);
          break;
        case 'not': r = !v[e[2] as number]; break;
        // 类型 z 的 and / or 是逻辑的；i、j 的是按位的，走 算
        case 'and': r = t === 'z' ? Boolean(v[e[2] as number]) && Boolean(v[e[3] as number]) : applyOp(op, t, v[e[2] as number], v[e[3] as number]); break;
        case 'or': r = t === 'z' ? Boolean(v[e[2] as number]) || Boolean(v[e[3] as number]) : applyOp(op, t, v[e[2] as number], v[e[3] as number]); break;
        case 'sel': r = v[e[2] as number] ? v[e[3] as number] : v[e[4] as number]; break;
        case 'call': {
          const args = (e.slice(3) as number[]).map((a) => v[a] as number);
          r = builtins[e[2] as string](...args);
          break;
        }
        case 'tab': {
          const constTable = e[2] as unknown[];
          const k = v[e[3] as number] as number;
          r = k >= 0 && k < constTable.length ? readConst(constTable[k], t) : t === 'j' ? 0n : 0;
          break;
        }
        default: r = applyOp(op, t, v[e[2] as number], v[e[3] as number]);
      }
      v[i] = r;
    }
    return v;
  };
};

/** 编译一次、按帧求：返回 (输入) → 部件姿态（从模型的初始姿态出发，程序写到的字段换成算出来的值）和不画的部件 */
export const poseEvaluator = (poseProgram: PoseProgram, root: EntityPart) => {
  const solve = nodeEvaluator(poseProgram, root);
  return (inputs: PoseInput): { partPoses: MutablePose; hidden: string[] } => {
    const v = solve(inputs);
    const partPoses = restPose(root);
    const hidden: string[] = [];
    for (const [part, fields] of Object.entries(poseProgram.输出)) {
      const p = partPoses[part];
      if (!p) throw new Error(`模型里没有部件 ${part}`);
      for (const [field, i] of Object.entries(fields)) {
        const x = Number(v[i]);
        if (field in initialFields) {
          const [k, j] = initialFields[field];
          p[k][j] = x;
        } else if (field === 'xScale' || field === 'yScale' || field === 'zScale') p.scale['xyz'.indexOf(field[0])] = x;
        else if (field === 'visible' && !x) hidden.push(part);
      }
    }
    return { partPoses, hidden };
  };
};

/** EntityModel 的 pose 参数（每次都重新编译，画面里一帧一个模型时够用；多帧、多只用 姿态求值器 编译一次） */
export const computePartPose = (poseProgram: PoseProgram, root: EntityPart, inputs: PoseInput): Record<string, PartPose> => {
  const { partPoses, hidden } = poseEvaluator(poseProgram, root)(inputs);
  const out = toPartPoses(partPoses);
  for (const k of hidden) out[k] = { ...out[k], hide: true };
  return out;
};
