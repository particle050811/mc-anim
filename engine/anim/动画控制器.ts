// 动画控制器：决定某一时刻播哪段动画、换动画时怎么过渡。纯模块，不 import react、three。两种：
//   基岩版 animation_controllers（.animation_controllers.json）：状态机，转移条件是 Molang，blend_transition 交叉淡化，on_entry / on_exit。
//   GeckoLib 的控制器：mod 代码里按时间 setAnimation，换动画时从当前姿势线性插到新动画第 0 刻的姿势（transitionLength 刻），再从 0 开播。
// 逐帧渲染时拿不到上一帧，所以控制器从 0 秒往后推：基岩版按固定步长推（结果只看时间，和取帧顺序无关，推过的步记下来），
// GeckoLib 版的安排是给定的时刻表，直接按事件算。出来的是一张骨骼表，当成一层交给 混合层 / 基岩实体 的 层们。
import { lerp } from '../core/数学.ts';
import { compile, evaluate, getValue, bake, type MolangExpr, type MolangEnv } from './Molang.ts';
import {
  animTime, animProgress, animLength, sampleSkeleton, applyProfile, blendLayers, defaultProfile,
  type Convention, type BedrockAnimation, type LoopMode, type SkeletonPose, type SkeletonTable, type AxisValue,
} from './基岩动画.ts';

/** 一个控制器在某时刻给的骨骼表。基环境 是实体那边的环境（查询、外部名字），取样动画时垫在控制器自己的环境下面 */
export type ControllerPlayer = { readonly 名: string; poseAt: (sec: number, baseEnv?: MolangEnv) => SkeletonTable };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 两个环境按命名空间合并，上面的盖下面的同名项；变量表 上 给了就用上的（同 库/生物/定义生物.ts 的 合并环境，engine 不能 import 库） */
const merge = (bottomEnv: MolangEnv = {}, override: MolangEnv = {}): MolangEnv => ({
  ...bottomEnv,
  ...override,
  query: { ...bottomEnv.query, ...override.query },
  context: { ...bottomEnv.context, ...override.context },
  external: { ...bottomEnv.external, ...override.external },
  变量: override.变量 ?? bottomEnv.变量,
});

// ---- 姿势插值（两边缺的通道按原位：转角、位置 0，缩放 1） ----
const toVec3 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);
/** 角度差折到 (−180, 180]：blend_via_shortest_path 用 */
const shortestDiff = (d: number) => d - 360 * Math.ceil((d - 180) / 360);

/** 骨骼表 a → b 插 u（0 = a，1 = b）。最短路径：转角按差折到 ±180° 插（基岩版 blend_via_shortest_path） */
export const lerpPose = (a: SkeletonTable, b: SkeletonTable, u: number, shortestPath = false): SkeletonTable => {
  const poses: SkeletonTable = {};
  for (const boneName of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [p, q] = [a[boneName] ?? {}, b[boneName] ?? {}];
    const pose: SkeletonPose = {};
    if (p.rot || q.rot) {
      const [x, y] = [p.rot ?? [0, 0, 0], q.rot ?? [0, 0, 0]];
      pose.rot = x.map((v, j) => (shortestPath ? v + shortestDiff(y[j]! - v) * u : lerp(v, y[j]!, u)));
    }
    if (p.pos || q.pos) {
      const [x, y] = [p.pos ?? [0, 0, 0], q.pos ?? [0, 0, 0]];
      pose.pos = x.map((v, j) => lerp(v, y[j]!, u));
    }
    if (p.scale !== undefined || q.scale !== undefined) {
      const [x, y] = [toVec3(p.scale ?? 1), toVec3(q.scale ?? 1)];
      pose.scale = x.map((v, j) => lerp(v, y[j]!, u));
    }
    poses[boneName] = pose;
  }
  return poses;
};

// ======== 基岩版 animation_controllers ========
export type StateAnimation = { 名: string; weight?: AxisValue };
/** blend_transition：秒数（旧状态权重 1 → 0 线性），或曲线 { 秒: 旧状态权重 } */
export type TransitionSpec = number | readonly { 时: number; weight: number }[];
export type ControllerState = {
  名: string;
  animations: readonly StateAnimation[];
  /** 按顺序求，第一个成立的生效（一步最多转一次） */
  transitions: readonly { 到: string; condition: AxisValue }[];
  /** 离开这个状态时淡出多久（基岩版的 blend_transition 写在被离开的状态上） */
  transition: TransitionSpec;
  shortestPath: boolean;
  onEntry: readonly MolangExpr[];
  退出: readonly MolangExpr[];
};
export type AnimationController = { 名: string; initialState: string; states: Readonly<Record<string, ControllerState>> };

const toExprs = (x: unknown): MolangExpr[] => (x === undefined ? [] : (Array.isArray(x) ? x : [x]).map((s) => compile(String(s))));

const parseTransition = (x: unknown, posLabel: string): TransitionSpec => {
  if (x === undefined) return 0;
  if (typeof x === 'number') return Math.max(0, x);
  if (isObject(x)) {
    return Object.entries(x)
      .map(([k, v]) => ({ 时: Number.parseFloat(k), weight: Number(v) }))
      .sort((a, b) => a.时 - b.时);
  }
  throw new Error(`控制器：${posLabel} 的 blend_transition 写法不认识：${JSON.stringify(x)}`);
};

/** 解析一个 .animation_controllers.json（format 1.10.0，已经 JSON.parse 过）→ 控制器名 → 控制器。转到不存在的状态直接报错 */
export const parseControllerFile = (controllerFile: unknown, convention: Convention = defaultProfile): Record<string, AnimationController> => {
  if (!isObject(controllerFile) || !isObject(controllerFile.animation_controllers)) throw new Error('控制器：不是基岩动画控制器文件（缺 animation_controllers）');
  const precision = applyProfile({}, convention).precision;
  const controllers: Record<string, AnimationController> = {};
  for (const [controllerName, c] of Object.entries(controllerFile.animation_controllers)) {
    if (!isObject(c) || !isObject(c.states)) throw new Error(`控制器：${controllerName} 缺 states`);
    const states: Record<string, ControllerState> = {};
    for (const [stateName, st] of Object.entries(c.states)) {
      const s = isObject(st) ? st : {};
      const animations = (Array.isArray(s.animations) ? s.animations : []).flatMap((a): StateAnimation[] =>
        typeof a === 'string' ? [{ 名: a }] : isObject(a) ? Object.entries(a).map(([k, w]) => ({ 名: k, weight: bake(w as number | string, precision) })) : [],
      );
      const transitions = (Array.isArray(s.transitions) ? s.transitions : []).flatMap((t) =>
        isObject(t) ? Object.entries(t).map(([toState, condition]) => ({ 到: toState, condition: bake(condition as number | string, precision) })) : [],
      );
      states[stateName] = {
        名: stateName,
        animations,
        transitions,
        transition: parseTransition(s.blend_transition, `${controllerName}/${stateName}`),
        shortestPath: s.blend_via_shortest_path === true,
        onEntry: toExprs(s.on_entry),
        退出: toExprs(s.on_exit),
      };
    }
    const initialState = typeof c.initial_state === 'string' ? c.initial_state : 'default';
    if (!states[initialState]) throw new Error(`控制器：${controllerName} 没有初始状态 ${initialState}`);
    for (const st of Object.values(states)) {
      for (const t of st.transitions) if (!states[t.到]) throw new Error(`控制器：${controllerName}/${st.名} 转到不存在的状态 ${t.到}`);
    }
    controllers[controllerName] = { 名: controllerName, initialState, states };
  }
  return controllers;
};

/** 离开状态后 d 秒时旧状态的权重（1 → 0） */
export const transitionWeight = (transition: TransitionSpec, d: number): number => {
  if (typeof transition === 'number') return transition > 0 ? Math.min(1, Math.max(0, 1 - d / transition)) : 0;
  if (!transition.length) return 0;
  const i = transition.findIndex((k) => k.时 > d);
  if (i === 0) return transition[0]!.weight;
  if (i < 0) return transition[transition.length - 1]!.weight;
  const [a, b] = [transition[i - 1]!, transition[i]!];
  return lerp(a.weight, b.weight, (d - a.时) / (b.时 - a.时));
};
const transitionDuration = (transition: TransitionSpec): number => (typeof transition === 'number' ? transition : (transition[transition.length - 1]?.时 ?? 0));

export type BedrockControllerOptions = {
  /** 状态里写的动画名到哪找：动画名 → 动画（解析动画文件 的结果，可以几份合在一起） */
  animations: Readonly<Record<string, BedrockAnimation>>;
  /** 客户端实体定义里的 animations 短名表（短名 → 全名）；状态里的名字先查这张表 */
  nameTable?: Readonly<Record<string, string>>;
  /** 转移条件求值用的环境，可以随时间变（q.is_moving 之类）；变量表由控制器自己持有，初值取 0 秒时环境的变量表（拷一份） */
  环境?: MolangEnv | ((sec: number) => MolangEnv);
  /** 推进步长（秒），默认 1/20：转移最多晚一步生效 */
  stepSec?: number;
  口径?: Convention;
};

/** 某一步的状态：当前状态和进入时刻，正在淡出的上一个状态，这一步的变量表（只在转移时换新的一份） */
export type ControllerStep = {
  readonly 状态: string;
  readonly enteredAt: number;
  readonly prevState?: { readonly 状态: string; readonly enteredAt: number; readonly leftAt: number };
  readonly 变量: Readonly<Record<string, number | string>>;
};

const MAX_STEPS = 2_000_000;

/**
 * 基岩版控制器的播放器。每一步：先按顺序求当前状态的转移条件（第一个成立的生效，旧状态 on_exit、新状态 on_entry），
 * 查询里补上 q.all_animations_finished、q.any_animation_finished（当前状态的动画都 / 有一个至少播完一遍）。
 * 姿势：当前状态各动画按权重叠加（基岩版的动画是叠加在原位上的，见 混合层 的「叠加」），
 * 淡出期间旧状态的动画接着播，两边按 过渡权重 插（最短路径看旧状态的 blend_via_shortest_path）。
 * 简化：淡出中又转移时只留最近的上一个状态，更早的直接丢掉
 */
export const bedrockController = (controller: AnimationController, options: BedrockControllerOptions): ControllerPlayer & { stepAt: (sec: number) => ControllerStep } => {
  const convention = options.口径 ?? defaultProfile;
  const stepSec = options.stepSec ?? 1 / 20;
  if (!(stepSec > 0)) throw new Error(`控制器 ${controller.名}：步长要 > 0`);
  const envAt = (sec: number): MolangEnv => (typeof options.环境 === 'function' ? options.环境(sec) : (options.环境 ?? {}));
  const getAnim = (animName: string): BedrockAnimation => {
    const a = options.animations[options.nameTable?.[animName] ?? animName];
    if (!a) throw new Error(`控制器 ${controller.名}：找不到动画 ${animName}${options.nameTable?.[animName] ? `（${options.nameTable[animName]}）` : ''}`);
    return a;
  };
  // 解析期就把名字核一遍，拼写错不等到渲染
  for (const st of Object.values(controller.states)) for (const a of st.animations) getAnim(a.名);

  const finished = (stateName: string, elapsedSec: number, env: MolangEnv): boolean[] =>
    controller.states[stateName]!.animations.map(({ 名: name }) => {
      const a = getAnim(name);
      const animLengthSec = animLength(a, convention);
      const delaySec = a.startDelaySec === undefined ? 0 : getValue(a.startDelaySec, env);
      return Number.isFinite(animLengthSec) && elapsedSec >= delaySec + animLengthSec;
    });
  const stepEnv = (sec: number, ctrlStep: { 状态: string; enteredAt: number }, variables: Record<string, number | string>): MolangEnv => {
    const e = applyProfile(envAt(sec), convention);
    const finishedFlags = finished(ctrlStep.状态, sec - ctrlStep.enteredAt, e);
    return { ...e, 变量: variables, query: { ...e.query, all_animations_finished: finishedFlags.every(Boolean) ? 1 : 0, any_animation_finished: finishedFlags.some(Boolean) ? 1 : 0 } };
  };

  const history: ControllerStep[] = [];
  const pushTo = (k: number) => {
    if (k >= MAX_STEPS) throw new Error(`控制器 ${controller.名}：要推 ${k} 步，超过上限（步长太小或时间太长）`);
    while (history.length <= k) {
      const i = history.length;
      const sec = i * stepSec;
      let ctrlStep: ControllerStep;
      if (i === 0) {
        const variables = { ...(envAt(0).变量 ?? {}) };
        ctrlStep = { 状态: controller.initialState, enteredAt: 0, 变量: variables };
        for (const s of controller.states[controller.initialState]!.onEntry) evaluate(s, stepEnv(0, ctrlStep, variables));
      } else ctrlStep = history[i - 1]!;
      const current = controller.states[ctrlStep.状态]!;
      const env = stepEnv(sec, ctrlStep, ctrlStep.变量 as Record<string, number | string>);
      const transition = current.transitions.find((t) => getValue(t.condition, env) !== 0);
      if (transition) {
        const variables = { ...ctrlStep.变量 };
        for (const s of current.退出) evaluate(s, { ...env, 变量: variables });
        const nextState = { 状态: transition.到, enteredAt: sec };
        for (const s of controller.states[transition.到]!.onEntry) evaluate(s, stepEnv(sec, nextState, variables));
        const fading = transitionDuration(current.transition) > 0;
        ctrlStep = { ...nextState, 变量: variables, prevState: fading ? { 状态: ctrlStep.状态, enteredAt: ctrlStep.enteredAt, leftAt: sec } : undefined };
      }
      history.push(ctrlStep);
    }
  };

  /** 秒 秒时所在的步（往前取不重推） */
  const stepAt = (sec: number): ControllerStep => {
    const k = Math.max(0, Math.floor(sec / stepSec + 1e-9));
    pushTo(k);
    return history[k]!;
  };

  const statePose = (stateName: string, elapsedSec: number, env: MolangEnv): SkeletonTable =>
    blendLayers(
      controller.states[stateName]!.animations.map(({ 名: name, weight }) => {
        const a = getAnim(name);
        const progress = animProgress(a, elapsedSec, { 环境: env, 口径: convention });
        const w = weight === undefined ? 1 : getValue(weight, env);
        return { skeleton: progress.stopped || progress.等待 ? {} : sampleSkeleton(a, progress.时, { 环境: env, 口径: convention }), blendMode: '叠加' as const, weight: w };
      }),
      '通用',
    );

  const poseAt = (sec: number, baseEnv?: MolangEnv): SkeletonTable => {
    const ctrlStep = stepAt(sec);
    // 动画里的赋值写进一份拷贝，不改历史
    const env = applyProfile({ ...merge(baseEnv, envAt(sec)), 变量: { ...ctrlStep.变量 } }, convention);
    const nextPose = statePose(ctrlStep.状态, sec - ctrlStep.enteredAt, env);
    const prevStep = ctrlStep.prevState;
    if (!prevStep) return nextPose;
    const oldState = controller.states[prevStep.状态]!;
    const oldWeight = transitionWeight(oldState.transition, sec - prevStep.leftAt);
    if (oldWeight <= 0) return nextPose;
    return lerpPose(statePose(prevStep.状态, sec - prevStep.enteredAt, env), nextPose, 1 - oldWeight, oldState.shortestPath);
  };

  return Object.assign({ 名: controller.名, poseAt }, { stepAt });
};

// ======== GeckoLib 的控制器（代码驱动 + transitionLength） ========
/**
 * RawAnimation 里的一段：播一段动画（循环：once / loop / hold，或播几遍；不写按动画文件自己的 loop），或等几刻（thenWait）。
 * 几遍 n 同 GeckoLib 4 的 thenPlayXTimes：排成 n 段，前 n−1 段 once、最后一段按动画文件自己的 loop，段间照样过渡；n ≤ 0 不播
 */
export type PlayItem = { 名: string; 循环?: LoopMode | number } | { waitTicks: number };
export type GeckoLibSchedule = readonly { 秒: number; clip: string | readonly PlayItem[] | null }[];
export type GeckoLibControllerSettings = {
  名: string;
  /** AnimationController 的 transitionTickTime（刻，1 刻 = 1/20 秒） */
  transitionTicks: number;
  /** handler 在这些时刻返回新的 RawAnimation（秒升序）。null = PlayState.STOP。和当前一样的不重播（GeckoLib 比 RawAnimation 相等） */
  schedule: GeckoLibSchedule;
  /** animationSpeed，默认 1；过渡和播放都按它快慢 */
  速度?: number;
  animations: Readonly<Record<string, BedrockAnimation>>;
  口径?: Convention;
  环境?: MolangEnv | ((sec: number) => MolangEnv);
};

type ControllerStage =
  | { 种: '过渡'; 起: number; 止: number; 长: number; 名: string }
  | { 种: '播放'; 起: number; 止: number; 名: string; 循环: LoopMode }
  | { 种: '空'; 起: number; 止: number };

const toPlayList = (clip: string | readonly PlayItem[]): readonly PlayItem[] => (typeof clip === 'string' ? [{ 名: clip }] : clip);
/** 几遍 展开成一段段（RawAnimation.thenPlayXTimes 原文：前 n−1 段 PLAY_ONCE，最后一段 DEFAULT） */
const expandItems = (items: readonly PlayItem[]): ({ 名: string; 循环?: LoopMode } | { waitTicks: number })[] =>
  items.flatMap((item) => {
    if ('waitTicks' in item || typeof item.循环 !== 'number') return [item as { 名: string; 循环?: LoopMode } | { waitTicks: number }];
    const n = Math.trunc(item.循环);
    return Array.from({ length: Math.max(0, n) }, (_, k) => (k < n - 1 ? { 名: item.名, 循环: 'once' as const } : { 名: item.名 }));
  });

/**
 * GeckoLib 4 的控制器（照 geckolib-forge-1.20.1-4.8.4 的 AnimationController.process、AnimationProcessor.tickAnimation 原文，MIT）：
 * - handler 换了动画：进入过渡，过渡刻 内从「切换那一刻的姿势」线性插到新动画第 0 刻的姿势，只插新动画有关键帧的骨骼和通道；
 *   过渡完从 0 开播。过渡刻 是 0 就直接开播。开头第一段也从原位过渡（GeckoLib 也是）。
 * - 播完一遍（once）的：队列里还有就过渡到下一段，没有就停；停了、等刻、STOP 时这个控制器不给骨骼（GeckoLib 里骨骼回原位）。
 * - 等刻（thenWait）在 GeckoLib 里是一段没有骨骼的动画，前面也要过渡，所以空 过渡刻 + 等刻。
 * - hold 停在末帧。
 * 简化：切换那一刻的姿势取本控制器自己给的值（GeckoLib 取的是骨骼当时的总值，含别的控制器）；没给过的按原位。
 * 不支持 overrideEasingType、triggerableAnim、声音粒子关键帧
 */
export const geckoLibController = (settings: GeckoLibControllerSettings): ControllerPlayer & { phases: readonly ControllerStage[] } => {
  const convention = settings.口径 ?? defaultProfile;
  const speed = settings.速度 ?? 1;
  if (!(speed > 0)) throw new Error(`控制器 ${settings.名}：速度要 > 0`);
  const transitionSec = settings.transitionTicks / 20 / speed;
  const getAnim = (animName: string): BedrockAnimation => {
    const a = settings.animations[animName];
    if (!a) throw new Error(`控制器 ${settings.名}：找不到动画 ${animName}`);
    return a;
  };
  const envAt = (sec: number): MolangEnv => (typeof settings.环境 === 'function' ? settings.环境(sec) : (settings.环境 ?? {}));

  // 按时刻表排出各阶段（[起, 止)）
  const phases: ControllerStage[] = [];
  // 和前一条一样的 RawAnimation 不算换（GeckoLib 不重播），先去掉
  const stateKey = (clip: string | readonly PlayItem[] | null) => JSON.stringify(clip === null ? null : toPlayList(clip));
  const schedule = [...settings.schedule]
    .sort((a, b) => a.秒 - b.秒)
    .filter((x, i, items) => i === 0 || stateKey(x.clip) !== stateKey(items[i - 1]!.clip));
  for (let i = 0; i < schedule.length; i++) {
    const { 秒: T, clip } = schedule[i]!;
    const slotEndSec = schedule[i + 1]?.秒 ?? Infinity;
    if (clip === null) {
      phases.push({ 种: '空', 起: T, 止: slotEndSec });
      continue;
    }
    let t = T;
    for (const item of expandItems(toPlayList(clip))) {
      if (t >= slotEndSec) break;
      if ('waitTicks' in item) {
        const endSec = Math.min(slotEndSec, t + transitionSec + item.waitTicks / 20 / speed);
        phases.push({ 种: '空', 起: t, 止: endSec });
        t = endSec;
        continue;
      }
      const a = getAnim(item.名);
      if (transitionSec > 0) {
        const endSec = Math.min(slotEndSec, t + transitionSec);
        phases.push({ 种: '过渡', 起: t, 止: endSec, 长: transitionSec, 名: item.名 });
        t = endSec;
        if (t >= slotEndSec) break;
      }
      const loopMode = item.循环 ?? a.循环;
      const animLengthSec = animLength(a, convention) / speed;
      const duration = loopMode === 'loop' || loopMode === 'hold' ? Infinity : animLengthSec;
      const endSec = Math.min(slotEndSec, t + duration);
      phases.push({ 种: '播放', 起: t, 止: endSec, 名: item.名, 循环: loopMode });
      t = endSec;
    }
    if (t < slotEndSec) phases.push({ 种: '空', 起: t, 止: slotEndSec });
  }

  const phaseAt = (sec: number): number => {
    let lo = 0;
    let hi = phases.length - 1;
    if (hi < 0 || sec < phases[0]!.起) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (phases[mid]!.起 <= sec) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const playTime = (a: BedrockAnimation, loopMode: LoopMode, elapsedSec: number): number => {
    const t = elapsedSec * speed;
    const animLengthSec = animLength(a, convention);
    if (loopMode === 'hold') return Math.min(t, animLengthSec);
    return animTime({ ...a, 循环: loopMode }, t, convention).时;
  };

  // 阶段 i 在 秒 时的姿势；过渡要用前一阶段在过渡开始那一刻的姿势（递归，深度 = 连着被打断的过渡数）
  const phasePose = (i: number, sec: number, baseEnv: MolangEnv | undefined): SkeletonTable => {
    const p = phases[i];
    if (!p || p.种 === '空') return {};
    const e = merge(baseEnv, envAt(sec));
    const env = applyProfile({ ...e, 变量: { ...(e.变量 ?? {}) } }, convention);
    if (p.种 === '播放') return sampleSkeleton(getAnim(p.名), playTime(getAnim(p.名), p.循环, Math.min(sec, p.止) - p.起), { 环境: env, 口径: convention });
    const targetAllBones = sampleSkeleton(getAnim(p.名), 0, { 环境: { ...env, query: { ...env.query, anim_time: 0 } }, 口径: convention });
    const prevPhasePose = phasePose(i - 1, p.起, baseEnv);
    // 只插新动画有关键帧的骨骼、通道；起点缺的按原位
    const targetPose: SkeletonTable = {};
    const startPose: SkeletonTable = {};
    for (const [boneName, pose] of Object.entries(targetAllBones)) {
      targetPose[boneName] = pose;
      const s = prevPhasePose[boneName] ?? {};
      startPose[boneName] = {
        rot: pose.rot ? (s.rot ?? [0, 0, 0]) : undefined,
        pos: pose.pos ? (s.pos ?? [0, 0, 0]) : undefined,
        scale: pose.scale !== undefined ? (s.scale ?? 1) : undefined,
      };
    }
    const u = Math.min(1, Math.max(0, (sec - p.起) / p.长));
    const blended = lerpPose(startPose, targetPose, u);
    for (const pose of Object.values(blended)) for (const k of ['rot', 'pos', 'scale'] as const) if (pose[k] === undefined) delete pose[k];
    return blended;
  };

  return Object.assign(
    { 名: settings.名, poseAt: (sec: number, baseEnv?: MolangEnv) => phasePose(phaseAt(sec), sec, baseEnv) },
    { phases: phases as readonly ControllerStage[] },
  );
};
