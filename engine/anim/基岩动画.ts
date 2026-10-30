// 基岩动画文件（.animation.json，format 1.8.0，Blockbench、GeckoLib、YSM、车万女仆用的格式）的读取和播放。纯模块，不 import react、three。
// 解析：值是数或 Molang；能在解析时算掉的算成数（烘焙），剩下的编译好，播放时按环境求值。
// 播放分两种口径：
//   'TLM'：照车万女仆 1.5.3 自带的 GeckoLib 3 分支（JsonKeyFrameUtils、BoneKeyFrameProcessor、AnimationProcessor、AnimationController 反汇编），
//          魔法酒狐的手抄版都按这个口径对过（作品/把回忆拼好给你/核对/基岩动画/对照.test.ts）。
//   '通用'：Blockbench / 基岩版 / GeckoLib 4 的写法（step、bezier、缓动名、hold_on_last_frame 停在末帧、blend_weight 权重）。
//          缓动名照 GeckoLib 4.8.4 源码（插值.ts）；catmullrom 的控制点、lerp_mode step、pre/post 按基岩版写法，和 GeckoLib 4 不一样（docs/新生物.md）。
// 输出的骨骼姿势同 engine/model/基岩模型.tsx 的 BonePose（度、像素，数值约定同动画文件），这里不 import 它，免得带上 three。
import { lerp } from '../core/数学.ts';
import { catmullRom, 缓动, 贝塞尔, 阶跃, type 插值方式 } from './插值.ts';
import { 烘焙, 取值, 编译, 求值, type Molang式, type Molang环境 } from './Molang.ts';

export type 口径 = 'TLM' | '通用';
/** 不给口径时用 '通用'（各 GeckoLib / Blockbench 文件的写法）；TLM 自带的分支有怪处，要显式写 'TLM' */
export const 默认口径: 口径 = '通用';
/** Molang 按口径的精度：TLM 的 mocha 是 float，'通用' 照 GeckoLib 4 的 mclib 是 double（出处见 Molang.ts 文件头）。环境里写了 数值 就听环境的 */
export const 口径数值 = (口: 口径): 'float' | 'double' => (口 === 'TLM' ? 'float' : 'double');
export const 按口径 = (环境: Molang环境, 口: 口径): Molang环境 => (环境.数值 ? 环境 : { ...环境, 数值: 口径数值(口) });
export type 循环方式 = 'once' | 'loop' | 'hold';
export type 轴值 = number | Molang式;
export type 向量值 = readonly [轴值, 轴值, 轴值];
export type 关键帧 = {
  /** 秒 */
  时: number;
  前: 向量值;
  后: 向量值;
  插值: 插值方式;
  /** GeckoLib 4 的缓动名和参数（只在 '通用' 口径起作用） */
  缓动?: { 名: string; 参数?: number[] };
  /** Blockbench 的 bezier 手柄，相对本关键帧的 [时间, 值]，逐轴 */
  手柄?: { 左: readonly [number, number][]; 右: readonly [number, number][] };
};
export type 通道名 = 'rotation' | 'position' | 'scale';
export const 通道名们: readonly 通道名[] = ['rotation', 'position', 'scale'];
export type 骨骼轨道 = Partial<Record<通道名, readonly 关键帧[]>>;
export type 基岩动画 = {
  名: string;
  循环: 循环方式;
  /** animation_length 原文（秒）；没写是 undefined，长度按口径推（见 动画长度） */
  长度?: number;
  动画时间更新?: Molang式;
  混合权重?: 轴值;
  /** start_delay、loop_delay（秒，基岩版写法，见 动画进度）；TLM、GeckoLib 4 都不读 */
  开始延迟?: 轴值;
  循环延迟?: 轴值;
  /** 骨骼按文件里的顺序：Molang 里的赋值按这个顺序执行 */
  骨骼: Readonly<Record<string, 骨骼轨道>>;
  时间线: readonly { 时: number; 句: readonly Molang式[] }[];
};

export type 骨骼姿势 = { rot?: number[]; pos?: number[]; scale?: number | number[] };
export type 骨骼表 = Record<string, 骨骼姿势>;

// ---- 解析 ----
type 原值 = number | string | readonly (number | string)[];
const 是对象 = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// 向量：≥3 个元素逐轴；1～2 个元素取第一个当三轴同值；数、字符串三轴同值（TLM JsonKeyFrameUtils）
type 数值 = Molang环境['数值'];
const 解析向量 = (v: unknown, 位置: string, 精: 数值): 向量值 => {
  const 轴 = (x: unknown): 轴值 => {
    if (typeof x === 'number' || typeof x === 'string') return 烘焙(x, 精);
    throw new Error(`动画：${位置} 的值不是数也不是 Molang：${JSON.stringify(x)}`);
  };
  if (Array.isArray(v)) {
    if (v.length >= 3) return [轴(v[0]), 轴(v[1]), 轴(v[2])];
    if (v.length >= 1) {
      const a = 轴(v[0]);
      return [a, a, a];
    }
  }
  if (是对象(v) && 'vector' in v) return 解析向量(v.vector, 位置, 精);
  if (typeof v === 'number' || typeof v === 'string') {
    const a = 轴(v);
    return [a, a, a];
  }
  throw new Error(`动画：${位置} 的向量写法不认识：${JSON.stringify(v)}`);
};

const 插值名 = (x: unknown): 插值方式 => (x === 'catmullrom' || x === 'step' || x === 'bezier' ? x : 'linear');

const 解析关键帧 = (时: number, v: unknown, 位置: string, 精: 数值): 关键帧 => {
  if (!是对象(v)) {
    const 值 = 解析向量(v as 原值, 位置, 精);
    return { 时, 前: 值, 后: 值, 插值: 'linear' };
  }
  // 只有 post 时当成 pre 用（TLM 如此）；pre、post 都没有时是 { vector, easing } 写法
  const 前原 = v.pre ?? v.post ?? v.vector;
  const 后原 = v.post ?? v.pre ?? v.vector;
  const 前 = 解析向量(前原, 位置, 精);
  const 后 = 后原 === 前原 ? 前 : 解析向量(后原, 位置, 精);
  const 方式名 = String(v.lerp_mode ?? v.easing ?? 'linear').toLowerCase();
  const 帧: 关键帧 = { 时, 前, 后, 插值: 插值名(方式名) };
  if (typeof v.easing === 'string' && 插值名(方式名) === 'linear' && v.easing !== 'linear') {
    帧.缓动 = { 名: v.easing, 参数: Array.isArray(v.easingArgs) ? v.easingArgs.map(Number) : undefined };
  }
  const 手柄 = (t: unknown, val: unknown, 缺省: number): [number, number][] =>
    [0, 1, 2].map((i) => [Number(Array.isArray(t) ? t[i] : (t ?? 缺省)), Number(Array.isArray(val) ? val[i] : (val ?? 0))]);
  if (帧.插值 === 'bezier') {
    帧.手柄 = { 左: 手柄(v.bezier_left_time, v.bezier_left_value, -0.1), 右: 手柄(v.bezier_right_time, v.bezier_right_value, 0.1) };
  }
  return 帧;
};

const 解析通道 = (v: unknown, 位置: string, 精: 数值): 关键帧[] => {
  // 数、字符串、数组、{ vector }：常量，一个 0 秒的关键帧
  if (!是对象(v) || ('vector' in v && !Object.keys(v).some((k) => /^[\d.]+$/.test(k)))) return [解析关键帧(0, v, 位置, 精)];
  return Object.entries(v)
    .map(([k, kv]) => {
      const 时 = Number.parseFloat(k);
      if (!Number.isFinite(时)) throw new Error(`动画：${位置} 的时间写法不认识：${k}`);
      return 解析关键帧(时, kv, `${位置}@${k}`, 精);
    })
    .sort((a, b) => a.时 - b.时);
};

const 解析循环 = (x: unknown): 循环方式 => (x === true ? 'loop' : x === 'hold_on_last_frame' ? 'hold' : 'once');

/** 解析一个 .animation.json（已经 JSON.parse 过的对象）→ 动画名 → 动画。口径 决定解析时烘掉的常量按 float 还是 double 算（见 口径数值） */
export const 解析动画文件 = (文件: unknown, 口: 口径 = 默认口径): Record<string, 基岩动画> => {
  const 精 = 口径数值(口);
  if (!是对象(文件) || !是对象(文件.animations)) throw new Error('动画：不是基岩动画文件（缺 animations）');
  const 出: Record<string, 基岩动画> = {};
  for (const [名, a] of Object.entries(文件.animations)) {
    if (!是对象(a)) continue;
    const 骨骼: Record<string, 骨骼轨道> = {};
    for (const [骨, b] of Object.entries(是对象(a.bones) ? a.bones : {})) {
      if (!是对象(b)) continue;
      const 轨: 骨骼轨道 = {};
      for (const [ch, v] of Object.entries(b)) if ((通道名们 as string[]).includes(ch)) 轨[ch as 通道名] = 解析通道(v, `${名}/${骨}/${ch}`, 精);
      骨骼[骨] = 轨;
    }
    const 时间线 = Object.entries(是对象(a.timeline) ? a.timeline : {})
      .map(([k, v]) => ({ 时: Number.parseFloat(k), 句: (Array.isArray(v) ? v : [v]).map((s) => 编译(String(s))) }))
      .sort((x, y) => x.时 - y.时);
    const 长度 = a.animation_length === undefined ? undefined : Number(a.animation_length);
    出[名] = {
      名,
      循环: 解析循环(a.loop),
      长度,
      动画时间更新: a.anim_time_update === undefined ? undefined : 编译(String(a.anim_time_update)),
      混合权重: a.blend_weight === undefined ? undefined : 烘焙(a.blend_weight as number | string, 精),
      开始延迟: a.start_delay === undefined ? undefined : 烘焙(a.start_delay as number | string, 精),
      循环延迟: a.loop_delay === undefined ? undefined : 烘焙(a.loop_delay as number | string, 精),
      骨骼,
      时间线,
    };
  }
  return 出;
};

// ---- 时间 ----
/**
 * 动画长度（秒），不定长是 Infinity。
 * TLM：没写 animation_length 时取各通道「倒数第二个关键帧」时间的最大值（GeckoLib 3 calculateLength 取的是最后一段的起点，算是它的怪处），
 * 结果是 0（只有 0 秒的常量帧）就当无限长。'通用'：取最后一个关键帧和时间线的最大时间，0 也当无限长
 */
export const 动画长度 = (动画: 基岩动画, 口: 口径 = 默认口径): number => {
  if (动画.长度 !== undefined) return 动画.长度;
  let 长 = 0;
  for (const 轨 of Object.values(动画.骨骼)) {
    for (const 帧们 of Object.values(轨)) {
      if (!帧们?.length) continue;
      const 帧 = 口 === 'TLM' ? 帧们[帧们.length - 2] : 帧们[帧们.length - 1];
      长 = Math.max(长, 帧?.时 ?? 0);
    }
  }
  if (口 === '通用') for (const { 时 } of 动画.时间线) 长 = Math.max(长, 时);
  return 长 > 0 ? 长 : Infinity;
};

/**
 * 播放了 秒 秒时的动画时间（q.anim_time）。loop 按长度取余；once 到头就停（停止：骨骼不再由这段动画给，TLM 里会慢慢回到原位）。
 * hold_on_last_frame：TLM 的 GeckoLib 3 分支没有特别处理（isRepeatingAfterEnd 是 false），和 once 一样停；'通用' 停在末帧
 */
export const 动画时间 = (动画: 基岩动画, 秒: number, 口: 口径 = 默认口径): { 时: number; 停止: boolean } => {
  const t = Math.max(0, 秒);
  const 长 = 动画长度(动画, 口);
  if (!Number.isFinite(长)) return { 时: t, 停止: false };
  if (动画.循环 === 'loop') return { 时: 长 > 0 ? t % 长 : 0, 停止: false };
  if (t < 长) return { 时: t, 停止: false };
  if (动画.循环 === 'hold' && 口 === '通用') return { 时: 长, 停止: false };
  return { 时: 长, 停止: true };
};

// ---- 取样 ----
const 求向量 = (v: 向量值, 环境: Molang环境): [number, number, number] => [取值(v[0], 环境), 取值(v[1], 环境), 取值(v[2], 环境)];

/**
 * 一个通道在动画时间 t（秒）的值。
 * TLM：t 在 [K(i−1), K(i)) 内取第 i 段，起点值是 K(i−1) 的 post、终点是 K(i) 的 pre；段内进度 < 1e-5 取起点，> 0.99999 取 K(i) 的 post；
 * 两头有一个是 catmullrom 就按 catmullrom，控制点取 K(i−2) 的 post、K(i+1) 的 pre（下标夹在两端）；第一个关键帧之前取它的 pre，最后一个之后取它的 post
 */
export const 取样通道 = (帧们: readonly 关键帧[], t: number, 环境: Molang环境 = {}, 口: 口径 = 默认口径): [number, number, number] => {
  const n = 帧们.length;
  const i = 帧们.findIndex((k) => k.时 > t);
  if (i === 0) {
    const 首 = 帧们[0]!;
    return 求向量(口 === 'TLM' && t / 首.时 > 0.99999 ? 首.后 : 首.前, 环境);
  }
  if (i < 0) return 求向量(帧们[n - 1]!.后, 环境);
  const a = 帧们[i - 1]!;
  const b = 帧们[i]!;
  const u = (t - a.时) / (b.时 - a.时);
  if (口 === 'TLM') {
    if (u < 1e-5) return 求向量(a.后, 环境);
    if (u > 0.99999) return 求向量(b.后, 环境);
  }
  const 起 = 求向量(a.后, 环境);
  const 终 = 求向量(b.前, 环境);
  if (a.插值 === 'catmullrom' || b.插值 === 'catmullrom') {
    const 左 = 求向量(帧们[Math.max(0, i - 2)]!.后, 环境);
    const 右 = 求向量(帧们[Math.min(n - 1, i + 1)]!.前, 环境);
    return [0, 1, 2].map((j) => catmullRom(u, 左[j]!, 起[j]!, 终[j]!, 右[j]!)) as [number, number, number];
  }
  if (口 === '通用') {
    if (a.插值 === 'step') return 起.map((x, j) => lerp(x, 终[j]!, 阶跃(u))) as [number, number, number];
    if (a.插值 === 'bezier' || b.插值 === 'bezier') {
      return [0, 1, 2].map((j) =>
        贝塞尔(
          t,
          { t: a.时, v: 起[j]!, 右手柄: a.手柄?.右[j] ?? [0.1, 0] },
          { t: b.时, v: 终[j]!, 左手柄: b.手柄?.左[j] ?? [-0.1, 0] },
        ),
      ) as [number, number, number];
    }
    const e = 缓动(b.缓动?.名, u, b.缓动?.参数);
    return 起.map((x, j) => lerp(x, 终[j]!, e)) as [number, number, number];
  }
  return 起.map((x, j) => lerp(x, 终[j]!, u)) as [number, number, number];
};

export type 播放选项 = {
  /** Molang 环境；q.anim_time 由播放器填，其他查询、变量表、外部名字由调用方给 */
  环境?: Molang环境;
  口径?: 口径;
};

const 带动画时间 = (环境: Molang环境, 时: number): Molang环境 => ({ ...环境, 查询: { ...环境.查询, anim_time: 时 } });

/** 动画时间 时（秒，已经按循环折算过）的全部骨骼。骨骼、通道按文件顺序求值（Molang 赋值有先后） */
export const 取样骨骼 = (动画: 基岩动画, 时: number, 选项: 播放选项 = {}): 骨骼表 => {
  const 口 = 选项.口径 ?? 默认口径;
  const 环境 = 带动画时间(按口径(选项.环境 ?? {}, 口), 时);
  const 出: 骨骼表 = {};
  for (const [骨, 轨] of Object.entries(动画.骨骼)) {
    const 姿: 骨骼姿势 = {};
    for (const [ch, 帧们] of Object.entries(轨) as [通道名, readonly 关键帧[]][]) {
      if (!帧们.length) continue;
      const v = 取样通道(帧们, 时, 环境, 口);
      if (ch === 'rotation') 姿.rot = v;
      else if (ch === 'position') 姿.pos = v;
      else 姿.scale = v;
    }
    出[骨] = 姿;
  }
  return 出;
};

const 循环延迟上限 = 100000;

/**
 * 带 start_delay、loop_delay 的 动画时间（'通用' 口径；TLM 不读这两个，同 动画时间）。
 * 基岩版文档：start_delay 开播前求一次；loop_delay 每遍播完求一次、只对循环动画。
 * 等开播时 等待 是 true（这段动画不给骨骼）；两遍之间的 loop_delay 里停在末帧（anim_time = 长度）。
 * 这两处「等的时候给什么姿势」是推断的，没在游戏里核过（docs/新生物.md）。求值时 q.anim_time 是 0（开播前）或长度（每遍末）
 */
export const 动画进度 = (动画: 基岩动画, 秒: number, 选项: 播放选项 = {}): { 时: number; 停止: boolean; 等待: boolean } => {
  const 口 = 选项.口径 ?? 默认口径;
  if (口 === 'TLM' || (动画.开始延迟 === undefined && 动画.循环延迟 === undefined)) return { ...动画时间(动画, 秒, 口), 等待: false };
  const 环境 = 按口径(选项.环境 ?? {}, 口);
  const 起 = 动画.开始延迟 === undefined ? 0 : 取值(动画.开始延迟, 带动画时间(环境, 0));
  if (秒 < 起) return { 时: 0, 停止: false, 等待: true };
  const t = 秒 - 起;
  const 长 = 动画长度(动画, 口);
  const 延 = 动画.循环延迟;
  if (动画.循环 !== 'loop' || 延 === undefined || !Number.isFinite(长)) return { ...动画时间(动画, t, 口), 等待: false };
  if (typeof 延 === 'number') {
    const 周期 = 长 + Math.max(0, 延);
    if (!(周期 > 0)) return { 时: 0, 停止: false, 等待: false };
    return { 时: Math.min(t % 周期, 长), 停止: false, 等待: false };
  }
  let 始 = 0;
  for (let i = 0; i < 循环延迟上限; i++) {
    if (t < 始 + 长) return { 时: t - 始, 停止: false, 等待: false };
    const d = Math.max(0, 取值(延, 带动画时间(环境, 长)));
    if (t < 始 + 长 + d || 长 + d <= 0) return { 时: 长, 停止: false, 等待: false };
    始 += 长 + d;
  }
  throw new Error(`动画「${动画.名}」：loop_delay 推了 ${循环延迟上限} 遍还没到 ${秒} 秒`);
};

/** 播放了 秒 秒时的骨骼（不带 anim_time_update、时间线；要这两样用 推进）。停了、还在 start_delay 里就是空表 */
export const 取样动画 = (动画: 基岩动画, 秒: number, 选项: 播放选项 = {}): { 骨骼: 骨骼表; 时: number; 停止: boolean } => {
  const { 时, 停止, 等待 } = 动画进度(动画, 秒, 选项);
  return { 骨骼: 停止 || 等待 ? {} : 取样骨骼(动画, 时, 选项), 时, 停止 };
};

// ---- 逐步推进（anim_time_update、时间线） ----
export type 播放状态 = { readonly 时: number; readonly 停止: boolean; readonly 已开始: boolean };
export const 开始播放: 播放状态 = { 时: 0, 停止: false, 已开始: false };

const 执行时间线 = (动画: 基岩动画, 从: number, 到: number, 含起点: boolean, 环境: Molang环境) => {
  for (const { 时, 句 } of 动画.时间线) if ((含起点 ? 时 >= 从 : 时 > 从) && 时 <= 到) for (const s of 句) 求值(s, 环境);
};

/**
 * 推进一步 dt 秒，返回新状态（不改旧的）；环境的变量表会被时间线和 anim_time_update 里的赋值改写。
 * 动画时间：有 anim_time_update 就按它算（q.anim_time 是旧值、q.delta_time 是 dt），否则加 dt。越过的时间线关键点按顺序执行，循环绕回时从 0 再来
 */
export const 推进 = (动画: 基岩动画, 状态: 播放状态, dt: number, 选项: 播放选项 = {}): 播放状态 => {
  if (状态.停止) return 状态;
  const 口 = 选项.口径 ?? 默认口径;
  const 基 = 按口径(选项.环境 ?? {}, 口);
  const 长 = 动画长度(动画, 口);
  if (!状态.已开始) 执行时间线(动画, 0, 0, true, 带动画时间(基, 0));
  const 旧 = 状态.时;
  const 环境 = { ...基, 查询: { ...基.查询, anim_time: 旧, delta_time: dt } };
  let 新 = 动画.动画时间更新 ? 求值(动画.动画时间更新, 环境) : 旧 + dt;
  执行时间线(动画, 旧, Math.min(新, 长), false, 带动画时间(基, 新));
  if (新 < 长) return { 时: 新, 停止: false, 已开始: true };
  if (动画.循环 === 'loop') {
    新 = 长 > 0 ? 新 % 长 : 0;
    执行时间线(动画, 0, 新, true, 带动画时间(基, 新));
    return { 时: 新, 停止: false, 已开始: true };
  }
  if (动画.循环 === 'hold' && 口 === '通用') return { 时: 长, 停止: false, 已开始: true };
  return { 时: 长, 停止: true, 已开始: true };
};

/** 从头按固定步长推进到 秒 秒（最后一步补齐零头），返回状态。时间线驱动的变量（弹簧之类）要这样一步步算 */
export const 播放到 = (动画: 基岩动画, 秒: number, 步长: number, 选项: 播放选项 = {}): 播放状态 => {
  let 状态 = 开始播放;
  let 已 = 0;
  while (已 < 秒 - 1e-12 && !状态.停止) {
    const dt = Math.min(步长, 秒 - 已);
    状态 = 推进(动画, 状态, dt, 选项);
    已 += dt;
  }
  return 状态;
};

// ---- 多层混合（GeckoLib 的多个动画控制器） ----
export type 混合模式 = '覆盖' | '叠加';
export type 动画层 = { 骨骼: 骨骼表; 模式?: 混合模式; 权重?: number };

/** TLM 里控制器名以 parallel_ 开头的转角是叠加的，别的覆盖（AnimationProcessor 反汇编） */
export const TLM控制器模式 = (控制器名: string): 混合模式 => (控制器名.startsWith('parallel_') ? '叠加' : '覆盖');

/** 动画的 blend_weight 在环境里的值，没写是 1。TLM 不读它 */
export const 动画权重 = (动画: 基岩动画, 环境: Molang环境 = {}): number => (动画.混合权重 === undefined ? 1 : 取值(动画.混合权重, 环境));

const 三 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);

/**
 * 按控制器顺序把几层骨骼合成一张表（先给的在下面）。
 * TLM：转角在所有层上累加，叠加层取累加和、覆盖层只取自己这层的值；位置、缩放一律后来的盖前面；权重不读。
 * '通用'：覆盖层按权重从下面的值（没有就是原位：转角、位置 0，缩放 1）插到自己的值；叠加层转角、位置加 权重×值，缩放乘 lerp(1, 值, 权重)
 */
export const 混合层 = (层们: readonly 动画层[], 口: 口径 = 默认口径): 骨骼表 => {
  const 出: 骨骼表 = {};
  const 累计转角: Record<string, number[]> = {};
  for (const 层 of 层们) {
    const 模式 = 层.模式 ?? '覆盖';
    const w = 层.权重 ?? 1;
    for (const [骨, 姿] of Object.entries(层.骨骼)) {
      const 旧 = 出[骨] ?? {};
      const 新: 骨骼姿势 = { ...旧 };
      if (口 === 'TLM') {
        if (姿.rot) {
          const 和 = (累计转角[骨] = (累计转角[骨] ?? [0, 0, 0]).map((x, j) => x + 姿.rot![j]!));
          新.rot = 模式 === '叠加' ? 和 : 姿.rot;
        }
        if (姿.pos) 新.pos = 姿.pos;
        if (姿.scale !== undefined) 新.scale = 姿.scale;
      } else {
        const 合 = (下: number[] | undefined, 值: number[], 原位: number, 乘: boolean) => {
          const d = 下 ?? [原位, 原位, 原位];
          if (模式 === '覆盖') return d.map((x, j) => lerp(x, 值[j]!, w));
          return d.map((x, j) => (乘 ? x * lerp(1, 值[j]!, w) : x + w * 值[j]!));
        };
        if (姿.rot) 新.rot = 合(旧.rot, 姿.rot, 0, false);
        if (姿.pos) 新.pos = 合(旧.pos, 姿.pos, 0, false);
        if (姿.scale !== undefined) 新.scale = 合(旧.scale === undefined ? undefined : 三(旧.scale), 三(姿.scale), 1, true);
      }
      出[骨] = 新;
    }
  }
  return 出;
};
