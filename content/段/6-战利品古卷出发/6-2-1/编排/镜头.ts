// 镜头：房间本地坐标的关键帧表，换到世界；末帧交给 6-2-4 的第 0 帧。
import { sample, sampleV, type Key, type VKey } from '../../../../../engine/anim/anim.ts';
import * as K624 from '../../6-2-4/编排.ts';
import { D2R } from '../动作.ts';
import { FPS, lastFrame, cues, lineStarts, segmentStartSec } from './时间线.ts';
import { F624 } from './站位.ts';

// ---------- 镜头（房间本地坐标，最后换到世界） ----------
export type Cam = { pos: number[]; tgt: number[]; lens: number };
const C1 = { pos: [-0.4, 5.6, 1.75], tgt: [0, -0.3, 1.1], lens: 28 }; // 6-2-4 首帧机位（6-2-4/编排.ts 的 C1.from / C1.tgt）
// [秒, 机位, 看向, 焦距]
const { seg22, seg23, uiClose } = segmentStartSec;
const quark = lineStarts.quarkTome / FPS; // 夸克古卷那句开口，铁砧页同时浮出
const CAM: [number, number[], number[], number][] = [
  // 6-2-1：桌上的战利品和指南针，窗外是海；李樱从画面左边走进来，站到桌子后面；拿起来看的时候慢慢推近。
  // 两个界面分在画面左右上角（看右手的毛皮弹在左边，看左手的血液弹在右边），人在中间不被挡住
  [0.0, [2.3, 0.6, 1.95], [1.95, -2.7, 1.1], 30],
  [2.3, [2.25, 0.4, 1.85], [2.0, -3.2, 1.35], 30],
  [3.2, [2.2, 0.2, 1.83], [2.0, -3.25, 1.37], 31],
  [9.6, [2.1, -0.3, 1.8], [2.0, -3.3, 1.4], 32],
  [seg22, [2.05, -0.4, 1.8], [2.0, -3.3, 1.38], 32],
  // 6-2-2：推成近景（胸口以上），从他左肩那边沿着胸口慢慢平移到右肩那边，停在低头的脸和胸口上。
  // 镜头放在和他眼睛差不多高、隔着桌子两米多：再近再高，低下去的头会挡住胸口；视线从桌上两件战利品中间穿过去，两件东西在画面下方两边当前景。
  // 抬眼时镜头往西偏（画面右边），铁砧页浮出来时人已经让到画面左边，界面和标注占右半边
  [seg22 + 1.5, [1.75, -0.75, 1.72], [1.9, -3.28, 1.38], 40],
  [seg22 + 3.6, [2.3, -0.85, 1.68], [2.05, -3.28, 1.33], 42],
  [quark + 0.15, [2.3, -0.75, 1.7], [1.42, -3.28, 1.38], 36],
  // 拍手（「对了」）时稍微拉开，人一直在左边、界面在右边；界面收起后回到正中，拿起指南针推成俯拍特写看指针（说「走吧九胡……」时推上去）；
  // 俯拍上打开结构罗盘界面，界面开着时机位不动；关掉以后接着慢慢推近看指针转；抬眼时拉开，跟着他往屋子中间走一路往北退到 6-2-4 的首帧机位
  [quark + 0.85, [2.3, -0.6, 1.8], [1.45, -3.25, 1.4], 33],
  [seg23 + 6.48, [2.3, -0.58, 1.8], [1.45, -3.25, 1.4], 33],
  [seg23 + 7.28, [2.25, -0.55, 1.85], [2.05, -3.2, 1.38], 32],
  // 指南针特写：几乎正上方往下拍，避开前景的毛皮
  [seg23 + 8.48, [2.15, -2.25, 2.2], [2.08, -2.8, 1.28], 44],
  [uiClose, [2.15, -2.25, 2.2], [2.08, -2.8, 1.28], 44],
  [uiClose + 1.475, [2.13, -2.3, 2.15], [2.08, -2.8, 1.28], 48],
  [uiClose + 2.275, [2.2, -1.2, 1.9], [2.0, -3.2, 1.5], 34],
  [uiClose + 4.375, [1.2, 2.0, 1.8], [0.45, -1.8, 1.25], 30],
  [cues.end, C1.pos, C1.tgt, C1.lens],
];
const CAM_POS: VKey[] = CAM.map(([sec, pos]) => [sec * FPS, pos]);
const CAM_TGT: VKey[] = CAM.map(([sec, , tgt]) => [sec * FPS, tgt]);
const CAM_LENS: Key[] = CAM.map(([sec, , , lens]) => [sec * FPS, lens]);
export const toWorld = (point: number[]): number[] => {
  const angle = K624.ROOM.heading * D2R;
  const origin = K624.ROOM.origin;
  return [point[0] * Math.cos(angle) - point[1] * Math.sin(angle) + origin[0], point[0] * Math.sin(angle) + point[1] * Math.cos(angle) + origin[1], point[2] + origin[2]];
};
export const cameraLocal = (G: number): Cam => ({ pos: sampleV(CAM_POS, G), tgt: sampleV(CAM_TGT, G), lens: sample(CAM_LENS, G) });
export const camera = (globalFrame: number): Cam => {
  if (globalFrame >= lastFrame) return K624.camera(F624);
  const local = cameraLocal(globalFrame);
  return { pos: toWorld(local.pos), tgt: toWorld(local.tgt), lens: local.lens };
};
