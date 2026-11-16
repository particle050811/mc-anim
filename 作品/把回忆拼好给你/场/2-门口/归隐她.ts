// 第 14 句（段 2-归隐）里她每一帧的样子：站哪、朝哪、头看哪、手怎么摆、手里拿什么。分寸在 归隐参数.ts。
// 一直在左屏里：告示牌旁挂铃 → 转身朝东走进门 → 照片墙前按住合照、打一下框、合照落进手里 → 转过来低头看着它 → 她消失 那一拍带着合照传送走，以后不在了。
// 头上不冒气泡：这一句顶上有歌词，文字一时只走一路（规矩 看得懂的速度）。纯模块（第14句.test.ts 也读），画法在 归隐.tsx。
import type { BonePose } from '@engine/model/基岩模型.tsx';
import type { MagicalWineFoxAllExpression } from '@库/角色/魔法酒狐新动作.ts';
import { fps, legacyFrameSec } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第13至14句.ts';
import {
  mainHand,
  offHandFlower,
  liYingHead,
  photoStandPos,
  pressReachSec,
  boxFoldSec,
  hangBellPauseSec,
  hangBellPutDownSec,
  hangBellStandPos,
  hangBellFacing,
  gait,
  walkTo,
  walkFacing,
  turnHeadSec,
  turnSec,
} from './归隐参数.ts';
import { clamp01, lerpV } from '@engine/core/数学.ts';

const events = mainCutEvents;

type BoneTable = Record<string, BonePose>;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
/** 两个骨骼摆法之间插（只插 rot；两边都要有同一批骨骼） */
const lerpBonePose = (a: BoneTable, b: BoneTable, t: number): BoneTable =>
  Object.fromEntries(Object.keys(b).map((k) => [k, { rot: lerpV(a[k]?.rot ?? [0, 0, 0], b[k]!.rot ?? [0, 0, 0], t) as [number, number, number] }]));
/** 从 起 那一帧起 秒数 秒里从 0 缓到 1 */
const progressAt = (frame: number, startFrame: number, durSec: number) => smoothstep(clamp01((frame - startFrame) / fps / durSec));
/** 旧帧(1) 秒是几帧 */
const oldFrameStep = legacyFrameSec(1) * fps;

export type LiYingState = {
  x: number;
  yaw: number;
  看: [number, number];
  expression: MagicalWineFoxAllExpression;
  skeleton: BoneTable;
  rightHand: '合照' | null;
  leftHand: '花';
};

/** 主手这一帧怎么摆（没加走路的摆臂） */
const mainHandAt = (frame: number): BoneTable => {
  const putDownStart = events.hangBell.frame + hangBellPauseSec * fps;
  const pressStart = events.handOnPhoto.frame - pressReachSec * fps;
  const retractStart = events.punchFrame.frame - boxFoldSec * fps;
  if (frame >= events.takePhoto.frame) return mainHand.垂;
  if (frame > events.punchFrame.frame) return lerpBonePose(mainHand.打, mainHand.垂, (frame - events.punchFrame.frame) / (events.takePhoto.frame - events.punchFrame.frame));
  if (frame === events.punchFrame.frame) return mainHand.打;
  if (frame > retractStart) return lerpBonePose(mainHand.按, mainHand.收, (frame - retractStart) / (boxFoldSec * fps));
  if (frame >= events.handOnPhoto.frame) return mainHand.按;
  if (frame > pressStart) return lerpBonePose(mainHand.静, mainHand.按, progressAt(frame, pressStart, pressReachSec));
  return lerpBonePose(mainHand.挂铃, mainHand.静, progressAt(frame, putDownStart, hangBellPutDownSec));
};

/** 她在 帧（歌曲帧）的样子；她消失 以后不在了 */
export const liYingAt = (frame: number): LiYingState | null => {
  if (frame >= events.liYingVanishes.frame) return null;
  const walkState = walkTo(frame);
  const walking = frame > events.walkToPhotoWall.frame && walkState.x < photoStandPos;

  // 身子：挂铃朝镜头 → 走向照片墙 起转朝东 → 取照 那一帧起转回来朝镜头（拿着合照看）
  const turnEast = progressAt(frame, events.walkToPhotoWall.frame, turnSec);
  const turnBack = progressAt(frame, events.takePhoto.frame, turnSec);
  const yaw = hangBellFacing + (walkFacing - hangBellFacing) * turnEast * (1 - turnBack);

  // 头：看铃 → 走路平视 → 到站前 旧帧(1) 秒起抬头看合照 → 取照起低头看手里的
  let gaze = lerpV(liYingHead.lookBell, liYingHead.levelLook, progressAt(frame, events.walkToPhotoWall.frame, turnHeadSec)) as [number, number];
  const arriveFrame = events.handOnPhoto.frame - pressReachSec * fps;
  if (frame >= arriveFrame - oldFrameStep) gaze = lerpV(liYingHead.levelLook, liYingHead.lookGroupPhoto, progressAt(frame, arriveFrame - oldFrameStep, turnHeadSec)) as [number, number];
  if (frame >= events.takePhoto.frame) gaze = lerpV(liYingHead.lookGroupPhoto, liYingHead.lookInHand, progressAt(frame, events.takePhoto.frame, turnHeadSec)) as [number, number];

  // 走路：原版那样腿、空着的右胳膊前后摆（相位按走过的路），副手一直捧着花；起步、停下时摆幅跟着速度收（前后各 旧帧(1) 秒走的路）
  let skeleton: BoneTable = { ...mainHandAt(frame), ...offHandFlower };
  if (walking) {
    const s = Math.sin(walkState.cycles * Math.PI * 2);
    const strideDelta = walkTo(frame + oldFrameStep).x - walkTo(frame - oldFrameStep).x;
    const amplitude = clamp01(strideDelta / 0.35);
    const armRot = skeleton.RightArm!.rot!;
    skeleton = {
      ...skeleton,
      RightLeg: { rot: [gait.legAmp * s * amplitude, 0, 2.5] },
      LeftLeg: { rot: [-gait.legAmp * s * amplitude, 0, -2.5] },
      RightArm: { rot: [armRot[0] - gait.armSwing * s * amplitude, armRot[1], armRot[2]] },
    };
  }
  return {
    x: walkState.x,
    yaw,
    看: gaze,
    expression: frame >= events.takePhoto.frame ? '难过' : '无',
    skeleton,
    rightHand: frame >= events.takePhoto.frame ? '合照' : null,
    leftHand: '花',
  };
};
