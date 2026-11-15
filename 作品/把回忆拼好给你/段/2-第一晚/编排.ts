// 2-第一晚 每一帧的状态：镜头、天上几刻、调子、你在哪什么姿势、坑挖到哪、裂纹、掉落物、洞顶上走过的僵尸、洞里多暗。
// 纯模块（画面和测试都引）：时刻取 分镜 的正片事件，分寸取 场/2-第一晚/参数.ts。原版的东西按刻走（20 刻一秒），段内帧 × 20/fps。
// 镜头、快进前的天（边挖边天黑）、撤排照 场/2-新世界/编排.ts（和 2-初入 同一套函数，接缝那一帧对得上）；你、掉落物、裂纹、僵尸的坐标是剖面里的（见 场/2-第一晚/参数.ts）。
import { clamp01 } from '@engine/anim/anim.ts';
import { lerpTone, type Tone as Tone } from '@engine/三渲二/调子.ts';
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { segmentWindow, segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第2句.ts';
import { skyBrightness } from '../../地点/天体.ts';
import { headAngles, zombie, groundLayers, skylightDigSec, fastForward, lookUpSec, digFacing, drop, holeDarkParams, standingVelY, shrinkSec } from '../../场/2-第一晚/参数.ts';
import type { PitState as PitState } from '../../场/2-新世界/地形.ts';
import { fullLightTick, peeledRows, skyLightTo, skyTickAt, cameraRigAt, dawnTick } from '../../场/2-新世界/编排.ts';
import { palette } from '../../色板.ts';

const segKey = '2-第一晚';
export const events = segMainCutEventFrames(segKey);
export const frameCount = segClock(segKey).帧数;
const startFrame = segmentWindow(segKey).起帧;
/** 段内帧 → 歌曲帧（颗粒的种子、新世界的编排用它） */
export const toSongFrame = (f: number) => startFrame + f;
/** 段内帧 → 歌上的秒（两臂轻晃按它走） */
export const songSec = (f: number) => (startFrame + f) / fps;
/** 段内帧 → 段首起的游戏刻（不快进的真时间）。先乘后除：整帧数换整刻数时没有浮点零头（半秒的帧数正好 10 刻） */
export const frameToTick = (f: number) => (f * 20) / fps;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothStep = (t: number) => {
  const q = clamp01(t);
  return q * q * (3 - 2 * q);
};

// ---------- 镜头、剖面 ----------
/** 镜头：2-初入 落定的剖面机位，一镜不动 */
export const shotAt = (f: number) => cameraRigAt(1, toSongFrame(f));
/** 坑和镜头之间撤了几排（2-初入 已经撤完） */
export const stripAt = (f: number) => peeledRows(toSongFrame(f));

// ---------- 快进 ----------
export const fastForwardStart = events.填土 + fastForward.startSec * fps;
/** 天亮满的那一帧（挖开天窗前 亮满前秒）、开始破晓的那一帧（亮满前 黎明秒） */
export const brightFullFrame = events.挖开天窗 - fastForward.fullBrightBeforeSec * fps;
export const dawnStart = brightFullFrame - fastForward.dawnSec * fps;
const realSkyTick = (f: number) => skyTickAt(toSongFrame(f));

/** 天上的刻（天色、星星）：快进前照 场/2-新世界 的（边挖边天黑，填土那一拍黑透）；快进里先缓入缓出翻到破晓（星星绕着正北转过去），
 *  再让天亮程度在 黎明秒 里缓起缓停地升到 1（按天亮缓动，不按刻：天亮只在破晓那 1800 刻里升）；亮满以后照真时间走 */
export const skyTick = (f: number) => {
  if (f <= fastForwardStart) return realSkyTick(f);
  if (f <= dawnStart) return lerp(realSkyTick(fastForwardStart), dawnTick, smoothStep((f - fastForwardStart) / (dawnStart - fastForwardStart)));
  if (f <= brightFullFrame) return skyLightTo(smoothStep((f - dawnStart) / (fastForward.dawnSec * fps)), dawnTick, fullLightTick);
  return fullLightTick + frameToTick(f - brightFullFrame);
};

/** 3D 和后期的调子：夜和夏日白天按原版天亮程度插（同 2-初入 的 世界调子在） */
export const toneAt = (f: number): Tone => lerpTone(palette.夜, palette.夏日白天, skyBrightness(skyTick(f)));

// ---------- 坑、裂纹 ----------
/** 挖掉的三格（草方块、两格泥土），各在哪一帧挖掉 */
export const digTimes = [events.挖一, events.挖二, events.挖三] as const;
export const pitStateAt = (f: number): PitState => ({ dugCount: digTimes.filter((b) => f >= b).length, dirtCovered: f >= events.填土 && f < events.挖开天窗 });

/** 四次方块碎掉（崩粒子、掉东西）：帧、哪一格（格中心，剖面坐标） */
export const shards: readonly { 帧: number; 格: readonly [number, number, number] }[] = [
  ...digTimes.map((startFrame, i) => ({ 帧: startFrame, 格: [0, 0.5, groundLayers.grassLayer - i + 0.5] as const })),
  { 帧: events.挖开天窗, 格: [0, 0.5, groundLayers.grassLayer + 0.5] as const },
];

/** 按住左键挖的几段：[起, 碎, 第几格]（段内帧，可以带小数），裂纹在这段里从 0 长到满。第一格段首就开始挖（接着 2-初入 低头站定），
 *  后两格从上一格碎掉的下一帧接着挖（原来是 1/24 秒后，24 fps 时的下一帧；用户 11-03「统统改成 60 帧」） */
const digSegs: readonly (readonly [number, number, number])[] = [
  [0, events.挖一, 0],
  [events.挖一 + 1, events.挖二, 1],
  [events.挖二 + 1, events.挖三, 2],
];
const skylightDigStart = events.挖开天窗 - skylightDigSec * fps;

/** 裂纹：原版 destroyBlockProgress = (int)(进度 × 10) − 1，−1 不画。进度多算一帧（按帧末算：起的那一帧已经挖了一帧），
 *  碎前最后一帧是满的第 9 级（多算的那截让进度过 1，封顶 9） */
export const crackState = (f: number): { 格: readonly [number, number, number]; 级: number } | null => {
  const crackSeg = [...digSegs, [skylightDigStart, events.挖开天窗, 3] as const].find(([startFrame, breakFrame]) => f >= startFrame && f < breakFrame);
  if (!crackSeg) return null;
  const [startFrame, breakFrame, i] = crackSeg;
  const level = Math.min(9, Math.floor(((f - startFrame + 1) / (breakFrame - startFrame)) * 10) - 1);
  return level < 0 ? null : { 格: shards[i]!.格, 级: level };
};

// ---------- 你 ----------
/** 挖方块按住左键时第 刻 刻的出手进度（刻从按下数起）：原版每刻调一次 swing()，挥过一半（3 刻）才重来，
 *  所以 0 → ½ 走三刻、½ → 1 一刻（getAttackAnim 跨过重来那一刻时按 +1 插值） */
export const digHand = (k: number) => {
  const φ = ((k % 4) + 4) % 4;
  return φ < 3 ? φ / 6 : 0.5 + (φ - 3) * 0.5;
};
/** 右键放方块挥一下：6 刻挥完 */
const placeHand = (k: number) => (k >= 0 && k < 6 ? k / 6 : 0);

/** 原版下落（每刻先挪 vy，再 vy = (vy − 0.08) × 0.98），从 0 掉 高 格，每刻的 z（最后一项落地 = −高） */
export const dropPath = (fallHeight: number, vy0 = standingVelY): number[] => {
  const out = [0];
  let z = 0;
  let vy = vy0;
  while (z > -fallHeight) {
    z = Math.max(-fallHeight, z + vy);
    vy = (vy - 0.08) * 0.98;
    out.push(z);
  }
  return out;
};
const sampleByTick = (trail: readonly number[], k: number) => {
  if (k <= 0) return trail[0]!;
  const i = Math.floor(k);
  if (i >= trail.length - 1) return trail[trail.length - 1]!;
  return lerp(trail[i]!, trail[i + 1]!, k - i);
};
const oneCellPath = dropPath(1);

export type SteveState = {
  x: number;
  z: number;
  yaw: number;
  /** 头的俯仰（度，负 = 低头） */
  头: number;
  swing: number;
  crouching: boolean;
  holdingDirt: boolean;
};

/** 第 i 块掉落物被捡起来的那一帧 */
export const pickupFrame = (i: number) => shards[i]!.帧 + Math.ceil((drop.pickupDelayTick * fps) / 20);

/** 站在坑那一格往脚下挖：每挖掉一格掉一格；填上头顶、缩下去；天亮前站起来挖开头顶 */
export const SteveState = (f: number): SteveState => {
  let z = 0;
  digTimes.forEach((b, i) => {
    if (f >= b) z = -i + sampleByTick(oneCellPath, frameToTick(f - b));
  });
  const liftLength = lookUpSec * fps;
  const placeLiftStart = events.填土 - liftLength;
  const retractFrame = events.填土 + shrinkSec * fps;
  const headAngle =
    f < placeLiftStart ? headAngles.digAngleDeg : f < events.填土 ? lerp(headAngles.digAngleDeg, headAngles.放, (f - placeLiftStart) / liftLength) : f < retractFrame ? headAngles.放 : f < skylightDigStart ? headAngles.retract : headAngles.lookSky;
  let swing = 0;
  if (f < events.挖三) swing = digHand(frameToTick(f));
  else if (f >= skylightDigStart && f < events.挖开天窗) swing = digHand(frameToTick(f - skylightDigStart));
  else if (f >= events.填土) swing = placeHand(frameToTick(f - events.填土));
  return { x: 0, z, yaw: digFacing, 头: headAngle, swing, crouching: f >= retractFrame && f < skylightDigStart, holdingDirt: f >= pickupFrame(0) };
};

// ---------- 掉落物 ----------
/** 定死的伪随机（mulberry32），同一个种子每次一样 */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type ItemPath = { 路: (readonly [number, number, number])[]; phaseOffset: number };
const halfSize = drop.大小 / 2;
/** 第 i 块碎掉时掉的那块泥土：原版 popResource 生成、ItemEntity.tick 的物理；坑是一格宽的竖井，四面贴墙，底随挖的进度往下 */
const itemPaths: ItemPath[] = shards.map(({ 帧: startFrame, 格: cellPos }, i) => {
  const r = rng(2024 + i * 7919);
  const jitter = (a: number) => a - 0.25 + r() * 0.5;
  let [x, y, z] = [jitter(cellPos[0]), jitter(cellPos[1]), jitter(cellPos[2]) - halfSize];
  let [vx, vy, vz] = [r() * 0.2 - 0.1, r() * 0.2 - 0.1, 0.2];
  const phaseOffset = r() * Math.PI * 2;
  const trail: (readonly [number, number, number])[] = [[x, y, z]];
  for (let n = 1; n <= 40; n++) {
    const bottom = groundLayers.grassLayer + 1 - pitStateAt(startFrame + (n * fps) / 20).dugCount;
    vz -= 0.04;
    x += vx;
    y += vy;
    z += vz;
    let landed = false;
    if (z < bottom) {
      z = bottom;
      vz = 0;
      landed = true;
    }
    const clampVel = (v: number, lo: number, hi: number, speed: number): [number, number] => (v < lo ? [lo, 0] : v > hi ? [hi, 0] : [v, speed]);
    [x, vx] = clampVel(x, cellPos[0] - 0.5 + halfSize, cellPos[0] + 0.5 - halfSize, vx);
    [y, vy] = clampVel(y, halfSize, 1 - halfSize, vy);
    const friction = landed ? 0.6 * 0.98 : 0.98;
    vx *= friction;
    vy *= friction;
    vz *= 0.98;
    trail.push([x, y, z]);
  }
  return { 路: trail, phaseOffset };
});

const pointOnPath = (trail: ItemPath['路'], k: number): [number, number, number] => {
  const i = Math.max(0, Math.min(trail.length - 2, Math.floor(k)));
  const t = clamp01(k - i);
  return [lerp(trail[i]![0], trail[i + 1]![0], t), lerp(trail[i]![1], trail[i + 1]![1], t), lerp(trail[i]![2], trail[i + 1]![2], t)];
};

/** 这一帧看得见的掉落物：方块中心（含原版的上下浮）、绕竖轴转角（弧度）。捡起时 3 刻飞到你脚底往上 0.5 格（按平方缓入） */
export const dropItems = (f: number): { 位: readonly [number, number, number]; 转: number }[] => {
  const out: { 位: readonly [number, number, number]; 转: number }[] = [];
  shards.forEach(({ 帧: startFrame }, i) => {
    if (f < startFrame) return;
    const age = frameToTick(f - startFrame);
    const { 路: trail, phaseOffset } = itemPaths[i]!;
    const floatOffset = Math.sin(age / 10 + phaseOffset) * 0.1 + 0.1;
    const rotationRad = age / 20 + phaseOffset;
    const displayHeight = drop.大小; // ground 显示变换：0.25 × 缩放 0.25 + 3/16 = 0.25
    if (age < drop.pickupDelayTick) {
      const p = pointOnPath(trail, age);
      out.push({ 位: [p[0], p[1], p[2] + floatOffset + displayHeight], 转: rotationRad });
      return;
    }
    const flyAge = age - drop.pickupDelayTick;
    if (flyAge >= drop.flightTick) return;
    const p = pointOnPath(trail, drop.pickupDelayTick);
    const you = SteveState(f);
    const target: [number, number, number] = [you.x, 0.5, you.z + 0.5];
    const t = (flyAge / drop.flightTick) ** 2;
    out.push({ 位: [lerp(p[0], target[0], t), lerp(p[1], target[1], t), lerp(p[2], target[2], t) + floatOffset + displayHeight], 转: rotationRad });
  });
  return out;
};

// ---------- 僵尸 ----------
const zombieStopFrame = events.挖开天窗 - zombie.stopBeforeSec * fps;
/** 僵尸走到洞顶正上方（x 0）的那一帧（段.ts 的低吼按它放） */
export const zombiePassHoleFrame = Math.round(lerp(fastForwardStart, zombieStopFrame, -zombie.startX / (zombie.endX - zombie.startX)));
/** 洞顶上走过的僵尸：快进里从左往右匀速走过坑这一排（剖面坐标 x，y 0.5，脚踩地面 z 0）；走路摆腿的秒数（按原版闲逛的 摆倍 倍走）。不在画里时 null */
export const zombieState = (f: number): { x: number; walkSec: number } | null => {
  if (f < fastForwardStart || f > zombieStopFrame) return null;
  return { x: lerp(zombie.startX, zombie.endX, (f - fastForwardStart) / (zombieStopFrame - fastForwardStart)), walkSec: ((f - fastForwardStart) / fps) * zombie.swingScale };
};

// ---------- 洞里的暗 ----------
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
/** 压一层黑的不透明度，让看到的亮度是夜里地面的 (1 − 暗) 倍：外面天亮了洞里不跟着亮 */
const darkenAt = (f: number, darkAmount: number) => clamp01(1 - (luminance(palette.夜.tint) * (1 - darkAmount)) / luminance(toneAt(f).tint));
/** 洞里那两格（第 0 格在上：z −2～−1；第 1 格在下：z −3～−2）各还剩几成暗：封顶那段全暗；挖开天窗后天光从上往下一格一格照下去，一格 光下秒 */
const remainingDark = (f: number, cellIndex: number) => {
  if (f < events.填土) return 0;
  if (f < events.挖开天窗) return 1;
  const stepFrames = holeDarkParams.lightDownSec * fps;
  return 1 - clamp01((f - events.挖开天窗 - cellIndex * stepFrames) / stepFrames);
};
/** 洞里两格各两层黑：前 = 盖在洞口剖面上（你也在它后面），后 = 只盖后墙（在你后面）；叠起来后墙是 洞里暗.墙、你是 洞里暗.人。
 *  天光照下来时按挖开前一帧的暗往 0 退（挖开以后外面已经亮满，暗不再跟着调子变） */
export const holeDark = (f: number): { 前: number; 后: number }[] => {
  const baseFrame = Math.min(f, events.挖开天窗 - 1);
  const front = darkenAt(baseFrame, holeDarkParams.人);
  const dimmed = darkenAt(baseFrame, holeDarkParams.wallDark);
  const after = front >= 1 ? 0 : clamp01(1 - (1 - dimmed) / (1 - front));
  return [0, 1].map((cellLayer) => {
    const k = remainingDark(f, cellLayer);
    return { 前: front * k, 后: after * k };
  });
};
/** 洞顶开着的时候（挖掉草方块以后、填土以前；挖开天窗以后）后墙顶上那格朝洞里那面压的黑（见 参数.ts 洞里暗.顶墙） */
export const topWallDark = (f: number) => ((f >= events.挖一 && f < events.填土) || f >= events.挖开天窗 ? holeDarkParams.topWall : 0);
