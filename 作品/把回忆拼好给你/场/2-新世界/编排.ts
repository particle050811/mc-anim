// 新世界这一场每一帧的样子：镜头在哪（钻进图标时往前冲、你起步后往前往下落到剖面）、游戏时间（下午；第 2 句边挖边天黑）、剖面撤到第几排、你（史蒂夫）站哪、朝哪、走了几步。
// 纯计算（不 import react、three），测试直接引。按歌曲帧算：2-初入、2-第一晚 两段一镜不切，都从这里取，接缝那一帧才对得上。
// 钻入的进度由段算好传进来（钻入的时长在 场/2-选择世界：场只接上一场的末态，这一场不引它）；别的时刻对 分镜 的正片事件。
import type { V3 } from '@engine/model/parts.tsx';
import type { ShadingSceneParams } from '@engine/三渲二/光影/预设.ts';
import { fps } from '../../分镜/时间.ts';
import { events as mainCutOpeningSceneEvents } from '../../分镜/正片开场.ts';
import { events as mainCutSecondLineEvents } from '../../分镜/正片第2句.ts';
import { groundHeight } from './地形.ts';
import { skyBrightness } from '../../地点/天体.ts';
import { you, arrived, crossSection, stripSec, pit, cameraRigs, chatOverlay, walkSpeed, type CameraRigFrame } from './参数.ts';

const mainCutEvents = { ...mainCutOpeningSceneEvents, ...mainCutSecondLineEvents };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothStep = (q: number) => q * q * (3 - 2 * q);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpRig = (a: CameraRigFrame, b: CameraRigFrame, k: number): CameraRigFrame => ({
  眼: a.眼.map((v, i) => lerp(v, b.眼[i]!, k)) as unknown as V3,
  看: a.看.map((v, i) => lerp(v, b.看[i]!, k)) as unknown as V3,
  fov: lerp(a.fov, b.fov, k),
});

// ---------- 镜头 ----------

/** 落镜进度（0～1，缓起缓停）：你起步那一帧起，到剖开那一帧落到剖面 */
export const shotLanding = (songFrame: number) => smoothStep(clamp01((songFrame - mainCutEvents.第1句起步.帧) / (mainCutEvents.第1句剖开.帧 - mainCutEvents.第1句起步.帧)));

/**
 * 镜头：钻 = 钻进图标的进度（0～1，线性，段算好传进来；钻完以后给 1）。
 * 钻的时候从 钻起 冲到 落定，越来越慢（缓出，接住图标放大越来越快的那股劲）；你起步以后从 落定 落到 剖面，之后不动
 */
/** 开光影时交给光影的事实（三渲二画布的 光影场）：太阳按 剖面 机位的朝向（正北看）摆，整段不跟镜头转。
 *  原来跟着每帧的镜头转，2-初入 落镜那一截镜头往北转了十几度，太阳跟着转过草的十字面，一帧里一半的草一齐从背光翻成受光（第 108 → 109 帧，
 *  用户 11-03「为什么上一帧草有的阴影 下一帧就没了？」）。取剖面：段尾那一帧、接着拍的 2-第一晚 和现在一样 */
export const newWorldShadingScene: ShadingSceneParams = {
  sunRefDir: [cameraRigs.剖面.看[0] - cameraRigs.剖面.眼[0], cameraRigs.剖面.看[1] - cameraRigs.剖面.眼[1], cameraRigs.剖面.看[2] - cameraRigs.剖面.眼[2]],
};

export const cameraRigAt = (dive: number, songFrame: number): CameraRigFrame => {
  const k = shotLanding(songFrame);
  if (k > 0) return lerpRig(cameraRigs.落定, cameraRigs.剖面, k);
  const p = clamp01(dive);
  return lerpRig(cameraRigs.钻起, cameraRigs.落定, 1 - (1 - p) ** 2);
};

// ---------- 游戏时间 ----------

/** 真时间的刻（第 1 句加入游戏那一帧起算） */
const realTick = (songFrame: number) => ((songFrame - mainCutEvents.第1句加入游戏.帧) * 20) / fps;

/** 在 [低, 高] 里二分：仍是 对 的最后一刻、不再 对 的第一刻（对 在 低 那头成立、高 那头不成立） */
const bisect = (predicate: (tick: number) => boolean, low: number, high: number) => {
  for (let i = 0; i < 60; i++) {
    const m = (low + high) / 2;
    if (predicate(m)) low = m;
    else high = m;
  }
  return [low, high] as const;
};
/** 原版天亮程度的四个拐点（第一天）：傍晚刚要从 1 往下掉（约 11870）、刚掉到 0（约 13670）；黎明刚要从 0 往上（约 22330）、刚升到 1（约 24130） */
export const brightEndTick = bisect((t) => skyBrightness(t) >= 1, 6000, 18000)[0];
export const fullDarkTick = bisect((t) => skyBrightness(t) > 0, 6000, 18000)[1];
export const dawnTick = bisect((t) => skyBrightness(t) <= 0, 18000, 30000)[0];
export const fullLightTick = bisect((t) => skyBrightness(t) < 1, 18000, 30000)[1];

/** 天亮程度在 [低, 高] 里单调（傍晚往下、黎明往上）：返回天亮正好走到 亮 的那一刻 */
export const skyLightTo = (bright: number, low: number, high: number) => {
  const ascending = skyBrightness(high) > skyBrightness(low);
  return bisect((t) => (ascending ? skyBrightness(t) < bright : skyBrightness(t) > bright), low, high)[1];
};

const nightStartFrame = mainCutEvents.第1句推完.帧, nightEndFrame = mainCutEvents.填土.帧;

/** 第 1 句、第 2 句的游戏刻：第 1 句整句是下午（天亮 1，太阳在背后偏西不进画），第 2 句首字那一帧正好走到 亮尽刻；
 *  从第 2 句首字到填土那一拍，天亮程度缓起缓停地从 1 掉到 0（边挖边天黑：挖第一格时还亮、填土那一拍黑透，星星跟着出来），之后照真时间接着走。
 *  按天亮缓动而不按刻缓动：天亮只在日落前后那 1800 刻里掉，按刻缓动的话天黑挤在几帧里。
 *  核查 10-24：原来入夜在第 1 句最后一秒，和落镜、撤排、换歌词叠在一起；挪到第 2 句里，第 1 句尾只剩剖开这一件事。演绎，Agent 暂定 */
export const skyTickAt = (songFrame: number) => {
  if (songFrame <= nightStartFrame) return brightEndTick + realTick(songFrame) - realTick(nightStartFrame);
  if (songFrame < nightEndFrame) return skyLightTo(1 - smoothStep((songFrame - nightStartFrame) / (nightEndFrame - nightStartFrame)), brightEndTick, fullDarkTick);
  return fullDarkTick + realTick(songFrame) - realTick(nightEndFrame);
};

/** 聊天栏的钟（刻，加入游戏那一帧 0）：起步前照真时间；起步后加快，「Steve加入了游戏」在剖开那一帧正好走完原版的 200 刻（最后 20 刻淡掉，铺在 聊天.淡秒 里），
 *  剖开、第 2 句里没有聊天字（文字一时只走一路，用户 10-24 规矩 看得懂的速度；撤排从左下角扫上去，聊天行先淡掉） */
const fadeFrames = chatOverlay.fadeSec * fps;
const fadeStartFrame = mainCutEvents.第1句剖开.帧 - fadeFrames;
export const chatTickAt = (songFrame: number) => {
  const startFrame = mainCutEvents.第1句起步.帧;
  if (songFrame <= startFrame) return realTick(songFrame);
  if (songFrame <= fadeStartFrame) return realTick(startFrame) + (180 - realTick(startFrame)) * smoothStep((songFrame - startFrame) / (fadeStartFrame - startFrame));
  if (songFrame <= mainCutEvents.第1句剖开.帧) return 180 + (20 * (songFrame - fadeStartFrame)) / fadeFrames;
  return 200 + realTick(songFrame) - realTick(mainCutEvents.第1句剖开.帧);
};

// ---------- 剖面 ----------

/** 撤掉了几排（0～剖面.剥排）：剖开那一帧起，每 剥秒 从镜头脚下往坑那边撤一排 */
export const peeledRows = (songFrame: number) => Math.min(crossSection.stripRows, Math.max(0, Math.floor((songFrame - mainCutEvents.第1句剖开.帧) / (stripSec * fps)) + 1));

// ---------- 你 ----------

/** 出生点到坑那一格的距离、方向（yaw，同 stevePose：0 朝北、正 = 往左） */
const endPoint = [pit.i + 0.5, pit.j + 0.5] as const;
const pathLength = Math.hypot(endPoint[0] - you.feet[0], endPoint[1] - you.feet[1]);
export const heading = -Math.atan2(endPoint[0] - you.feet[0], endPoint[1] - you.feet[1]) * (180 / Math.PI);

/** 原版平地上的走：按住前进时每刻速度往 走速 收 40%（同 库/角色/史蒂夫.tsx vanillaWalk 的 fromRest），位置是它的累加；
 *  松开以后每刻速度乘 0.546（草地滑度 0.6 × 空气阻力 0.91），滑一小段停下。步幅（limbSwingAmount）每刻往目标收 40%，limbSwing 累加步幅 */
const perTick = walkSpeed / 20;
const holdWalkOut = (tick: number) => perTick * (tick - (0.6 * (1 - 0.6 ** tick)) / 0.4);
const holdSpeed = (tick: number) => perTick * (1 - 0.6 ** tick);
const releaseSlide = (v: number, tick: number) => (v * 0.546 * (1 - 0.546 ** tick)) / (1 - 0.546);
/** 松开的那一刻（起步后几刻）：按住走出 + 滑到停 = 路长（二分） */
export const releaseTick = (() => {
  let lo = 0, hi = 200;
  for (let n = 0; n < 60; n++) {
    const m = (lo + hi) / 2;
    if (holdWalkOut(m) + releaseSlide(holdSpeed(m), Infinity) < pathLength) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
})();
const strideTarget = Math.min(1, (walkSpeed / 20) * 4);

/** 起步后 刻 刻：走出多远（格）、limbSwing、步幅 */
export const walk = (tick: number): { 出: number; swing: number; stride: number } => {
  if (tick <= 0) return { 出: 0, swing: 0, stride: 0 };
  const holdTick = Math.min(tick, releaseTick);
  const holdSwing = strideTarget * (holdTick - (0.6 * (1 - 0.6 ** holdTick)) / 0.4);
  if (tick <= releaseTick) return { 出: holdWalkOut(tick), swing: holdSwing, stride: strideTarget * (1 - 0.6 ** tick) };
  const sinceRelease = tick - releaseTick;
  const releaseAmp = strideTarget * (1 - 0.6 ** releaseTick);
  return { 出: holdWalkOut(releaseTick) + releaseSlide(holdSpeed(releaseTick), sinceRelease), swing: holdSwing + (releaseAmp * 0.6 * (1 - 0.6 ** sinceRelease)) / 0.4, stride: releaseAmp * 0.6 ** sinceRelease };
};

/** 停稳的那一帧（歌曲帧）：松开后滑 8 刻（剩不到 0.01 格），之后转身、低头 */
export const settleFrame = mainCutEvents.第1句起步.帧 + Math.ceil(((releaseTick + 8) * fps) / 20);

export type YouPose = {
  feet: V3;
  /** 身子朝向（度，同 stevePose 的 yaw） */
  facing: number;
  /** 头的俯仰（度，负 = 低头） */
  头: number;
  /** 原版 limbSwing、limbSwingAmount（给 stevePose） */
  swing: number;
  stride: number;
  /** 游戏时间（秒），两臂的轻晃 */
  秒: number;
};

/** 第 歌帧 帧你的样子：站在出生点朝着樱花林，起步走到坑那一格停下，转身朝东、低头看脚下（2-第一晚 从这个样子接着挖） */
export const youAt = (songFrame: number): YouPose => {
  const tick = ((songFrame - mainCutEvents.第1句起步.帧) * 20) / fps;
  const w = walk(tick);
  const a = (heading * Math.PI) / 180;
  const d = Math.min(pathLength, w.出);
  const x = you.feet[0] - Math.sin(a) * d, y = you.feet[1] + Math.cos(a) * d;
  const feet: V3 = [x, y, groundHeight(Math.floor(x), Math.floor(y))];
  const turnProgress = clamp01((songFrame - settleFrame) / (arrived.turnSec * fps));
  const headDownT = clamp01((songFrame - settleFrame - arrived.turnSec * fps) / (arrived.headDownSec * fps));
  return { feet, facing: lerp(heading, arrived.facing, smoothStep(turnProgress)), 头: lerp(0, arrived.头, smoothStep(headDownT)), swing: w.swing, stride: w.stride, 秒: songFrame / fps };
};
