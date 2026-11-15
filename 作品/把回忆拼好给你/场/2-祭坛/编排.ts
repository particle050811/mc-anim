// 第 3 句祭坛召唤每一帧的状态：柱顶材料、化成的光、她、你、光、两个镜头（远景贴地升起俯看祭坛，「光」那一拍切近景）。纯模块（测试也引），画法在 祭坛.tsx。
// 钟是歌曲帧 g（段内帧 + 段起帧，核对段直接给歌曲帧），时刻取 分镜 的正片事件，分寸取 参数.ts，最后一帧取 末态.ts。游戏里的刻 = 歌上的秒 × 20。
import { clamp01 } from '@engine/anim/anim.ts';
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第3句.ts';
import * as params from './参数.ts';
import { liYingFinal, endRig, finalSpeed, eyeBall } from './末态.ts';

type Vec3 = [number, number, number];

export const segKey = '2-祭坛召唤';
/** 这一段在歌上的窗口：[起帧, 止帧) */
export const segWindow = segmentWindow(segKey);
/** 各事件的歌曲帧 */
export const events = {
  tapAltar: mainCutEvents.activateAltar.帧,
  appear: mainCutEvents.liYingAppears.帧,
  handOffFrame: mainCutEvents.offerCake.帧,
  photo: mainCutEvents.photoAltarCake.帧,
  pushInEye: mainCutEvents.pushToEye.帧,
  /** 切近景：「光」那一拍（光柱跨过这一刀接着亮） */
  cutFrame: mainCutEvents.altarCloseUp.帧,
} as const;
/** 最后一帧（接第 4 句眼睛特写的那一帧） */
export const lastFrame = segWindow.止帧 - 1;

/** 歌曲帧 → 歌上的秒、游戏刻 */
export const toSec = (g: number) => g / fps;
export const frameToTick = (g: number) => (g / fps) * 20;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec3 = (a: readonly number[], b: readonly number[], t: number): Vec3 => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];
const smoothstep = (t: number) => t * t * (3 - 2 * t);

// ---------- 柱顶材料 ----------
/** 一样材料这一帧：物 = 浮在柱顶（中心位置、绕竖轴转角 度）；亮 = 刚合成那一下整个变白；光 = 化成的光点在往圈心飞（拖着两颗更小的） */
export type FloatState =
  | { 名: string; kind: '物' | '亮'; p: Vec3; 转: number }
  | { 名: string; kind: '光'; p: Vec3; trail: Vec3[] };

/** 柱顶物品中心（显示变换之前的那一点）和转角：TileEntityAltarRenderer 的 毫秒 = (现在 + 方块坐标) mod 3600 */
export const pillarTopPos = (m: (typeof params.pillarTopMaterials)[number], g: number): { p: Vec3; 转: number } => {
  const periodMs = params.floatItem.periodSec * 1000;
  const cycleMs = (((toSec(g) * 1000 + m.phaseFrac * periodMs) % periodMs) + periodMs) % periodMs;
  const z = params.pillarTopHeight + params.floatItem.高 + params.floatItem.floatAmp * Math.sin((cycleMs / (periodMs / 2)) * Math.PI);
  return { p: [m.pillarPos[0], m.pillarPos[1], z], 转: cycleMs / 10 };
};

/** 化成光以后飞几秒：从变白完到她现身那一帧汇齐 */
export const flySec = (events.appear - events.tapAltar) / fps - params.lightMelt.brightSec;

/** 化光以后光点的位置：t 0～1，从柱顶飞到 汇点，先慢后快（缓起），中间往上拱一点 */
const lightDotPos = (startPos: Vec3, t: number): Vec3 => {
  const k = smoothstep(clamp01(t));
  const p = lerpVec3(startPos, params.lightMelt.convergePoint, k);
  p[2] += 0.4 * Math.sin(Math.PI * clamp01(t));
  return p;
};

export const floatStates = (g: number): FloatState[] =>
  params.pillarTopMaterials.flatMap((m): FloatState[] => {
    const { p, 转: rotationDeg } = pillarTopPos(m, g);
    const k = (g - events.tapAltar) / fps;
    if (k < 0) return [{ 名: m.名, kind: '物', p, 转: rotationDeg }];
    if (k < params.lightMelt.brightSec) return [{ 名: m.名, kind: '亮', p, 转: rotationDeg }];
    // 变白完那一刻已经飞了一帧
    const t = (k - params.lightMelt.brightSec + oneFrameSec) / flySec;
    if (t >= 1) return [];
    return [{ 名: m.名, kind: '光', p: lightDotPos(p, t), trail: [lightDotPos(p, t - 0.1), lightDotPos(p, t - 0.2)] }];
  });

// ---------- 她 ----------
/** 转：0 = 看着你，1 = 正对镜头（末她 的 看）；笑：驯服以后 */
export type CharArrange = { 转: number; expression: '无' | '微笑' };
/** 转头的起点（歌上的秒）：推眼睛那一拍以后再等 参数.ts 的 转头迟秒 */
export const turnHeadStartSec = toSec(events.pushInEye) + params.turnHeadDelaySec;
export const CharArrange = (g: number): CharArrange | null => {
  if (g < events.appear) return null;
  return {
    转: smoothstep(clamp01((toSec(g) - turnHeadStartSec) / params.turnHeadSec)),
    expression: (g - events.handOffFrame) / fps >= params.smileStartSec ? liYingFinal.expression : '无',
  };
};

// ---------- 你 ----------
/** 每一下右键（点祭坛、递蛋糕）都挥一次手。
 *  点祭坛是演绎（三稿「御币一点祭坛」）：TLM 1.5.3 的祭坛不认右键触发，放上最后一样材料那一下当刻自动合成；御币是拿来右键红羊毛搭祭坛的 */
export const clickFrames = [events.tapAltar, events.handOffFrame] as const;
/** 原版 attackTime（0～1）：最近一次点击以后过了几刻 / 6；没在挥 = null */
export const waveProgress = (g: number): number | null => {
  const nearestClick = [...clickFrames].reverse().find((c) => c <= g);
  if (nearestClick === undefined) return null;
  const t = (frameToTick(g) - frameToTick(nearestClick)) / params.waveTicks;
  return t < 1 ? t : null;
};
export const cakeGoneFrame = events.handOffFrame + Math.round(params.holdCakeSec * fps);
export type HandItem = '御币' | '蛋糕' | null;
/** 远景里拿御币，切到近景时已经换成蛋糕（换东西在那一刀里，近景里不再单独换一次：核查 10-24 说近景一拍一件跟不上） */
export const HandItem = (g: number): HandItem => (g < events.cutFrame ? '御币' : g < cakeGoneFrame ? '蛋糕' : null);
/** 你一直看着圈心（她的脸）这一点 */
export const youLook = [0, 0, 1.15] as Vec3;
/** 你的身子朝向（度，0 朝北、正 = 往左）：对着圈心 */
export const youFacing = (Math.atan2(-(params.liYing.feet[0] - params.you.feet[0]), params.liYing.feet[1] - params.you.feet[1]) * 180) / Math.PI;
/** 你的眼睛（原版 1.62） */
export const youEyePos: Vec3 = [params.you.feet[0], params.you.feet[1], params.you.feet[2] + 1.62];

// ---------- 光 ----------
/** 祭坛亮：这一帧亮着的几圈 [半径, 强度]：点祭坛起三圈全亮，她现身以后 退秒 里一档一档灭（最外圈先灭） */
export const altarLight = (g: number): [number, number][] => {
  const { radiusList, 强: altarStrengths, fadeSec } = params.lightParams.altarLight;
  if (g < events.tapAltar) return [];
  const fadeTime = (g - events.appear) / fps;
  const offCount = fadeTime < 0 ? 0 : Math.floor((fadeTime / fadeSec) * radiusList.length) + 1;
  return radiusList.map((r, i): [number, number] => [r, altarStrengths[i]!]).slice(Math.min(radiusList.length, offCount));
};
/** 光柱：这一帧的几层 [宽, 强度]（她现身前 起前秒 亮起，现身起留 留秒，再 退秒 里从外往里一层一层灭） */
export const lightPillar = (g: number): [number, number][] => {
  const { 宽: beamWidths, 强: beamStrengths, startBeforeSec, holdSec, fadeSec } = params.lightParams.lightPillar;
  const k = (g - events.appear) / fps;
  if (k < -startBeforeSec) return [];
  const fadeTime = k - holdSec;
  const offCount = fadeTime < 0 ? 0 : Math.floor((fadeTime / fadeSec) * beamWidths.length) + 1;
  return beamWidths.map((w, i): [number, number] => [w, beamStrengths[i]!]).slice(0, Math.max(0, beamWidths.length - offCount));
};

// ---------- 镜头 ----------
export type CameraRig = { 眼: Vec3; 看: Vec3; fov: number };

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const vecLength = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const unitVec = (a: readonly number[]): Vec3 => {
  const l = vecLength(a) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** 一个关键机位：歌曲帧、眼、看点、竖直视角 */
export type CameraKeyframe = { 帧: number; 眼: Vec3; 看: Vec3; fov: number };
/** 近景的关键机位：光（切进来那一帧）、递蛋糕、推眼睛、末帧（末态.ts 的 末机） */
export const keyRigs = (): CameraKeyframe[] => {
  const { near } = params.shot;
  return [
    { 帧: events.cutFrame, ...near.光 },
    { 帧: events.handOffFrame, ...near.handOff },
    { 帧: events.pushInEye, ...near.pushIn },
    { 帧: lastFrame, 眼: endRig.眼, 看: endRig.看, fov: endRig.fov },
  ];
};

/** 三次埃尔米特：p0、p1 两头的值，m0、m1 两头每秒的变化率，h 这一段几秒，s 0～1 */
const hermite = (p0: number, p1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
};
/** 各关键点的变化率（每秒）：头一个 = 起率（不给 = 第一段的平均速度的一半，接切过来就在慢慢动），末帧 = 给定的（不给就停稳），中间按两边的平均速度。
 *  保单调 = true 时中间取两边的加权调和平均（Fritsch–Carlson），两边同号时插出来不会冲过头 */
const slopeRates = (t: readonly number[], y: readonly number[], keepMonotone: boolean, endRate = 0, startRate?: number): number[] => {
  const n = t.length;
  const h = t.slice(1).map((v, i) => v - t[i]!);
  const d = h.map((hi, i) => (y[i + 1]! - y[i]!) / hi);
  return t.map((_, k) => {
    if (k === 0) return startRate ?? d[0]! / 2;
    if (k === n - 1) return endRate;
    const [a, b, ha, hb] = [d[k - 1]!, d[k]!, h[k - 1]!, h[k]!];
    if (!keepMonotone) return (hb * a + ha * b) / (ha + hb);
    if (a * b <= 0) return 0;
    const w1 = 2 * hb + ha;
    const w2 = hb + 2 * ha;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
};

/** 按近景的关键机位插这一帧的镜头。眼睛：以她右眼眼珠为心，离心距离取对数用保单调的三次插值，方向用三次插值再归一；
 *  看点用三次插值；视角保单调插。各关键机位两边速度连续，不会一帧里突然起速。
 *  末率：离心距离的对数在最后一个关键机位上每秒变多少（第 4 句接着这个速度推）；方向、看点、视角在最后一个关键机位停稳 */
const interpShot = (keys: readonly CameraKeyframe[], g: number, endRate: number): CameraRig => {
  const aimCenter = eyeBall.rightEye;
  const t = keys.map((k) => toSec(k.帧));
  const distances = keys.map((k) => Math.log(vecLength(sub(k.眼, aimCenter))));
  const keyDirs = keys.map((k) => unitVec(sub(k.眼, aimCenter)));
  const x = Math.min(Math.max(toSec(g), t[0]!), t[t.length - 1]!);
  const i = Math.min(t.findIndex((v, j) => j > 0 && x <= v) - 1, t.length - 2);
  const h = t[i + 1]! - t[i]!;
  const s = (x - t[i]!) / h;
  const interpolate = (ys: readonly number[], keepMonotone: boolean, rate: number) => {
    const m = slopeRates(t, ys, keepMonotone, rate);
    return hermite(ys[i]!, ys[i + 1]!, m[i]!, m[i + 1]!, h, s);
  };
  const r = Math.exp(interpolate(distances, true, endRate));
  const u = unitVec([0, 1, 2].map((c) => interpolate(keyDirs.map((v) => v[c]!), false, 0)));
  return {
    眼: [aimCenter[0] + u[0] * r, aimCenter[1] + u[1] * r, aimCenter[2] + u[2] * r],
    看: [0, 1, 2].map((c) => interpolate(keys.map((k) => k.看[c]!), false, 0)) as Vec3,
    fov: interpolate(keys.map((k) => k.fov), true, 0),
  };
};

/** 远景一条轨在歌曲帧 g 的值：保单调三次插值，段首速度 0，最后一个关键帧接着最后一段的平均速度走（切走的时候还在动）。
 *  最后一个关键帧在切前一帧（段的最后一帧；原来在切前 1/24 秒，用户 11-03「统统改成 60 帧」） */
const farTrackValue = (track: params.FarTrack, g: number): number => {
  const t = track.map(([s]) => (s === '切' ? toSec(events.cutFrame) - oneFrameSec : toSec(segWindow.起帧) + s));
  const y = track.map(([, v]) => v);
  if (t.length === 1) return y[0]!;
  const n = t.length - 1;
  const endRate = (y[n]! - y[n - 1]!) / (t[n]! - t[n - 1]!);
  const x = Math.max(toSec(g), t[0]!);
  if (x > t[n]!) return y[n]! + endRate * (x - t[n]!);
  const i = Math.min(t.findIndex((v, j) => j > 0 && x <= v) - 1, n - 1);
  const h = t[i + 1]! - t[i]!;
  const m = slopeRates(t, y, true, endRate, 0);
  return hermite(y[i]!, y[i + 1]!, m[i]!, m[i + 1]!, h, (x - t[i]!) / h);
};

const radPerDeg = Math.PI / 180;
/** 远景这一帧：贴着地面看着祭坛慢慢升高、往下俯，再慢慢往前飘（参数.ts 镜头.远） */
export const farShot = (g: number): CameraRig => {
  const far = params.shot.far;
  const eye: Vec3 = [far.x, farTrackValue(far.y, g), farTrackValue(far.z, g)];
  const pitch = farTrackValue(far.pitch, g) * radPerDeg;
  const yawOffset = farTrackValue(far.yawOffsetTrack, g) * radPerDeg;
  return { 眼: eye, 看: [eye[0] + Math.sin(yawOffset) * Math.cos(pitch), eye[1] + Math.cos(yawOffset) * Math.cos(pitch), eye[2] + Math.sin(pitch)], fov: farTrackValue(far.fov, g) };
};

/** 这一帧的镜头：「光」那一拍硬切，前面是远景（贴地升起、站在祭坛外头慢慢往前飘），后面是近景（在柱子圈里，她、你，一路推到她的右眼，
 *  末帧落在 末机、推的速度是 末速；方向、看点、视角在末帧停稳，第 4 句只接着推距离） */
export const shotAt = (g: number): CameraRig => (g < events.cutFrame ? farShot(g) : interpShot(keyRigs(), g, finalSpeed));
