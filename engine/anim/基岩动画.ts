// 基岩动画文件（.animation.json，format 1.8.0，Blockbench、GeckoLib、YSM、车万女仆用的格式）的读取和播放。纯模块，不 import react、three。
// 解析：值是数或 Molang；能在解析时算掉的算成数（烘焙），剩下的编译好，播放时按环境求值。
// 播放分两种口径：
//   'TLM'：照车万女仆 1.5.3 自带的 GeckoLib 3 分支（JsonKeyFrameUtils、BoneKeyFrameProcessor、AnimationProcessor、AnimationController 反汇编），
//          魔法酒狐的手抄版都按这个口径对过（作品/把回忆拼好给你/核对/基岩动画/对照.test.ts）。
//   '通用'：Blockbench / 基岩版 / GeckoLib 4 的写法（step、bezier、缓动名、hold_on_last_frame 停在末帧、blend_weight 权重）。
//          缓动名照 GeckoLib 4.8.4 源码（插值.ts）；catmullrom 的控制点、lerp_mode step、pre/post 按基岩版写法，和 GeckoLib 4 不一样（docs/新生物.md）。
// 输出的骨骼姿势同 engine/model/基岩模型.tsx 的 BonePose（度、像素，数值约定同动画文件），这里不 import 它，免得带上 three。
import { lerp } from '../core/数学.ts';
import { catmullRom, applyEasing, bezier, step, type InterpMode } from './插值.ts';
import { bake, getValue, compile, evaluate, type MolangExpr, type MolangEnv } from './Molang.ts';

export type Convention = 'TLM' | '通用';
/** 不给口径时用 '通用'（各 GeckoLib / Blockbench 文件的写法）；TLM 自带的分支有怪处，要显式写 'TLM' */
export const defaultProfile: Convention = '通用';
/** Molang 按口径的精度：TLM 的 mocha 是 float，'通用' 照 GeckoLib 4 的 mclib 是 double（出处见 Molang.ts 文件头）。环境里写了 数值 就听环境的 */
export const profilePrecision = (convention: Convention): 'float' | 'double' => (convention === 'TLM' ? 'float' : 'double');
export const applyProfile = (env: MolangEnv, convention: Convention): MolangEnv => (env.precision ? env : { ...env, precision: profilePrecision(convention) });
export type LoopMode = 'once' | 'loop' | 'hold';
export type AxisValue = number | MolangExpr;
export type Vec3Value = readonly [AxisValue, AxisValue, AxisValue];
export type AnimKeyframe = {
  /** 秒 */
  时: number;
  前: Vec3Value;
  后: Vec3Value;
  interpolation: InterpMode;
  /** GeckoLib 4 的缓动名和参数（只在 '通用' 口径起作用） */
  easing?: { 名: string; 参数?: number[] };
  /** Blockbench 的 bezier 手柄，相对本关键帧的 [时间, 值]，逐轴 */
  handles?: { leftHandle: readonly [number, number][]; right: readonly [number, number][] };
};
export type Channel = 'rotation' | 'position' | 'scale';
export const channelNames: readonly Channel[] = ['rotation', 'position', 'scale'];
export type SkeletonTrack = Partial<Record<Channel, readonly AnimKeyframe[]>>;
export type BedrockAnimation = {
  名: string;
  循环: LoopMode;
  /** animation_length 原文（秒）；没写是 undefined，长度按口径推（见 动画长度） */
  lengthSec?: number;
  animTimeUpdate?: MolangExpr;
  blendWeight?: AxisValue;
  /** start_delay、loop_delay（秒，基岩版写法，见 动画进度）；TLM、GeckoLib 4 都不读 */
  startDelaySec?: AxisValue;
  loopDelaySec?: AxisValue;
  /** 骨骼按文件里的顺序：Molang 里的赋值按这个顺序执行 */
  skeleton: Readonly<Record<string, SkeletonTrack>>;
  timeline: readonly { 时: number; 句: readonly MolangExpr[] }[];
};

export type SkeletonPose = { rot?: number[]; pos?: number[]; scale?: number | number[] };
export type SkeletonTable = Record<string, SkeletonPose>;

// ---- 解析 ----
type RawValue = number | string | readonly (number | string)[];
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// 向量：≥3 个元素逐轴；1～2 个元素取第一个当三轴同值；数、字符串三轴同值（TLM JsonKeyFrameUtils）
type Precision = MolangEnv['precision'];
const parseVector = (v: unknown, posLabel: string, precision: Precision): Vec3Value => {
  const parseAxisValue = (x: unknown): AxisValue => {
    if (typeof x === 'number' || typeof x === 'string') return bake(x, precision);
    throw new Error(`动画：${posLabel} 的值不是数也不是 Molang：${JSON.stringify(x)}`);
  };
  if (Array.isArray(v)) {
    if (v.length >= 3) return [parseAxisValue(v[0]), parseAxisValue(v[1]), parseAxisValue(v[2])];
    if (v.length >= 1) {
      const a = parseAxisValue(v[0]);
      return [a, a, a];
    }
  }
  if (isObject(v) && 'vector' in v) return parseVector(v.vector, posLabel, precision);
  if (typeof v === 'number' || typeof v === 'string') {
    const a = parseAxisValue(v);
    return [a, a, a];
  }
  throw new Error(`动画：${posLabel} 的向量写法不认识：${JSON.stringify(v)}`);
};

const parseInterpolation = (x: unknown): InterpMode => (x === 'catmullrom' || x === 'step' || x === 'bezier' ? x : 'linear');

const parseKeyframe = (time: number, v: unknown, posLabel: string, precision: Precision): AnimKeyframe => {
  if (!isObject(v)) {
    const value = parseVector(v as RawValue, posLabel, precision);
    return { 时: time, 前: value, 后: value, interpolation: 'linear' };
  }
  // 只有 post 时当成 pre 用（TLM 如此）；pre、post 都没有时是 { vector, easing } 写法
  const preRaw = v.pre ?? v.post ?? v.vector;
  const postRaw = v.post ?? v.pre ?? v.vector;
  const pre = parseVector(preRaw, posLabel, precision);
  const post = postRaw === preRaw ? pre : parseVector(postRaw, posLabel, precision);
  const lerpMode = String(v.lerp_mode ?? v.easing ?? 'linear').toLowerCase();
  const keyframe: AnimKeyframe = { 时: time, 前: pre, 后: post, interpolation: parseInterpolation(lerpMode) };
  if (typeof v.easing === 'string' && parseInterpolation(lerpMode) === 'linear' && v.easing !== 'linear') {
    keyframe.easing = { 名: v.easing, 参数: Array.isArray(v.easingArgs) ? v.easingArgs.map(Number) : undefined };
  }
  const parseHandle = (t: unknown, val: unknown, fallback: number): [number, number][] =>
    [0, 1, 2].map((i) => [Number(Array.isArray(t) ? t[i] : (t ?? fallback)), Number(Array.isArray(val) ? val[i] : (val ?? 0))]);
  if (keyframe.interpolation === 'bezier') {
    keyframe.handles = { leftHandle: parseHandle(v.bezier_left_time, v.bezier_left_value, -0.1), right: parseHandle(v.bezier_right_time, v.bezier_right_value, 0.1) };
  }
  return keyframe;
};

const parseChannel = (v: unknown, posLabel: string, precision: Precision): AnimKeyframe[] => {
  // 数、字符串、数组、{ vector }：常量，一个 0 秒的关键帧
  if (!isObject(v) || ('vector' in v && !Object.keys(v).some((k) => /^[\d.]+$/.test(k)))) return [parseKeyframe(0, v, posLabel, precision)];
  return Object.entries(v)
    .map(([k, kv]) => {
      const time = Number.parseFloat(k);
      if (!Number.isFinite(time)) throw new Error(`动画：${posLabel} 的时间写法不认识：${k}`);
      return parseKeyframe(time, kv, `${posLabel}@${k}`, precision);
    })
    .sort((a, b) => a.时 - b.时);
};

const parseLoop = (x: unknown): LoopMode => (x === true ? 'loop' : x === 'hold_on_last_frame' ? 'hold' : 'once');

/** 解析一个 .animation.json（已经 JSON.parse 过的对象）→ 动画名 → 动画。口径 决定解析时烘掉的常量按 float 还是 double 算（见 口径数值） */
export const parseAnimationFile = (animFile: unknown, convention: Convention = defaultProfile): Record<string, BedrockAnimation> => {
  const precision = profilePrecision(convention);
  if (!isObject(animFile) || !isObject(animFile.animations)) throw new Error('动画：不是基岩动画文件（缺 animations）');
  const anims: Record<string, BedrockAnimation> = {};
  for (const [animName, a] of Object.entries(animFile.animations)) {
    if (!isObject(a)) continue;
    const skeleton: Record<string, SkeletonTrack> = {};
    for (const [boneName, b] of Object.entries(isObject(a.bones) ? a.bones : {})) {
      if (!isObject(b)) continue;
      const boneTrack: SkeletonTrack = {};
      for (const [ch, v] of Object.entries(b)) if ((channelNames as string[]).includes(ch)) boneTrack[ch as Channel] = parseChannel(v, `${animName}/${boneName}/${ch}`, precision);
      skeleton[boneName] = boneTrack;
    }
    const timeline = Object.entries(isObject(a.timeline) ? a.timeline : {})
      .map(([k, v]) => ({ 时: Number.parseFloat(k), 句: (Array.isArray(v) ? v : [v]).map((s) => compile(String(s))) }))
      .sort((x, y) => x.时 - y.时);
    const lengthSec = a.animation_length === undefined ? undefined : Number(a.animation_length);
    anims[animName] = {
      名: animName,
      循环: parseLoop(a.loop),
      lengthSec,
      animTimeUpdate: a.anim_time_update === undefined ? undefined : compile(String(a.anim_time_update)),
      blendWeight: a.blend_weight === undefined ? undefined : bake(a.blend_weight as number | string, precision),
      startDelaySec: a.start_delay === undefined ? undefined : bake(a.start_delay as number | string, precision),
      loopDelaySec: a.loop_delay === undefined ? undefined : bake(a.loop_delay as number | string, precision),
      skeleton,
      timeline,
    };
  }
  return anims;
};

// ---- 时间 ----
/**
 * 动画长度（秒），不定长是 Infinity。
 * TLM：没写 animation_length 时取各通道「倒数第二个关键帧」时间的最大值（GeckoLib 3 calculateLength 取的是最后一段的起点，算是它的怪处），
 * 结果是 0（只有 0 秒的常量帧）就当无限长。'通用'：取最后一个关键帧和时间线的最大时间，0 也当无限长
 */
export const animLength = (anim: BedrockAnimation, convention: Convention = defaultProfile): number => {
  if (anim.lengthSec !== undefined) return anim.lengthSec;
  let animLengthSec = 0;
  for (const boneTrack of Object.values(anim.skeleton)) {
    for (const keyframes of Object.values(boneTrack)) {
      if (!keyframes?.length) continue;
      const keyframe = convention === 'TLM' ? keyframes[keyframes.length - 2] : keyframes[keyframes.length - 1];
      animLengthSec = Math.max(animLengthSec, keyframe?.时 ?? 0);
    }
  }
  if (convention === '通用') for (const { 时: time } of anim.timeline) animLengthSec = Math.max(animLengthSec, time);
  return animLengthSec > 0 ? animLengthSec : Infinity;
};

/**
 * 播放了 秒 秒时的动画时间（q.anim_time）。loop 按长度取余；once 到头就停（停止：骨骼不再由这段动画给，TLM 里会慢慢回到原位）。
 * hold_on_last_frame：TLM 的 GeckoLib 3 分支没有特别处理（isRepeatingAfterEnd 是 false），和 once 一样停；'通用' 停在末帧
 */
export const animTime = (anim: BedrockAnimation, sec: number, convention: Convention = defaultProfile): { 时: number; stopped: boolean } => {
  const t = Math.max(0, sec);
  const animLengthSec = animLength(anim, convention);
  if (!Number.isFinite(animLengthSec)) return { 时: t, stopped: false };
  if (anim.循环 === 'loop') return { 时: animLengthSec > 0 ? t % animLengthSec : 0, stopped: false };
  if (t < animLengthSec) return { 时: t, stopped: false };
  if (anim.循环 === 'hold' && convention === '通用') return { 时: animLengthSec, stopped: false };
  return { 时: animLengthSec, stopped: true };
};

// ---- 取样 ----
const evalVector = (v: Vec3Value, env: MolangEnv): [number, number, number] => [getValue(v[0], env), getValue(v[1], env), getValue(v[2], env)];

/**
 * 一个通道在动画时间 t（秒）的值。
 * TLM：t 在 [K(i−1), K(i)) 内取第 i 段，起点值是 K(i−1) 的 post、终点是 K(i) 的 pre；段内进度 < 1e-5 取起点，> 0.99999 取 K(i) 的 post；
 * 两头有一个是 catmullrom 就按 catmullrom，控制点取 K(i−2) 的 post、K(i+1) 的 pre（下标夹在两端）；第一个关键帧之前取它的 pre，最后一个之后取它的 post
 */
export const sampleChannel = (keyframes: readonly AnimKeyframe[], t: number, env: MolangEnv = {}, convention: Convention = defaultProfile): [number, number, number] => {
  const n = keyframes.length;
  const i = keyframes.findIndex((k) => k.时 > t);
  if (i === 0) {
    const firstKeyframe = keyframes[0]!;
    return evalVector(convention === 'TLM' && t / firstKeyframe.时 > 0.99999 ? firstKeyframe.后 : firstKeyframe.前, env);
  }
  if (i < 0) return evalVector(keyframes[n - 1]!.后, env);
  const a = keyframes[i - 1]!;
  const b = keyframes[i]!;
  const u = (t - a.时) / (b.时 - a.时);
  if (convention === 'TLM') {
    if (u < 1e-5) return evalVector(a.后, env);
    if (u > 0.99999) return evalVector(b.后, env);
  }
  const startVec = evalVector(a.后, env);
  const end = evalVector(b.前, env);
  if (a.interpolation === 'catmullrom' || b.interpolation === 'catmullrom') {
    const leftPoint = evalVector(keyframes[Math.max(0, i - 2)]!.后, env);
    const right = evalVector(keyframes[Math.min(n - 1, i + 1)]!.前, env);
    return [0, 1, 2].map((j) => catmullRom(u, leftPoint[j]!, startVec[j]!, end[j]!, right[j]!)) as [number, number, number];
  }
  if (convention === '通用') {
    if (a.interpolation === 'step') return startVec.map((x, j) => lerp(x, end[j]!, step(u))) as [number, number, number];
    if (a.interpolation === 'bezier' || b.interpolation === 'bezier') {
      return [0, 1, 2].map((j) =>
        bezier(
          t,
          { t: a.时, v: startVec[j]!, rightHandle: a.handles?.right[j] ?? [0.1, 0] },
          { t: b.时, v: end[j]!, leftHandle: b.handles?.leftHandle[j] ?? [-0.1, 0] },
        ),
      ) as [number, number, number];
    }
    const e = applyEasing(b.easing?.名, u, b.easing?.参数);
    return startVec.map((x, j) => lerp(x, end[j]!, e)) as [number, number, number];
  }
  return startVec.map((x, j) => lerp(x, end[j]!, u)) as [number, number, number];
};

export type PlayOptions = {
  /** Molang 环境；q.anim_time 由播放器填，其他查询、变量表、外部名字由调用方给 */
  环境?: MolangEnv;
  口径?: Convention;
};

const withAnimTime = (env: MolangEnv, time: number): MolangEnv => ({ ...env, query: { ...env.query, anim_time: time } });

/** 动画时间 时（秒，已经按循环折算过）的全部骨骼。骨骼、通道按文件顺序求值（Molang 赋值有先后） */
export const sampleSkeleton = (anim: BedrockAnimation, time: number, options: PlayOptions = {}): SkeletonTable => {
  const convention = options.口径 ?? defaultProfile;
  const env = withAnimTime(applyProfile(options.环境 ?? {}, convention), time);
  const poses: SkeletonTable = {};
  for (const [boneName, boneTrack] of Object.entries(anim.skeleton)) {
    const pose: SkeletonPose = {};
    for (const [ch, keyframes] of Object.entries(boneTrack) as [Channel, readonly AnimKeyframe[]][]) {
      if (!keyframes.length) continue;
      const v = sampleChannel(keyframes, time, env, convention);
      if (ch === 'rotation') pose.rot = v;
      else if (ch === 'position') pose.pos = v;
      else pose.scale = v;
    }
    poses[boneName] = pose;
  }
  return poses;
};

const MAX_LOOP_ITER = 100000;

/**
 * 带 start_delay、loop_delay 的 动画时间（'通用' 口径；TLM 不读这两个，同 动画时间）。
 * 基岩版文档：start_delay 开播前求一次；loop_delay 每遍播完求一次、只对循环动画。
 * 等开播时 等待 是 true（这段动画不给骨骼）；两遍之间的 loop_delay 里停在末帧（anim_time = 长度）。
 * 这两处「等的时候给什么姿势」是推断的，没在游戏里核过（docs/新生物.md）。求值时 q.anim_time 是 0（开播前）或长度（每遍末）
 */
export const animProgress = (anim: BedrockAnimation, sec: number, options: PlayOptions = {}): { 时: number; stopped: boolean; 等待: boolean } => {
  const convention = options.口径 ?? defaultProfile;
  if (convention === 'TLM' || (anim.startDelaySec === undefined && anim.loopDelaySec === undefined)) return { ...animTime(anim, sec, convention), 等待: false };
  const env = applyProfile(options.环境 ?? {}, convention);
  const startSec = anim.startDelaySec === undefined ? 0 : getValue(anim.startDelaySec, withAnimTime(env, 0));
  if (sec < startSec) return { 时: 0, stopped: false, 等待: true };
  const t = sec - startSec;
  const animLengthSec = animLength(anim, convention);
  const loopDelaySec = anim.loopDelaySec;
  if (anim.循环 !== 'loop' || loopDelaySec === undefined || !Number.isFinite(animLengthSec)) return { ...animTime(anim, t, convention), 等待: false };
  if (typeof loopDelaySec === 'number') {
    const totalSec = animLengthSec + Math.max(0, loopDelaySec);
    if (!(totalSec > 0)) return { 时: 0, stopped: false, 等待: false };
    return { 时: Math.min(t % totalSec, animLengthSec), stopped: false, 等待: false };
  }
  let startTime = 0;
  for (let i = 0; i < MAX_LOOP_ITER; i++) {
    if (t < startTime + animLengthSec) return { 时: t - startTime, stopped: false, 等待: false };
    const d = Math.max(0, getValue(loopDelaySec, withAnimTime(env, animLengthSec)));
    if (t < startTime + animLengthSec + d || animLengthSec + d <= 0) return { 时: animLengthSec, stopped: false, 等待: false };
    startTime += animLengthSec + d;
  }
  throw new Error(`动画「${anim.名}」：loop_delay 推了 ${MAX_LOOP_ITER} 遍还没到 ${sec} 秒`);
};

/** 播放了 秒 秒时的骨骼（不带 anim_time_update、时间线；要这两样用 推进）。停了、还在 start_delay 里就是空表 */
export const sampleAnim = (anim: BedrockAnimation, sec: number, options: PlayOptions = {}): { skeleton: SkeletonTable; 时: number; stopped: boolean } => {
  const { 时: time, stopped, 等待: waiting } = animProgress(anim, sec, options);
  return { skeleton: stopped || waiting ? {} : sampleSkeleton(anim, time, options), 时: time, stopped };
};

// ---- 逐步推进（anim_time_update、时间线） ----
export type PlayState = { readonly 时: number; readonly stopped: boolean; readonly started: boolean };
export const initialPlayState: PlayState = { 时: 0, stopped: false, started: false };

const runTimeline = (anim: BedrockAnimation, fromTime: number, endTime: number, includeStart: boolean, env: MolangEnv) => {
  for (const { 时: time, 句: expressions } of anim.timeline) if ((includeStart ? time >= fromTime : time > fromTime) && time <= endTime) for (const s of expressions) evaluate(s, env);
};

/**
 * 推进一步 dt 秒，返回新状态（不改旧的）；环境的变量表会被时间线和 anim_time_update 里的赋值改写。
 * 动画时间：有 anim_time_update 就按它算（q.anim_time 是旧值、q.delta_time 是 dt），否则加 dt。越过的时间线关键点按顺序执行，循环绕回时从 0 再来
 */
export const advance = (anim: BedrockAnimation, playState: PlayState, dt: number, options: PlayOptions = {}): PlayState => {
  if (playState.stopped) return playState;
  const convention = options.口径 ?? defaultProfile;
  const baseCaliber = applyProfile(options.环境 ?? {}, convention);
  const animLengthSec = animLength(anim, convention);
  if (!playState.started) runTimeline(anim, 0, 0, true, withAnimTime(baseCaliber, 0));
  const prevTime = playState.时;
  const env = { ...baseCaliber, query: { ...baseCaliber.query, anim_time: prevTime, delta_time: dt } };
  let nextTime = anim.animTimeUpdate ? evaluate(anim.animTimeUpdate, env) : prevTime + dt;
  runTimeline(anim, prevTime, Math.min(nextTime, animLengthSec), false, withAnimTime(baseCaliber, nextTime));
  if (nextTime < animLengthSec) return { 时: nextTime, stopped: false, started: true };
  if (anim.循环 === 'loop') {
    nextTime = animLengthSec > 0 ? nextTime % animLengthSec : 0;
    runTimeline(anim, 0, nextTime, true, withAnimTime(baseCaliber, nextTime));
    return { 时: nextTime, stopped: false, started: true };
  }
  if (anim.循环 === 'hold' && convention === '通用') return { 时: animLengthSec, stopped: false, started: true };
  return { 时: animLengthSec, stopped: true, started: true };
};

/** 从头按固定步长推进到 秒 秒（最后一步补齐零头），返回状态。时间线驱动的变量（弹簧之类）要这样一步步算 */
export const playTo = (anim: BedrockAnimation, sec: number, stepSec: number, options: PlayOptions = {}): PlayState => {
  let playState = initialPlayState;
  let playedSec = 0;
  while (playedSec < sec - 1e-12 && !playState.stopped) {
    const dt = Math.min(stepSec, sec - playedSec);
    playState = advance(anim, playState, dt, options);
    playedSec += dt;
  }
  return playState;
};

// ---- 多层混合（GeckoLib 的多个动画控制器） ----
export type BlendMode = '覆盖' | '叠加';
export type AnimationLayer = { skeleton: SkeletonTable; blendMode?: BlendMode; weight?: number };

/** TLM 里控制器名以 parallel_ 开头的转角是叠加的，别的覆盖（AnimationProcessor 反汇编） */
export const tlmControllerMode = (controllerName: string): BlendMode => (controllerName.startsWith('parallel_') ? '叠加' : '覆盖');

/** 动画的 blend_weight 在环境里的值，没写是 1。TLM 不读它 */
export const animWeight = (anim: BedrockAnimation, env: MolangEnv = {}): number => (anim.blendWeight === undefined ? 1 : getValue(anim.blendWeight, env));

const toVec3 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);

/**
 * 按控制器顺序把几层骨骼合成一张表（先给的在下面）。
 * TLM：转角在所有层上累加，叠加层取累加和、覆盖层只取自己这层的值；位置、缩放一律后来的盖前面；权重不读。
 * '通用'：覆盖层按权重从下面的值（没有就是原位：转角、位置 0，缩放 1）插到自己的值；叠加层转角、位置加 权重×值，缩放乘 lerp(1, 值, 权重)
 */
export const blendLayers = (layers: readonly AnimationLayer[], convention: Convention = defaultProfile): SkeletonTable => {
  const poses: SkeletonTable = {};
  const cumulativeRot: Record<string, number[]> = {};
  for (const layer of layers) {
    const blendMode = layer.blendMode ?? '覆盖';
    const w = layer.weight ?? 1;
    for (const [boneName, pose] of Object.entries(layer.skeleton)) {
      const prev = poses[boneName] ?? {};
      const mixed: SkeletonPose = { ...prev };
      if (convention === 'TLM') {
        if (pose.rot) {
          const sum = (cumulativeRot[boneName] = (cumulativeRot[boneName] ?? [0, 0, 0]).map((x, j) => x + pose.rot![j]!));
          mixed.rot = blendMode === '叠加' ? sum : pose.rot;
        }
        if (pose.pos) mixed.pos = pose.pos;
        if (pose.scale !== undefined) mixed.scale = pose.scale;
      } else {
        const mixValue = (base: number[] | undefined, value: number[], restValue: number, multiply: boolean) => {
          const d = base ?? [restValue, restValue, restValue];
          if (blendMode === '覆盖') return d.map((x, j) => lerp(x, value[j]!, w));
          return d.map((x, j) => (multiply ? x * lerp(1, value[j]!, w) : x + w * value[j]!));
        };
        if (pose.rot) mixed.rot = mixValue(prev.rot, pose.rot, 0, false);
        if (pose.pos) mixed.pos = mixValue(prev.pos, pose.pos, 0, false);
        if (pose.scale !== undefined) mixed.scale = mixValue(prev.scale === undefined ? undefined : toVec3(prev.scale), toVec3(pose.scale), 1, true);
      }
      poses[boneName] = mixed;
    }
  }
  return poses;
};
