// 2-收集快乐 每一帧谁在哪、什么姿势：取景（整句不动；头顶的云在 场/2-门口/第8句云.ts）、调子、照片墙、她和往框里放的那张照片、你、苦力怕、头顶的气泡。按段内帧算，时刻取 分镜 的正片事件，
// 分寸取 场/2-门口/第8句参数.ts。纯模块（不 import react、three），测试直接引。
// 苦力怕按原版走路摆腿（库/角色/史蒂夫.tsx 的 vanillaWalk）：走进来的速度由冒头、哈气两个时刻倒推，逃的速度是原版躲猫的两倍（演绎）；
// 转身、转头都在 0.1 秒上下转完（24 fps 时一两帧；原版一刻转 90°）。分寸按秒，起转那一帧已经走了 1/24 秒（24 fps 时的一帧）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { lerpTone, type Tone } from '@engine/三渲二/调子.ts';
import { vanillaWalk } from '@库/角色/史蒂夫.tsx';
import type { MagicalWineFoxAllExpression, MagicalWineFoxExPose } from '@库/角色/魔法酒狐新动作.ts';
import { CREEPER, type CreeperPose } from '@库/生物/苦力怕.tsx';
import { fps, oneFrameSec, legacyFrameSec } from '../../分镜/时间.ts';
import { segmentWindow, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第8句.ts';
import { entrance } from '../../地点/门口小木屋.tsx';
import type { DoorFraming } from '../../场/2-门口/参数.ts';
import * as params from '../../场/2-门口/第8句参数.ts';
import * as sentence8 from '../../场/2-门口/第8句.ts';
import { palette } from '../../色板.ts';

const segKey = '2-收集快乐';
export const events = segMainCutEventFrames(segKey);
const startFrame = segmentWindow(segKey).起帧;
/** 段内帧 → 歌曲帧（颗粒的种子取它，和核对段的静帧同一颗粒） */
export const toSongFrame = (f: number) => startFrame + f;
/** 段内帧 → 歌上的秒（她的呼吸、尾巴按它走） */
export const songSec = (f: number) => (startFrame + f) / fps;
const standY = entrance.standRowY;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec3 = (a: readonly number[], b: readonly number[], t: number): V3 => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];
type BoneTable = Record<string, BonePose>;
/** 两张骨骼表按转角插值（一边没有的骨骼当 0°） */
const lerpBonePose = (a: BoneTable, b: BoneTable, t: number): BoneTable => {
  const r: BoneTable = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) r[k] = { rot: lerpVec3(a[k]?.rot ?? [0, 0, 0], b[k]?.rot ?? [0, 0, 0], t) };
  return r;
};
const lookLerp = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], clamp01(t)), lerp(a[1], b[1], clamp01(t))];

// ---------- 镜头、调子 ----------
/** 取景（第8句镜头）：整句不动。第 7 句末朝北仰看着远处的屋子，这里同一个朝向直接切到门口这一面，一切进来就是她拿着照片站在空框前，
 *  挂照片前有一秒看清。不从天往下摇：切过来先摇半秒，头几帧是大半屏的山墙和天，看不出到了哪（核查 10-24，Agent 暂定） */
export const framing: DoorFraming = sentence8.line8Shot.framing;
/** 转晴走了多少（0 段首 → 1 第8句晴定），两头缓 */
export const clearingProgress = (f: number) => {
  const t = clamp01(f / events.第8句晴定);
  return t * t * (3 - 2 * t);
};
/** 调子：段首接第 7 句末的雨后暖阳，第8句晴定 时到 第8句调子（雨后暖阳和夏日白天各一半） */
export const gradeAt = (f: number): Tone => lerpTone(palette.雨后暖阳, palette.夏日白天, 0.5 * clearingProgress(f));

// ---------- 照片墙 ----------
/** 夏天那四格里放了几张：段首前三张，挂照片 那一帧起四张（第 4 格先是空框） */
export const wallPhotoCount = (f: number) => (f < events.挂照片 ? 3 : 4);

// ---------- 她 ----------
export type LiYingState = {
  loc: V3;
  yaw: number;
  stancePose: MagicalWineFoxExPose;
  expression: MagicalWineFoxAllExpression;
  /** 头 [俯仰, 左右]；给了 骨骼.Head 就不用它 */
  看?: [number, number];
  skeleton: BoneTable;
  blink: number | 'auto';
  /** 不给 = 不呼吸、尾巴不摆（屏住气哈） */
  秒?: number;
};

/** 段内帧 f 离 挂照片 几秒（之前是负的） */
const distSinceHang = (f: number) => (f - events.挂照片) / fps;
/** 往框里推走了多少（0 手里 → 1 进框）：挂照片 前 挂伸秒 起，挂照片 前一帧到 1（正好落在框里那张的位置、大小），两头缓（进框时慢下来） */
const pushProgress = (f: number) => {
  const t = clamp01((distSinceHang(f) + params.hangReachSec) / (params.hangReachSec - oneFrameSec));
  return t * t * (3 - 2 * t);
};

export const LiYingState = (f: number): LiYingState => {
  const loc: V3 = [sentence8.hissStandPos.liYingX, standY, 0];
  const sec = songSec(f);
  if (f < events.她看见苦力怕) {
    let handPose: BoneTable = params.holdPhotoHand;
    let gaze = params.lookInHand;
    if (f >= events.挂照片) {
      // 挂上了：手收回来，看一眼框再转过来看你
      handPose = lerpBonePose(params.hangPhotoHand, params.emptyHand, distSinceHang(f) / params.retractHandSec);
      gaze = lookLerp(params.lookFrame, params.lookAtYou, (distSinceHang(f) - params.retractHandSec + oneFrameSec) / params.turnHeadSec);
    } else if (distSinceHang(f) >= -params.hangReachSec) {
      handPose = lerpBonePose(params.holdPhotoHand, params.hangPhotoHand, pushProgress(f));
      gaze = lookLerp(params.lookInHand, params.lookFrame, (distSinceHang(f) + params.hangReachSec + oneFrameSec) / params.turnHeadSec);
    }
    return { loc, yaw: 180, stancePose: '站', expression: '微笑', 看: gaze, skeleton: handPose, blink: 'auto', 秒: sec };
  }
  if (f < events.哈气) {
    // 看见苦力怕：头往画面左边转过去（1/12 秒，24 fps 时两帧），吓一跳
    return { loc, yaw: 180, stancePose: '站', expression: '惊讶', 看: lookLerp(params.lookAtYou, params.lookAtCreeper, ((f - events.她看见苦力怕) / fps + oneFrameSec) / legacyFrameSec(2)), skeleton: params.emptyHand, blink: 0, 秒: sec };
  }
  if (f < events.苦力怕逃) {
    return { loc, yaw: sentence8.hissFacing.liYingYaw, stancePose: '哈气', expression: '哈气', 看: sentence8.puffLook, skeleton: { ...sentence8.puffPaws, ...sentence8.hissTail }, blink: 0 };
  }
  // 回头冲你得意地一歪头：转身朝镜头，头转向你、歪过去（1/8 秒歪到位，24 fps 时三帧），闭眼笑
  const tilt = params.proudTilt * clamp01(((f - events.苦力怕逃) / fps + oneFrameSec) / legacyFrameSec(3));
  const [pitch, yaw] = params.proudLook;
  return { loc, yaw: 180, stancePose: '站', expression: '微笑', skeleton: { Head: { rot: [-pitch, -yaw, tilt] } }, blink: 1, 秒: sec };
};

/** 不在框里的那张光柱破云（照片墙.tsx 的 地图画片）：挂照片 之前在她手里，挂照片 前 挂伸秒 起从手里的位置、大小挪进空框，前一帧已经和框里那张一样，
 *  挂照片 那一帧（咔哒一声）换成框里那张（这里给 null），画面不跳。角的 x、z 吸到整成片像素（贴图像素的边落在整像素上） */
export const photoState = (f: number): { 角: V3; side: number } | null => {
  if (f >= events.挂照片) return null;
  const t = pushProgress(f);
  const snap = (v: number) => Math.round(v * framing.pxPerCell) / framing.pxPerCell;
  const corner = lerpVec3(params.photoHoldAngle, params.photoFrameAngle, t);
  return { 角: [snap(corner[0]), corner[1], snap(corner[2])], side: lerp(params.photoHoldEdge, 1, t) };
};

// ---------- 苦力怕 ----------
const walkSpeed = params.creeperWalkSpeed;
const fleeSpeed = CREEPER.speed.flee * params.creeperFleeMult;
/** 段内帧 f 离 苦力怕掉头 几秒 */
const distSinceTurn = (f: number) => (f - events.苦力怕掉头) / fps;

export const creeperPose = (f: number): CreeperPose => {
  const stopX = sentence8.hissStandPos.苦力怕;
  if (f < events.哈气) {
    const x = stopX - (walkSpeed * (events.哈气 - f)) / fps;
    // 一直在走（不是从站着起步）；腿的相位按到哈气那一帧还差几秒倒推
    const walk = vanillaWalk(walkSpeed, 10 - (events.哈气 - f) / fps);
    return { loc: [x, standY, 0], yaw: sentence8.hissFacing.苦力怕, limbSwing: walk.limbSwing, stride: walk.stride, headYaw: 0 };
  }
  if (f < events.苦力怕掉头) return { loc: [stopX, standY, 0], yaw: sentence8.hissFacing.苦力怕, ...sentence8.creeperStill };
  if (distSinceTurn(f) < params.creeperTurnSec) {
    // 往右（顺时针）转过来：先正脸朝镜头，再朝西（起那一帧已经转了一帧）
    const k = clamp01((distSinceTurn(f) + oneFrameSec) / params.creeperTurnSec);
    return { loc: [stopX, standY, 0], yaw: sentence8.hissFacing.苦力怕 - 180 * k, limbSwing: 0, stride: 0, headYaw: 0 };
  }
  const sec = distSinceTurn(f) - params.creeperTurnSec + oneFrameSec;
  const x = stopX - fleeSpeed * sec;
  const walk = vanillaWalk(fleeSpeed, sec, true);
  return { loc: [x, standY, 0], yaw: sentence8.hissFacing.苦力怕 - 180, limbSwing: walk.limbSwing, stride: walk.stride, headYaw: 0 };
};

// ---------- 你 ----------
/** 你一直站在照片墙右边、身子朝镜头，头转过去看着她（定稿：你在她身后看她或看苦力怕） */
export const youState = (_f: number) => ({ x: sentence8.hissStandPos.你, yaw: sentence8.hissFacing.你, headYaw: sentence8.youHead, scale: sentence8.steveScale });

// ---------- 气泡 ----------
export const bubbleState = (f: number): { 字: string; x: number } | null => {
  if (f < events.哈气) return null;
  if (f < events.苦力怕逃) return { 字: sentence8.hissBubbleText, x: sentence8.hissStandPos.liYingX };
  return { 字: params.proudBubbleText, x: sentence8.hissStandPos.liYingX };
};
