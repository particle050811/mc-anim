// 15 尾随歌曲帧走的几样（纯函数，合照.tsx 画、测试核）：她靠到哪、靠肩那一镜的正交机位。时刻取 分镜 的 正片事件，数取 合照参数.ts。
import type { OrthoRigParams } from '@engine/三渲二/机位.tsx';
import { clamp01 } from '@engine/anim/anim.ts';
import { events as mainCutEvents } from '../../分镜/正片15尾.ts';
import { groupPhotoShot } from './合照参数.ts';

const events = mainCutEvents;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** 她靠到哪（0～1，缓过的，按歌曲帧）：靠肩起 那一帧是 0（同 2-重逢 末尾的样子），到 靠肩 那一帧缓缓靠好，之后停住 */
export const leanProgress = (frame: number) => smoothstep(clamp01((frame - events.leanStart.帧) / (events.leanOnShoulder.帧 - events.leanStart.帧)));

/** 靠肩这一镜的正交机位（朝东） */
export const shoulderRig: OrthoRigParams = { 种: '正交', facing: '东', N: groupPhotoShot.N, topDepth: groupPhotoShot.topDepth, 看: groupPhotoShot.看, section: groupPhotoShot.section, depth: groupPhotoShot.depth };
