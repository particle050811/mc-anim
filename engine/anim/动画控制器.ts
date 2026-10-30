// 动画控制器：决定某一时刻播哪段动画、换动画时怎么过渡。纯模块，不 import react、three。两种：
//   基岩版 animation_controllers（.animation_controllers.json）：状态机，转移条件是 Molang，blend_transition 交叉淡化，on_entry / on_exit。
//   GeckoLib 的控制器：mod 代码里按时间 setAnimation，换动画时从当前姿势线性插到新动画第 0 刻的姿势（transitionLength 刻），再从 0 开播。
// 逐帧渲染时拿不到上一帧，所以控制器从 0 秒往后推：基岩版按固定步长推（结果只看时间，和取帧顺序无关，推过的步记下来），
// GeckoLib 版的安排是给定的时刻表，直接按事件算。出来的是一张骨骼表，当成一层交给 混合层 / 基岩实体 的 层们。
import { lerp } from '../core/数学.ts';
import { 编译, 求值, 取值, 烘焙, type Molang式, type Molang环境 } from './Molang.ts';
import {
  动画时间, 动画进度, 动画长度, 取样骨骼, 按口径, 混合层, 默认口径,
  type 口径, type 基岩动画, type 循环方式, type 骨骼姿势, type 骨骼表, type 轴值,
} from './基岩动画.ts';

/** 一个控制器在某时刻给的骨骼表。基环境 是实体那边的环境（查询、外部名字），取样动画时垫在控制器自己的环境下面 */
export type 控制器播放器 = { readonly 名: string; 姿势: (秒: number, 基环境?: Molang环境) => 骨骼表 };

const 是对象 = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 两个环境按命名空间合并，上面的盖下面的同名项；变量表 上 给了就用上的（同 库/生物/定义生物.ts 的 合并环境，engine 不能 import 库） */
const 合并 = (底: Molang环境 = {}, 上: Molang环境 = {}): Molang环境 => ({
  ...底,
  ...上,
  查询: { ...底.查询, ...上.查询 },
  上下文: { ...底.上下文, ...上.上下文 },
  外部: { ...底.外部, ...上.外部 },
  变量: 上.变量 ?? 底.变量,
});

// ---- 姿势插值（两边缺的通道按原位：转角、位置 0，缩放 1） ----
const 三 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);
/** 角度差折到 (−180, 180]：blend_via_shortest_path 用 */
const 最短差 = (d: number) => d - 360 * Math.ceil((d - 180) / 360);

/** 骨骼表 a → b 插 u（0 = a，1 = b）。最短路径：转角按差折到 ±180° 插（基岩版 blend_via_shortest_path） */
export const 插姿势 = (a: 骨骼表, b: 骨骼表, u: number, 最短路径 = false): 骨骼表 => {
  const 出: 骨骼表 = {};
  for (const 骨 of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [p, q] = [a[骨] ?? {}, b[骨] ?? {}];
    const 姿: 骨骼姿势 = {};
    if (p.rot || q.rot) {
      const [x, y] = [p.rot ?? [0, 0, 0], q.rot ?? [0, 0, 0]];
      姿.rot = x.map((v, j) => (最短路径 ? v + 最短差(y[j]! - v) * u : lerp(v, y[j]!, u)));
    }
    if (p.pos || q.pos) {
      const [x, y] = [p.pos ?? [0, 0, 0], q.pos ?? [0, 0, 0]];
      姿.pos = x.map((v, j) => lerp(v, y[j]!, u));
    }
    if (p.scale !== undefined || q.scale !== undefined) {
      const [x, y] = [三(p.scale ?? 1), 三(q.scale ?? 1)];
      姿.scale = x.map((v, j) => lerp(v, y[j]!, u));
    }
    出[骨] = 姿;
  }
  return 出;
};

// ======== 基岩版 animation_controllers ========
export type 状态动画 = { 名: string; 权重?: 轴值 };
/** blend_transition：秒数（旧状态权重 1 → 0 线性），或曲线 { 秒: 旧状态权重 } */
export type 过渡写法 = number | readonly { 时: number; 权: number }[];
export type 控制器状态 = {
  名: string;
  动画们: readonly 状态动画[];
  /** 按顺序求，第一个成立的生效（一步最多转一次） */
  转移们: readonly { 到: string; 条件: 轴值 }[];
  /** 离开这个状态时淡出多久（基岩版的 blend_transition 写在被离开的状态上） */
  过渡: 过渡写法;
  最短路径: boolean;
  进入: readonly Molang式[];
  退出: readonly Molang式[];
};
export type 动画控制器 = { 名: string; 初始: string; 状态们: Readonly<Record<string, 控制器状态>> };

const 句们 = (x: unknown): Molang式[] => (x === undefined ? [] : (Array.isArray(x) ? x : [x]).map((s) => 编译(String(s))));

const 解析过渡 = (x: unknown, 位置: string): 过渡写法 => {
  if (x === undefined) return 0;
  if (typeof x === 'number') return Math.max(0, x);
  if (是对象(x)) {
    return Object.entries(x)
      .map(([k, v]) => ({ 时: Number.parseFloat(k), 权: Number(v) }))
      .sort((a, b) => a.时 - b.时);
  }
  throw new Error(`控制器：${位置} 的 blend_transition 写法不认识：${JSON.stringify(x)}`);
};

/** 解析一个 .animation_controllers.json（format 1.10.0，已经 JSON.parse 过）→ 控制器名 → 控制器。转到不存在的状态直接报错 */
export const 解析控制器文件 = (文件: unknown, 口: 口径 = 默认口径): Record<string, 动画控制器> => {
  if (!是对象(文件) || !是对象(文件.animation_controllers)) throw new Error('控制器：不是基岩动画控制器文件（缺 animation_controllers）');
  const 精 = 按口径({}, 口).数值;
  const 出: Record<string, 动画控制器> = {};
  for (const [名, c] of Object.entries(文件.animation_controllers)) {
    if (!是对象(c) || !是对象(c.states)) throw new Error(`控制器：${名} 缺 states`);
    const 状态们: Record<string, 控制器状态> = {};
    for (const [状名, st] of Object.entries(c.states)) {
      const s = 是对象(st) ? st : {};
      const 动画们 = (Array.isArray(s.animations) ? s.animations : []).flatMap((a): 状态动画[] =>
        typeof a === 'string' ? [{ 名: a }] : 是对象(a) ? Object.entries(a).map(([k, w]) => ({ 名: k, 权重: 烘焙(w as number | string, 精) })) : [],
      );
      const 转移们 = (Array.isArray(s.transitions) ? s.transitions : []).flatMap((t) =>
        是对象(t) ? Object.entries(t).map(([到, 条件]) => ({ 到, 条件: 烘焙(条件 as number | string, 精) })) : [],
      );
      状态们[状名] = {
        名: 状名,
        动画们,
        转移们,
        过渡: 解析过渡(s.blend_transition, `${名}/${状名}`),
        最短路径: s.blend_via_shortest_path === true,
        进入: 句们(s.on_entry),
        退出: 句们(s.on_exit),
      };
    }
    const 初始 = typeof c.initial_state === 'string' ? c.initial_state : 'default';
    if (!状态们[初始]) throw new Error(`控制器：${名} 没有初始状态 ${初始}`);
    for (const st of Object.values(状态们)) {
      for (const t of st.转移们) if (!状态们[t.到]) throw new Error(`控制器：${名}/${st.名} 转到不存在的状态 ${t.到}`);
    }
    出[名] = { 名, 初始, 状态们 };
  }
  return 出;
};

/** 离开状态后 d 秒时旧状态的权重（1 → 0） */
export const 过渡权重 = (过渡: 过渡写法, d: number): number => {
  if (typeof 过渡 === 'number') return 过渡 > 0 ? Math.min(1, Math.max(0, 1 - d / 过渡)) : 0;
  if (!过渡.length) return 0;
  const i = 过渡.findIndex((k) => k.时 > d);
  if (i === 0) return 过渡[0]!.权;
  if (i < 0) return 过渡[过渡.length - 1]!.权;
  const [a, b] = [过渡[i - 1]!, 过渡[i]!];
  return lerp(a.权, b.权, (d - a.时) / (b.时 - a.时));
};
const 过渡时长 = (过渡: 过渡写法): number => (typeof 过渡 === 'number' ? 过渡 : (过渡[过渡.length - 1]?.时 ?? 0));

export type 基岩控制器选项 = {
  /** 状态里写的动画名到哪找：动画名 → 动画（解析动画文件 的结果，可以几份合在一起） */
  动画们: Readonly<Record<string, 基岩动画>>;
  /** 客户端实体定义里的 animations 短名表（短名 → 全名）；状态里的名字先查这张表 */
  名表?: Readonly<Record<string, string>>;
  /** 转移条件求值用的环境，可以随时间变（q.is_moving 之类）；变量表由控制器自己持有，初值取 0 秒时环境的变量表（拷一份） */
  环境?: Molang环境 | ((秒: number) => Molang环境);
  /** 推进步长（秒），默认 1/20：转移最多晚一步生效 */
  步长?: number;
  口径?: 口径;
};

/** 某一步的状态：当前状态和进入时刻，正在淡出的上一个状态，这一步的变量表（只在转移时换新的一份） */
export type 控制器步 = {
  readonly 状态: string;
  readonly 进入: number;
  readonly 上个?: { readonly 状态: string; readonly 进入: number; readonly 离开: number };
  readonly 变量: Readonly<Record<string, number | string>>;
};

const 最多步 = 2_000_000;

/**
 * 基岩版控制器的播放器。每一步：先按顺序求当前状态的转移条件（第一个成立的生效，旧状态 on_exit、新状态 on_entry），
 * 查询里补上 q.all_animations_finished、q.any_animation_finished（当前状态的动画都 / 有一个至少播完一遍）。
 * 姿势：当前状态各动画按权重叠加（基岩版的动画是叠加在原位上的，见 混合层 的「叠加」），
 * 淡出期间旧状态的动画接着播，两边按 过渡权重 插（最短路径看旧状态的 blend_via_shortest_path）。
 * 简化：淡出中又转移时只留最近的上一个状态，更早的直接丢掉
 */
export const 基岩控制器 = (控制器: 动画控制器, 选项: 基岩控制器选项): 控制器播放器 & { 步于: (秒: number) => 控制器步 } => {
  const 口 = 选项.口径 ?? 默认口径;
  const 步长 = 选项.步长 ?? 1 / 20;
  if (!(步长 > 0)) throw new Error(`控制器 ${控制器.名}：步长要 > 0`);
  const 环境于 = (秒: number): Molang环境 => (typeof 选项.环境 === 'function' ? 选项.环境(秒) : (选项.环境 ?? {}));
  const 动画 = (名: string): 基岩动画 => {
    const a = 选项.动画们[选项.名表?.[名] ?? 名];
    if (!a) throw new Error(`控制器 ${控制器.名}：找不到动画 ${名}${选项.名表?.[名] ? `（${选项.名表[名]}）` : ''}`);
    return a;
  };
  // 解析期就把名字核一遍，拼写错不等到渲染
  for (const st of Object.values(控制器.状态们)) for (const a of st.动画们) 动画(a.名);

  const 播完 = (状态: string, 已过: number, 环境: Molang环境): boolean[] =>
    控制器.状态们[状态]!.动画们.map(({ 名 }) => {
      const a = 动画(名);
      const 长 = 动画长度(a, 口);
      const 延 = a.开始延迟 === undefined ? 0 : 取值(a.开始延迟, 环境);
      return Number.isFinite(长) && 已过 >= 延 + 长;
    });
  const 步环境 = (秒: number, 步: { 状态: string; 进入: number }, 变量: Record<string, number | string>): Molang环境 => {
    const e = 按口径(环境于(秒), 口);
    const 完 = 播完(步.状态, 秒 - 步.进入, e);
    return { ...e, 变量, 查询: { ...e.查询, all_animations_finished: 完.every(Boolean) ? 1 : 0, any_animation_finished: 完.some(Boolean) ? 1 : 0 } };
  };

  const 历史: 控制器步[] = [];
  const 推到 = (k: number) => {
    if (k >= 最多步) throw new Error(`控制器 ${控制器.名}：要推 ${k} 步，超过上限（步长太小或时间太长）`);
    while (历史.length <= k) {
      const i = 历史.length;
      const 秒 = i * 步长;
      let 步: 控制器步;
      if (i === 0) {
        const 变量 = { ...(环境于(0).变量 ?? {}) };
        步 = { 状态: 控制器.初始, 进入: 0, 变量 };
        for (const s of 控制器.状态们[控制器.初始]!.进入) 求值(s, 步环境(0, 步, 变量));
      } else 步 = 历史[i - 1]!;
      const 当前 = 控制器.状态们[步.状态]!;
      const 环境 = 步环境(秒, 步, 步.变量 as Record<string, number | string>);
      const 转 = 当前.转移们.find((t) => 取值(t.条件, 环境) !== 0);
      if (转) {
        const 变量 = { ...步.变量 };
        for (const s of 当前.退出) 求值(s, { ...环境, 变量 });
        const 新 = { 状态: 转.到, 进入: 秒 };
        for (const s of 控制器.状态们[转.到]!.进入) 求值(s, 步环境(秒, 新, 变量));
        const 淡出 = 过渡时长(当前.过渡) > 0;
        步 = { ...新, 变量, 上个: 淡出 ? { 状态: 步.状态, 进入: 步.进入, 离开: 秒 } : undefined };
      }
      历史.push(步);
    }
  };

  /** 秒 秒时所在的步（往前取不重推） */
  const 步于 = (秒: number): 控制器步 => {
    const k = Math.max(0, Math.floor(秒 / 步长 + 1e-9));
    推到(k);
    return 历史[k]!;
  };

  const 状态姿势 = (状态: string, 已过: number, 环境: Molang环境): 骨骼表 =>
    混合层(
      控制器.状态们[状态]!.动画们.map(({ 名, 权重 }) => {
        const a = 动画(名);
        const 进 = 动画进度(a, 已过, { 环境, 口径: 口 });
        const w = 权重 === undefined ? 1 : 取值(权重, 环境);
        return { 骨骼: 进.停止 || 进.等待 ? {} : 取样骨骼(a, 进.时, { 环境, 口径: 口 }), 模式: '叠加' as const, 权重: w };
      }),
      '通用',
    );

  const 姿势 = (秒: number, 基环境?: Molang环境): 骨骼表 => {
    const 步 = 步于(秒);
    // 动画里的赋值写进一份拷贝，不改历史
    const 环境 = 按口径({ ...合并(基环境, 环境于(秒)), 变量: { ...步.变量 } }, 口);
    const 新 = 状态姿势(步.状态, 秒 - 步.进入, 环境);
    const 上 = 步.上个;
    if (!上) return 新;
    const 旧状态 = 控制器.状态们[上.状态]!;
    const w旧 = 过渡权重(旧状态.过渡, 秒 - 上.离开);
    if (w旧 <= 0) return 新;
    return 插姿势(状态姿势(上.状态, 秒 - 上.进入, 环境), 新, 1 - w旧, 旧状态.最短路径);
  };

  return Object.assign({ 名: 控制器.名, 姿势 }, { 步于 });
};

// ======== GeckoLib 的控制器（代码驱动 + transitionLength） ========
/**
 * RawAnimation 里的一段：播一段动画（循环：once / loop / hold，或播几遍；不写按动画文件自己的 loop），或等几刻（thenWait）
 */
export type 播放项 = { 名: string; 循环?: 循环方式 | number } | { 等刻: number };
export type GeckoLib安排 = readonly { 秒: number; 播: string | readonly 播放项[] | null }[];
export type GeckoLib控制器设定 = {
  名: string;
  /** AnimationController 的 transitionTickTime（刻，1 刻 = 1/20 秒） */
  过渡刻: number;
  /** handler 在这些时刻返回新的 RawAnimation（秒升序）。null = PlayState.STOP。和当前一样的不重播（GeckoLib 比 RawAnimation 相等） */
  安排: GeckoLib安排;
  /** animationSpeed，默认 1；过渡和播放都按它快慢 */
  速度?: number;
  动画们: Readonly<Record<string, 基岩动画>>;
  口径?: 口径;
  环境?: Molang环境 | ((秒: number) => Molang环境);
};

type 阶段 =
  | { 种: '过渡'; 起: number; 止: number; 长: number; 名: string }
  | { 种: '播放'; 起: number; 止: number; 名: string; 循环: 循环方式 | number }
  | { 种: '空'; 起: number; 止: number };

const 统一 = (播: string | readonly 播放项[]): readonly 播放项[] => (typeof 播 === 'string' ? [{ 名: 播 }] : 播);

/**
 * GeckoLib 4 的控制器（照 geckolib-forge-1.20.1-4.8.4 的 AnimationController.process、AnimationProcessor.tickAnimation 原文，MIT）：
 * - handler 换了动画：进入过渡，过渡刻 内从「切换那一刻的姿势」线性插到新动画第 0 刻的姿势，只插新动画有关键帧的骨骼和通道；
 *   过渡完从 0 开播。过渡刻 是 0 就直接开播。开头第一段也从原位过渡（GeckoLib 也是）。
 * - 播完一遍（once、几遍）的：队列里还有就过渡到下一段，没有就停；停了、等刻、STOP 时这个控制器不给骨骼（GeckoLib 里骨骼回原位）。
 * - hold 停在末帧。
 * 简化：切换那一刻的姿势取本控制器自己给的值（GeckoLib 取的是骨骼当时的总值，含别的控制器）；没给过的按原位。
 * 不支持 overrideEasingType、triggerableAnim、声音粒子关键帧
 */
export const GeckoLib控制器 = (设定: GeckoLib控制器设定): 控制器播放器 & { 阶段们: readonly 阶段[] } => {
  const 口 = 设定.口径 ?? 默认口径;
  const 速 = 设定.速度 ?? 1;
  if (!(速 > 0)) throw new Error(`控制器 ${设定.名}：速度要 > 0`);
  const 过渡秒 = 设定.过渡刻 / 20 / 速;
  const 动画 = (名: string): 基岩动画 => {
    const a = 设定.动画们[名];
    if (!a) throw new Error(`控制器 ${设定.名}：找不到动画 ${名}`);
    return a;
  };
  const 环境于 = (秒: number): Molang环境 => (typeof 设定.环境 === 'function' ? 设定.环境(秒) : (设定.环境 ?? {}));

  // 按时刻表排出各阶段（[起, 止)）
  const 阶段们: 阶段[] = [];
  // 和前一条一样的 RawAnimation 不算换（GeckoLib 不重播），先去掉
  const 键 = (播: string | readonly 播放项[] | null) => JSON.stringify(播 === null ? null : 统一(播));
  const 安排 = [...设定.安排]
    .sort((a, b) => a.秒 - b.秒)
    .filter((x, i, 全) => i === 0 || 键(x.播) !== 键(全[i - 1]!.播));
  for (let i = 0; i < 安排.length; i++) {
    const { 秒: T, 播 } = 安排[i]!;
    const 到 = 安排[i + 1]?.秒 ?? Infinity;
    if (播 === null) {
      阶段们.push({ 种: '空', 起: T, 止: 到 });
      continue;
    }
    let t = T;
    for (const 项 of 统一(播)) {
      if (t >= 到) break;
      if ('等刻' in 项) {
        const 止 = Math.min(到, t + 项.等刻 / 20 / 速);
        阶段们.push({ 种: '空', 起: t, 止 });
        t = 止;
        continue;
      }
      const a = 动画(项.名);
      if (过渡秒 > 0) {
        const 止 = Math.min(到, t + 过渡秒);
        阶段们.push({ 种: '过渡', 起: t, 止, 长: 过渡秒, 名: 项.名 });
        t = 止;
        if (t >= 到) break;
      }
      const 循环 = 项.循环 ?? a.循环;
      const 长 = 动画长度(a, 口) / 速;
      const 时长 = 循环 === 'loop' || 循环 === 'hold' ? Infinity : typeof 循环 === 'number' ? 长 * Math.max(1, 循环) : 长;
      const 止 = Math.min(到, t + 时长);
      阶段们.push({ 种: '播放', 起: t, 止, 名: 项.名, 循环 });
      t = 止;
    }
    if (t < 到) 阶段们.push({ 种: '空', 起: t, 止: 到 });
  }

  const 阶段于 = (秒: number): number => {
    let lo = 0;
    let hi = 阶段们.length - 1;
    if (hi < 0 || 秒 < 阶段们[0]!.起) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (阶段们[mid]!.起 <= 秒) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const 播放时间 = (a: 基岩动画, 循环: 循环方式 | number, 已过: number): number => {
    const t = 已过 * 速;
    const 长 = 动画长度(a, 口);
    if (typeof 循环 === 'number') return Number.isFinite(长) && 长 > 0 ? (t >= 长 * 循环 ? 长 : t % 长) : t;
    if (循环 === 'hold') return Math.min(t, 长);
    return 动画时间({ ...a, 循环 }, t, 口).时;
  };

  // 阶段 i 在 秒 时的姿势；过渡要用前一阶段在过渡开始那一刻的姿势（递归，深度 = 连着被打断的过渡数）
  const 阶段姿势 = (i: number, 秒: number, 基环境: Molang环境 | undefined): 骨骼表 => {
    const p = 阶段们[i];
    if (!p || p.种 === '空') return {};
    const e = 合并(基环境, 环境于(秒));
    const 环境 = 按口径({ ...e, 变量: { ...(e.变量 ?? {}) } }, 口);
    if (p.种 === '播放') return 取样骨骼(动画(p.名), 播放时间(动画(p.名), p.循环, Math.min(秒, p.止) - p.起), { 环境, 口径: 口 });
    const 目标全 = 取样骨骼(动画(p.名), 0, { 环境: { ...环境, 查询: { ...环境.查询, anim_time: 0 } }, 口径: 口 });
    const 起姿 = 阶段姿势(i - 1, p.起, 基环境);
    // 只插新动画有关键帧的骨骼、通道；起点缺的按原位
    const 目标: 骨骼表 = {};
    const 起点: 骨骼表 = {};
    for (const [骨, 姿] of Object.entries(目标全)) {
      目标[骨] = 姿;
      const s = 起姿[骨] ?? {};
      起点[骨] = {
        rot: 姿.rot ? (s.rot ?? [0, 0, 0]) : undefined,
        pos: 姿.pos ? (s.pos ?? [0, 0, 0]) : undefined,
        scale: 姿.scale !== undefined ? (s.scale ?? 1) : undefined,
      };
    }
    const u = Math.min(1, Math.max(0, (秒 - p.起) / p.长));
    const 出 = 插姿势(起点, 目标, u);
    for (const 姿 of Object.values(出)) for (const k of ['rot', 'pos', 'scale'] as const) if (姿[k] === undefined) delete 姿[k];
    return 出;
  };

  return Object.assign(
    { 名: 设定.名, 姿势: (秒: number, 基环境?: Molang环境) => 阶段姿势(阶段于(秒), 秒, 基环境) },
    { 阶段们: 阶段们 as readonly 阶段[] },
  );
};
