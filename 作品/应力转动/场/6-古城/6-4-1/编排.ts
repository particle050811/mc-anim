// 6-4-1 羊毛搜刮（4 倍的新城）：三个镜头的跳切和机位，纯函数。李樱的戏（13 跳、羊毛、#212）在 跳搭.ts 的剧情时间线上，这里只挑窗口、摆机位。
// 全演 8 跳 280 米要 13 秒（用户 10-18 定人跑跳 30 米/秒，一跳 40 米上下），剪成三镜跳切，剧情时间照走，每镜只留一个完整动作（用户 10-19：跳跃的镜头缩短点）：
//   1. 中心大院：他站在落点（面朝南、握着锤），锤一收、转身往北一蹲，一跳蹬上北墙头（P1），顺墙头往西一蹬，刚离地就切。
//   2. 场子：他在场子东墙头（P4）一蹲就扑进场子，在幽匿地面垫羊毛 F1 落下（7-1-6 火把照出来的就是这块），一蹬往北翻墙（往 P5），刚离地就切。
//   3. #212：从东边飞来（P6 → B），落在 #212 跟前（三只尖啸体围着，8 格内没有感测体，开箱不响），开箱拿东西，盖子没合就转身往西一跳飞远（往 Q1）。
//   2 → 3 切在动作上（用户 10-20 嫌这一刀突兀）：场子那镜他往画面左上蹬出去，#212 这镜他从画面右上斜着落进来、接着往左下落，两镜机位朝向也不同，读得出是换了地方。
// 首帧接 6-3-6 末帧（李樱状态，机位不同）；末帧他刚从 #212 起跳往西飞，6-4-2 跳切到他落进兵营（中间四跳不演）。跳掉的几跳照样垫羊毛，场景里一块不少。
// 踩羊毛走、跳、垫羊毛都不产生振动（羊毛在 BlockTags.DAMPENS_VIBRATIONS 里）；开 #212 发 container_open，但 8 格内无感测体（工具/古城4x布局/核对.py 核过）。
import { sample, sampleV, type Key, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { G4 } from '../../../地点/古城4x.tsx';
import type { Cam, ChestOpening } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import { chestB } from '../../../地点/古城4x/布局.ts';
import * as jumpBuild from './跳搭.ts';

export const FPS = jumpBuild.FPS;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const up = (p: V3, h: number): V3 => [p[0], p[1], p[2] + h];

// ---------- 跳切 ----------
// 三镜各只留一个完整动作、切在刚离地的半空里，焦距跟着收紧（全程远景他只有几个像素大，看不清跳多远）
const yardEnd = jumpBuild.takeoffFrame('P1') + 5;
// 场子：蹬离 F1 第 2 帧就切，再往后他翻到场子北墙后面、被墙挡住，画面只剩一块羊毛。#212：落地前 8 帧，他正从画面右上角飞进来
const arenaWindow = { 起: jumpBuild.takeoffFrame('P4') - 2, 止: jumpBuild.takeoffFrame('F1') + 2 };
const chestWindow = { 起: jumpBuild.landFrame('B') - 8, 止: jumpBuild.takeoffFrame('B') + 4 };
export const cutPlan = jumpBuild.cutWindows([
  { 名: '大院', 起: 0, 止: yardEnd },
  { 名: '场子', ...arenaWindow },
  { 名: '#212', ...chestWindow },
]);
export const END = cutPlan.frameCount;
export const storyFrame = cutPlan.storyFrame;
const windows = cutPlan.windows;

// ---------- 箱子 ----------
// 开 #212：开盖、已开贴图都由画布按 模型/物品/箱子.tsx 算
export const openChest = (f: number): ChestOpening => ({ 号: chestB.号, 开: jumpBuild.openLidSecB, 关: jumpBuild.closeLidSecB, 秒: f / FPS });

// ---------- 机位（f 是剧情帧） ----------
const torsoAt = (f: number) => up(jumpBuild.footAt(f), 1.1);
// 看点：他胸口，竖直方向只跟一半（往参考高度上拉），一跳七米高时画面不上下猛晃
const halfFollow = (frame: number, refZ: number, k = 0.5): V3 => {
  const torso = torsoAt(frame);
  return [torso[0], torso[1], refZ + (torso[2] - refZ) * k];
};
// 镜头 1 大院（两个机位，正常剪接，不跳剧情）：他站在落点（游戏 (-709.5, -50, 240.5)），在大院东边 5 格宽的内通道里（x −711～−706，北墙 z 206～209，墙头 y −45）。
//   1a 通道里、他北边 8 米、比脚底高 2 米，看背影；他转身面朝镜头一蹲、一跳迎着镜头飞起来，镜头仰着跟，飞出画面上沿就切。
//   1b 北墙外（大院北边空地，z 196，比城地面高 13 米，头顶岩顶 y −33）往南侧拍：他冲上墙头（P1），顺墙头往西一蹬（往 P2）。机位顺他往西横移，焦距 30～36。
const J1 = jumpBuild.jumpOnto('P1');
export const cut1b = Math.round(J1.f0 + 9);
const cam1a = (f: number): Cam => ({ pos: G4(-708.6, -47.8, 232.0), tgt: torsoAt(f), lens: f < J1.f0 ? 26 : 26 - 6 * ss((f - J1.f0) / 9) });
const C1_POS: VKey[] = [
  [cut1b, G4(-714.0, -37.5, 196.5)],
  [jumpBuild.landFrame('P1'), G4(-717.0, -37.5, 196.5)],
  [yardEnd, G4(-719.0, -37.3, 196.5)],
];
const LENS1: Key[] = [[cut1b, 30], [jumpBuild.landFrame('P1'), 36], [yardEnd, 32]];
const cam1b = (f: number): Cam => ({ pos: sampleV(C1_POS, f) as V3, tgt: halfFollow(f, 6.0), lens: sample(LENS1, f) });
const cam1 = (f: number): Cam => (f < cut1b ? cam1a(f) : cam1b(f));
// 镜头 2 场子：机位在场子西头、高出场子地面 11 米（头顶净空 18～27 格），往东看场子东墙：他落上东墙头（P4）一蹲，迎着镜头扑进场子落在十几米外的 F1，
//   就势往北一蹬（往 P5）。焦距：远处 55 毫米（五十五米外）、扑进场子拉到 24。
const C2_POS: VKey[] = [
  [windows[1].起, G4(-894.0, -40.0, 223.5)],
  [windows[1].止, G4(-895.0, -40.0, 222.5)],
];
const LENS2: Key[] = [[windows[1].起, 55], [jumpBuild.takeoffFrame('P4'), 55], [(jumpBuild.takeoffFrame('P4') + jumpBuild.landFrame('F1')) / 2, 40], [jumpBuild.landFrame('F1') - 8, 28], [jumpBuild.landFrame('F1'), 24]];
const cam2 = (f: number): Cam => ({ pos: sampleV(C2_POS, f) as V3, tgt: halfFollow(f, 3.0, 0.6), lens: sample(LENS2, f) });
// 镜头 3 #212：#212 在 5 格矮墙围着的小屋里，南墙比他脚底高 3 米、东边的墙矮。机位在屋子东南、大道上空（离 B 18 米、比他脚底高 9.5 米，越过东边矮墙看得见屋里）往西北看：
//   他从机位右前方飞过、从画面右上角落进来（P6 → B 这一跳横着过画面），落在箱子跟前；看点从他和 B 之间收到 B（只跟三分之一，人在画面里看得出在动），
//   落地后看点停在 B、开箱时慢慢推近；转身往西一跳往左上飞远，看点再跟一半多、焦距放开一点
const C3_POS: VKey[] = [
  [windows[2].起, G4(-952.0, -38.5, 205.0)],
  [windows[2].止, G4(-953.5, -38.7, 204.5)],
];
const torsoOnB = torsoAt(jumpBuild.landFrame('B') + 1);
const FOLLOW3: Key[] = [[windows[2].起, 0.35], [jumpBuild.landFrame('B'), 0], [jumpBuild.takeoffFrame('B'), 0], [windows[2].止, 0.6]];
const LENS3: Key[] = [[windows[2].起, 28], [jumpBuild.landFrame('B'), 28], [jumpBuild.takeoffFrame('B') - 6, 36], [windows[2].止, 32]];
const cam3 = (f: number): Cam => {
  const torso = torsoAt(f);
  const k = sample(FOLLOW3, f);
  return { pos: sampleV(C3_POS, f) as V3, tgt: [0, 1, 2].map((c) => lerp(torsoOnB[c], torso[c], k)) as V3, lens: sample(LENS3, f) };
};

export const camera = (cutFrame: number): Cam => {
  const i = cutPlan.indexAt(cutFrame);
  const frame = storyFrame(cutFrame);
  return i === 0 ? cam1(frame) : i === 1 ? cam2(frame) : cam3(frame);
};
// 核对、声音用
export const timing = { 窗: windows, firstFrames: cutPlan.firstFrames };
