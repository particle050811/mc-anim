// 2-抢龙蛋 每一帧谁在哪、什么样：她、你、龙蛋、龙蛋瞬移的传送粒子、机位、开头从第 4 句的浪里出来。
// 按段内帧算，时刻取 分镜 的正片事件，位置和分寸取 参数.ts、姿势.ts。纯模块（测试能引，不 import 组件）。
// 游戏钟：段首是第 0 刻，每帧 20/fps 刻；粒子、挥手都按刻走，同游戏。
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import type { MagicalWineFoxAllExpression, MagicalWineFoxExPose } from '@库/角色/魔法酒狐新动作.ts';
import type { ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { fps, legacyFrameSec, segmentFrames } from '../../分镜/时间.ts';
import { events as mainCutLine4Events } from '../../分镜/正片第4句.ts';
import { events as mainCutLine5Events, segmentWindow } from '../../分镜/正片第5句.ts';
import { beatGrid } from '../../配乐/网格.ts';
import * as params from './参数.ts';
import * as pose from './姿势.ts';

const mainCutEvents = { ...mainCutLine4Events, ...mainCutLine5Events };
const segMainCutEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, mainCutEvents);

const segKey = '2-抢龙蛋';
export const events = segMainCutEventFrames(segKey);
const segWindow = segmentWindow(segKey);
export const frameCount = segWindow.帧数;
/** 段内帧 → 歌曲帧（颗粒的种子取它，核对段的静帧同一颗粒） */
export const toSongFrame = (f: number) => segWindow.起帧 + f;
/** 段内帧 → 歌上的秒（她眨眼、尾巴按它走） */
export const songSec = (f: number) => (segWindow.起帧 + f) / fps;
/** 段内帧 → 游戏刻（段首 0） */
export const frameToTick = (f: number) => (f * 20) / fps;
const beatFrames = beatGrid.拍长 * fps;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec3 = (a: readonly number[], b: readonly number[], t: number): V3 => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];
/** 两张骨骼表按转角、位置插值（一边没有的当 0） */
const lerpBonePose = (a: pose.BoneTable, b: pose.BoneTable, t: number): pose.BoneTable => {
  const r: pose.BoneTable = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const fromBone = a[k] ?? {}, second = b[k] ?? {};
    r[k] = { ...fromBone, ...second, rot: lerpVec3(fromBone.rot ?? [0, 0, 0], second.rot ?? [0, 0, 0], t), ...(fromBone.pos || second.pos ? { pos: lerpVec3(fromBone.pos ?? [0, 0, 0], second.pos ?? [0, 0, 0], t) } : {}) };
  }
  return r;
};
/** 格 (i, j, k) 中间、离格底 高 处 */
const cellCenter = (c: readonly number[], heightOffset = pose.eggCenterHeight): V3 => [c[0]! + 0.5, c[1]! + 0.5, c[2]! + heightOffset];
/** yaw（FigurePose：0 朝北、正 = 往左转）→ 水平朝向的单位向量 */
const forward = (yaw: number): [number, number] => [-Math.sin((yaw * Math.PI) / 180), Math.cos((yaw * Math.PI) / 180)];

// ---------- 你 ----------
const waveFrames = (params.waveTicks / 20) * fps;
const waveLeadFrames = (params.waveLeadTicks / 20) * fps;
/** 挥手进度（原版 attackTime 0～1，6 刻挥完）：比蛋瞬移早 挥手提前刻 起挥；没在挥 = null */
export const youWaveAt = (f: number): number | null => {
  const a = (f - events.clickEgg + waveLeadFrames) / waveFrames;
  return a >= 0 && a < 1 ? a : null;
};
const leadFrames = params.lookEggLeadSec * fps;
export const youEyePos = (): V3 => [params.you.位[0], params.you.位[1], pose.youEyeHeight];

export type YouState = { loc: V3; yaw: number; 看: V3; wave: number | null; 秒: number };
/** 你一直站着：看她，点蛋前转头看蛋，蛋没了、她摔下去以后再看回她 */
export const YouState = (f: number): YouState => {
  const lookAt = f >= events.clickEgg - leadFrames && (f - events.pounceMiss) / fps < legacyFrameSec(2) ? cellCenter(params.eggSpots.起) : herHeadPos(f);
  return { loc: params.you.位, yaw: params.you.facing, 看: lookAt, wave: youWaveAt(f), 秒: songSec(f) };
};

// ---------- 她 ----------
export type LiYingState = {
  pose: FigurePose;
  poseName: MagicalWineFoxExPose;
  expression: MagicalWineFoxAllExpression;
  /** 头对准场景里这一点（按这个姿势的身体倾斜算）；不给 = 看 或者 骨骼 的 Head */
  lookAt?: V3;
  /** 头相对身子的 [俯仰, 左右]（度，正 = 抬头、往左） */
  看?: [number, number];
  skeleton: pose.BoneTable;
  blink: number | 'auto';
  秒?: number;
};

/** 蹬地压低了没有：扑起前 蹬地秒 起 */
const pushedOff = (f: number) => (events.pounceStart - f) / fps <= params.pushOffSec;
const standPose = (loc: V3, pitch = 0, yaw: number = params.liYing.facing): FigurePose => ({ loc, pitch, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0, yaw });

/** 扑在半空：0～1（扑起 → 落蛋） */
const flyProgress = (f: number) => clamp01((f - events.pounceStart) / (events.landOnEgg - events.pounceStart));
/** 半空的 loc：伏位 → 蛋上位，连线上再拱起一道抛物线 */
const flyPos = (t: number): V3 => {
  const p = lerpVec3(params.liYing.herPronePos, params.liYing.herOnEggPos, t);
  return [p[0], p[1], p[2] + 4 * params.liYing.pounceHeight * t * (1 - t)];
};
const flyTilt = (t: number) => {
  const k = clamp01(t / pose.pounceTilt.turnDone);
  return lerp(pose.pounceTilt.起, pose.pounceTilt.flatAngleDeg, 1 - (1 - k) ** 2);
};

/** 原版实体下落：每刻先按速度走，再 v = (v − 0.08) × 0.98（LivingEntity.travel），刻与刻之间线性插值（渲染的 partialTick）。返回第 刻 刻掉了多少格 */
export const vanillaFall = (tickCount: number): number => {
  if (tickCount <= 0) return 0;
  let y = 0, v = 0;
  for (let k = 0; k < Math.floor(tickCount); k++) {
    y += v;
    v = (v - 0.08) * 0.98;
  }
  return -(y + (tickCount - Math.floor(tickCount)) * v);
};
const preFallHeight = params.liYing.herOnEggPos[2];
/** 蛋没了以后她的身子中线离地多高（落到 趴高 停住） */
const fallHeight = (f: number) => Math.max(params.liYing.flatHeight, preFallHeight - vanillaFall(frameToTick(f - events.clickEgg)));
/** 掉到地上那一帧（连续的段内帧）；分镜 的 扑空 按同一套写成秒，测试核两边差不到一帧 */
export const landFrame = (() => {
  let f = events.clickEgg;
  while (fallHeight(f) > params.liYing.flatHeight) f += 0.01;
  return f;
})();
const flatPos: V3 = [params.liYing.herOnEggPos[0], params.liYing.herOnEggPos[1], params.liYing.flatHeight];

/** 她头大概在哪（你看她、她抬头算角度用；不用很准） */
export const herHeadPos = (f: number): V3 => {
  if (f < events.pounceStart) {
    const [fx, fy] = forward(params.liYing.facing);
    const [forwardDist, headHeight] = pose.headPose.prone;
    return [params.liYing.herPronePos[0] + fx * forwardDist, params.liYing.herPronePos[1] + fy * forwardDist, headHeight];
  }
  if (f >= events.sitUp) return [params.liYing.herSitPos[0], params.liYing.herSitPos[1], pose.headPose.sit];
  const [fx, fy] = forward(params.liYing.herProneYaw);
  const [headLength, lift] = pose.headPose.level;
  if (f < events.landOnEgg) {
    const t = flyProgress(f);
    const p = flyPos(t);
    const a = (-flyTilt(t) * Math.PI) / 180;
    return [p[0] + fx * headLength * Math.sin(a), p[1] + fy * headLength * Math.sin(a), p[2] + headLength * Math.cos(a) + lift];
  }
  const z = f < events.clickEgg ? preFallHeight : fallHeight(f);
  return [flatPos[0] + fx * headLength, flatPos[1] + fy * headLength, z + lift];
};

/**
 * 身子放平（扑、蛋上、摔、趴）时头的转角（Head 绕 x，负 = 抬头）：身子正朝东，要看的都在东边，只解俯仰。
 * 坑：这几个姿势下要看的东西差不多在她「头顶」那一头，看向 解出来的左右转角乱跳、帽檐转向镜头，所以自己算；
 *   Head 绕 y 这时是绕往前伸的脖子转，加了是歪头、帽顶冲镜头，不是左右看，所以不加。
 * 身倾 = FigurePose.pitch（−90 趴平），腰 = UpBody 绕 x（正 = 往前弯）：脸本来朝水平以下 (−身倾 + 腰) 度，要抬到对着 点 的仰角
 */
const raiseHead = (bodyTilt: number, waistAngle: number, headPos: V3, target: V3): pose.Bone => {
  const pitch = (Math.atan2(target[2] - headPos[2], Math.hypot(target[0] - headPos[0], target[1] - headPos[1])) * 180) / Math.PI;
  return { rot: [-(-bodyTilt + waistAngle + pitch), 0, 0] };
};
const waistAngleOf = (boneTable: pose.BoneTable) => boneTable.UpBody?.rot?.[0] ?? 0;

/** 扭屁股：每拍一个来回，起止各用 1/12 秒（24 fps 时 2 帧）渐入渐出 */
const twistAt = (f: number) => {
  const envelope = clamp01((f - events.buttWiggle) / fps / legacyFrameSec(2)) * clamp01(((events.pounceStart - f) / fps - params.pushOffSec) / legacyFrameSec(2));
  return Math.sin((2 * Math.PI * (f - events.buttWiggle)) / beatFrames) * envelope;
};

export const LiYingState = (f: number): LiYingState => {
  const sec = songSec(f);
  if (!pushedOff(f)) {
    const w = twistAt(f);
    return {
      pose: standPose(params.liYing.herPronePos),
      poseName: pose.crouchState,
      expression: '认出你',
      lookAt: cellCenter(params.eggSpots.起),
      skeleton: {
        ...pose.prone,
        Root: { pos: [0, 0, 2.3], rot: [0, params.wiggleButt.转 * w, 0] },
        UpBody: { rot: [pose.prone.UpBody!.rot![0]!, -params.wiggleButt.转 * w, 0] },
        Tail: { rot: [pose.prone.Tail!.rot![0]!, params.wiggleButt.tailSwing * w, 0] },
      },
      blink: 'auto',
      秒: sec,
    };
  }
  if (f < events.pounceStart) return { pose: standPose(params.liYing.herPronePos), poseName: pose.crouchState, expression: '大笑', lookAt: cellCenter(params.eggSpots.起), skeleton: pose.kickPose, blink: 0, 秒: sec };
  const headPos = herHeadPos(f);
  if (f < events.landOnEgg) {
    const t = flyProgress(f);
    const tilt = flyTilt(t);
    const skeleton = { ...pose.pounce, Head: raiseHead(tilt, waistAngleOf(pose.pounce), headPos, cellCenter(params.eggSpots.起)) };
    return { pose: standPose(flyPos(t), tilt, lerp(params.liYing.facing, params.liYing.herProneYaw, t)), poseName: '静站', expression: '大笑', skeleton, blink: 0 };
  }
  if (f < events.clickEgg) {
    // 扑在蛋上抱住：落上去那几帧胸口弹起一点再贴下去；抬头看你（得意）
    const k = clamp01((f - events.landOnEgg) / fps / params.landBounceSec);
    const tilt = -90 + Math.sin(Math.PI * k) * pose.landBounce;
    const skeleton = { ...pose.onEggPose, Head: raiseHead(tilt, waistAngleOf(pose.onEggPose), headPos, youEyePos()) };
    return { pose: standPose(params.liYing.herOnEggPos, tilt, params.liYing.herProneYaw), poseName: '静站', expression: '大笑', skeleton, blink: 0, 秒: sec };
  }
  if (f < events.sitUp) {
    // 蛋没了：照原版重力掉下去，身子从抱蛋摊成趴着；落地以后脸朝下趴着
    const z = fallHeight(f);
    const t = clamp01((preFallHeight - z) / (preFallHeight - params.liYing.flatHeight));
    const bodyPose = lerpBonePose(pose.onEggPose, pose.flatPose, t);
    const skeleton = { ...bodyPose, Head: raiseHead(-90, waistAngleOf(bodyPose), headPos, cellCenter(params.eggSpots.起, 0)) };
    return { pose: standPose([flatPos[0], flatPos[1], z], -90, params.liYing.herProneYaw), poseName: '静站', expression: '惊讶', skeleton, blink: 0, 秒: sec };
  }
  // 坐起来（TLM 的待命坐）：一下切过去，身子半朝镜头，抬头冲你噘嘴，一直到段尾
  return { pose: standPose(params.liYing.herSitPos, 0, params.liYing.seatYaw), poseName: '坐', expression: '难过', 看: params.liYing.poutLook, skeleton: {}, blink: 'auto', 秒: sec };
};

// ---------- 龙蛋 ----------
/** 龙蛋在哪一格：点一下之前在 起，点完在 一 */
export const eggCell = (f: number): readonly [number, number, number] => (f < events.clickEgg ? params.eggSpots.起 : params.eggSpots.一);

/** Java Random（LegacyRandomSource）的 nextFloat 序列 */
export const javaRandom = (seed: number) => {
  const multiplier = 0x5deece66dn;
  const mask = (1n << 48n) - 1n;
  let s = (BigInt(seed) ^ multiplier) & mask;
  return () => {
    s = (s * multiplier + 0xbn) & mask;
    return Number(s >> 24n) / 16777216;
  };
};

/**
 * 龙蛋瞬移的 128 颗传送粒子（DragonEggBlock.teleport 客户端那段，javap 核过）：沿新旧两格的连线随机撒，
 * 位置 = lerp(随机, 新, 旧) + 水平格内随机、竖直 ±0.5，速度各分量 (随机 − 0.5) × 0.2。原版用世界的随机数，这里定种子（Agent 定）。
 * 原版方块坐标 (X, Y, Z) 换场景：格 i = X、k = Y、j = −Z − 1
 */
const makeTeleportParticles = (frame: number, oldPos: readonly number[], newPos: readonly number[], seed: number): ParticleSpawn[] => {
  const r = javaRandom(seed);
  const oldZ = -oldPos[1]! - 1, newZ = -newPos[1]! - 1;
  return Array.from({ length: 128 }, (_, n) => {
    const d0 = r();
    const fx = (r() - 0.5) * 0.2, fy = (r() - 0.5) * 0.2, fz = (r() - 0.5) * 0.2;
    const x = lerp(newPos[0]!, oldPos[0]!, d0) + (r() - 0.5) + 0.5;
    const y = lerp(newPos[2]!, oldPos[2]!, d0) + r() - 0.5;
    const z = lerp(newZ, oldZ, d0) + (r() - 0.5) + 0.5;
    return { 种: 'portal' as const, 刻: frameToTick(frame), p: [x, -z, y] as V3, v: [fx, -fz, fy] as V3, 种子: seed * 1000 + n };
  });
};
export const teleportParticles: ParticleSpawn[] = makeTeleportParticles(events.clickEgg, params.eggSpots.起, params.eggSpots.一, 5);

/** 出口传送门：传送门方块的格（原点格四周 5×5 去掉四角和中间柱子，EndPodiumFeature 的 closerThan 2.5） */
export const portalCells: readonly (readonly [number, number])[] = (() => {
  const r: [number, number][] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j < 6.25 && (i || j)) r.push([i, j]);
  return r;
})();

// ---------- 机位、开头的浪 ----------
/** 透视机位：从段首一路推到段尾（缓起缓停） */
export const cameraRig = (f: number) => {
  const k = clamp01(f / (frameCount - 1));
  const t = k * k * (3 - 2 * k);
  return { 种: '透视' as const, 眼: lerpVec3(params.cameraRig.eyeStart, params.cameraRig.eyeEnd, t), 看: lerpVec3(params.cameraRig.lookStart, params.cameraRig.lookEnd, t), fov: params.cameraRig.fov };
};
/** 第 4 句末盖满画面的那道浪（场/2-海上/浪.tsx 的 进）接着往上退：段首 1（盖满），照第 4 句涌上来的速度（浪起 到第 5 句起那一段走完 0 → 1）退到 2，露出末地 */
const surgeLegFrames = segWindow.起帧 - mainCutEvents.waveRises.帧;
export const surgeIn = (f: number) => Math.min(2, 1 + f / surgeLegFrames);
