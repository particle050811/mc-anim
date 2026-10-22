// 6-4-6 追来：二人从传送门一路强者跳过来，越过场子东墙落进场子，落地的振动踩响第三次尖啸，黄叛起疑。
// 强者跳（追兵.ts、走位.ts：用户 10-18 定人跑跳 30 米/秒，一跳 32～40 米、1.1～1.5 秒；10-13 嫌原版疾跑跳太矮太近），镜头要让人看清一跳有多高多远：
// 侧面低机位跟拍、拉开到看得见建筑做比例，不俯拍。
// 6-4-5 → 6-4-6 硬切（两处隔 200 米）：本段第 0 帧时二人刚起跳 1.25 秒（开头砍掉的 14 帧见 追兵.ts 的 `headTrim646`），第一跳正落下、0.3 秒后起第二跳。
// 四镜（段内秒）：
//   1. 0～切B：大道南边巷子里：二人一跳四十米从远处楼顶一路朝镜头飞来（中间交叉一次），落在镜头前十来米，
//      再蹿向场子东墙头、从镜头北边头顶掠过，镜头往左摇着跟，他们飞过头顶就切。0.6 秒刘心忠在半空喊「那家伙果然是怕了我们，居然逃了！」。
//   2. 切B～切C：场子南半边、东墙西南 18 米、离地 6 米，侧面看最后一跳：二人先后落上墙头、一蹲，再从墙头往下扑进场子，从镜头前落地（落地一蹲卸力、滑一两步刹住）。
//   3. 切C～切D：黄叛落地 0.6 秒后，二人脚边的尖啸体 (−855,−51,227) 喷声波环（第三次，振动链见 追兵.ts），切到尖啸体西边往东看：前景尖啸体喷声波环，二人在后面扭头低头看过来。
//   4. 切D～末：黄叛开口前一刻切刘心忠的越肩、黄叛的近景：「等一下刘兄，你不觉得这个结构……有些奇怪吗？」，刘心忠看着他。末帧 = 6-4-7 首帧。
// 机位对着新世界的方块逐帧核过（工具/机位核对：机位那格是空气、到二人的视线不挡）。
import { type Key, type VKey, sample, sampleV, track } from '../../../engine/anim/anim.ts';
import type { V3 } from '../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../world/角色/骨架.tsx';
import { G4 } from '../../../world/地点/古城4x.tsx';
import type { Cam } from '../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { shrieks } from '../../../world/地点/古城4x/布局.ts';
import * as K645 from '../../场/6-古城/6-4-5/编排.ts';
import { FPS, τ646, frameCount646, headTrim646, huangPanPose, liuXinzhongPose, huangRoute, liuRoute, thirdShriekSec, chain } from '../../场/6-古城/6-4-6/追兵.ts';
import { lookToward } from '../../场/6-古城/6-4-6/走位.ts';
import { lineTable } from '../../../world/配音/台词轨.tsx';

export { FPS };
export const frameCount = frameCount646;
export const τ = τ646;
// 第三次尖啸（段内秒）：振动链算出来的
export const shriekSec = thirdShriekSec - τ(0);
export const shriekerPos: V3 = G4(shrieks.第三次[0] + 0.5, shrieks.第三次[1], shrieks.第三次[2] + 0.5);
export const shriekSource: V3 = [shriekerPos[0], shriekerPos[1], shriekerPos[2] + 0.5];
const huangLandSec = huangRoute.landSec - τ(0);
// 台词落点（段内帧，A8 字幕读这里）：刘心忠「那家伙果然是怕了我们……」0.6 秒，黄叛那句在第三次尖啸后 0.9 秒开口
export const hurryLineSec = lineTable['6-4-6-刘心忠-怕了我们'].有声长;
export const strangeLineStart = shriekSec + 0.9;
export const lines = {
  怕了我们: { id: '6-4-6-刘心忠-怕了我们', 帧: 0.6 * FPS },
  结构奇怪: { id: '6-4-6-黄叛-结构奇怪', 帧: strangeLineStart * FPS },
} as const;

// ---------- 二人 ----------
// 看：尖啸那一下二人扭头看尖啸体（反应 0.3 秒）；黄叛说话时左右打量（先南边的中央台、再北墙头），刘心忠看着黄叛
const lookShriekWeight = (t: number) => track([[shriekSec + 0.25, 0], [shriekSec + 0.6, 1], [strangeLineStart + 0.3, 1], [strangeLineStart + 0.8, 0]], t);
const huangLookLeft: V3 = G4(-874, -46, 232); // 中央台
const huangLookRight: V3 = G4(-866, -42, 211); // 北墙头
export const pursuers = (frame: number): { 刘: FigurePose; 黄: FigurePose } => {
  const t = frame / FPS;
  const chaseSec = τ(frame);
  let huang = huangPanPose(chaseSec);
  let liu = liuXinzhongPose(chaseSec);
  if (t > huangLandSec) {
    huang = lookToward(huang, huangLookLeft, track([[strangeLineStart + 0.4, 0], [strangeLineStart + 1.0, 1], [strangeLineStart + 2.0, 1], [strangeLineStart + 2.4, 0]], t), 0.3);
    huang = lookToward(huang, huangLookRight, track([[strangeLineStart + 2.2, 0], [strangeLineStart + 2.7, 1], [frameCount / FPS, 1]], t), 0.3);
    huang = lookToward(huang, shriekerPos, lookShriekWeight(t), 0.5);
    liu = lookToward(liu, shriekerPos, lookShriekWeight(t), 0.5);
    liu = lookToward(liu, [huang.loc[0], huang.loc[1], huang.loc[2] + 0.2], track([[strangeLineStart + 0.5, 0], [strangeLineStart + 1.0, 1]], t), 0.4);
    // 站着说话别定格：落地 1 秒后起两人都有呼吸（上身 ±0.8°、两臂 ±1.5°，周期和相位各自不同），
    // 黄叛说到「这个结构」时右手抬起来往四周比划一下（2.2 秒），刘心忠重心在两脚间慢慢换一下（身子拧 ±2.5°）
    const breathWeight = Math.min(1, Math.max(0, t - huangLandSec - 1) / 0.8);
    const breathe = (period: number, phase: number) => breathWeight * Math.sin((2 * Math.PI * t) / period + phase);
    const gesture = track([[strangeLineStart + 0.9, 0], [strangeLineStart + 1.4, 1], [strangeLineStart + 2.6, 1], [strangeLineStart + 3.2, 0]], t);
    huang = { ...huang, pitch: huang.pitch - 0.8 * breathe(3.1, 0), armL: huang.armL + 1.5 * breathe(3.1, 0.4), armR: huang.armR + 1.5 * breathe(3.1, 0.4) + 42 * gesture + 8 * gesture * Math.sin(t * 3.2), armRRoll: (huang.armRRoll ?? 0) - 18 * gesture };
    liu = { ...liu, pitch: liu.pitch - 0.8 * breathe(3.6, 1.7), armL: liu.armL + 1.5 * breathe(3.6, 2.1), twist: (liu.twist ?? 0) + 2.5 * breathe(5.5, 0.3) };
  }
  return { 刘: liu, 黄: huang };
};

// ---------- 振动、感测体（画面.tsx 画） ----------
export const vibrations = chain.vibrations;
export const activatedAt = chain.激活;

// ---------- 机位 ----------
// 切在二人从镜头头顶掠过的半空里（黄叛蹿向东墙头那一跳过了镜头所在的 x）
export const cutB = 4.4 - headTrim646 / FPS;
// 镜 1：目标是二人中点
const midpoint = (frame: number): V3 => {
  const poses = pursuers(frame);
  return [(poses.刘.loc[0] + poses.黄.loc[0]) / 2, (poses.刘.loc[1] + poses.黄.loc[1]) / 2, (poses.刘.loc[2] + poses.黄.loc[2]) / 2];
};
// 第三跳落在镜头东边十来米，第四跳从镜头北边、头顶上 6 米多掠过去；两边的楼一直在画里做比例。开头他们在七八十米外，长焦起、跟着拉广。
// 他们远的时候在楼顶上跳，机位贴地就全被巷子两边的楼挡住：开头机位升在离地 11 米（还不高过他们，不俯拍），
// 他们跳近了再降回巷子里离地 1.9 米（降的时机按 工具/机位核对 逐帧量的：哪段高度两人都不被楼挡）。
// 这两张表的帧是砍头前的帧号（本段帧 + `headTrim646`），机位、焦距照旧
const A_POS: VKey[] = [[0, G4(-812, -40, 238)], [40, G4(-812, -44, 233)], [70, G4(-812, -44.5, 232.5)], [94, G4(-812.5, -49.1, 232.5)]];
// 焦距按两人一直都在画里取（两人隔开最远时夹角 31°），够长才看得清是两个人
const A_LENS: Key[] = [[0, 62], [1.0 * FPS, 62], [2.0 * FPS, 64], [2.5 * FPS, 50], [3.25 * FPS, 32], [4.0 * FPS, 16], [4.4 * FPS, 15]];
// 镜 2：弹道从画面右上划到左边落地；镜头跟着二人中点（前后 3 帧平均，免得一跳一顿），目标压在他们和地面中间，墙、地面、人一直都在画里。
// 离地 6 米：再低，二人跳上东墙头之前都在墙后面
const B_POS: V3 = G4(-851, -45, 241);
// 二人在墙外 30～40 米时要看清是谁在跳，所以焦距 36 起（再广只有几个像素大）
const B_LENS: Key[] = [[cutB * FPS, 36], [(huangLandSec - 1.4) * FPS, 30], [huangLandSec * FPS, 24]];
// 镜 3：第三次尖啸体在二人脚边（黄叛西边 2 格、刘心忠南边 3 格）。机位在尖啸体西边 6 米、离地 2.7 米往东看：
// 尖啸体在前景地上、声波环从它身上往上飘，二人在它后面扭头低头看过来（看得到脸）；慢慢推一点。
// 尖啸体南边贴着一堆碎石（−855,−50～−49,228～230），机位再往南、往西南就被它挡（工具/机位核对/核对.py --试 量过）
export const cutC = shriekSec - 0.1;
//   看点偏北（左）一点、26mm 起：那堆碎石刚好在画面右边以外
const C_POS: VKey[] = [[cutC * FPS, G4(-860.3, -48.3, 226.6)], [frameCount - 1, G4(-859.8, -48.35, 226.4)]];
const C_TGT: VKey[] = [[cutC * FPS, G4(-854.0, -49.8, 224.6)], [(strangeLineStart + 1) * FPS, G4(-853.9, -49.6, 224.6)], [frameCount - 1, G4(-853.8, -49.5, 224.7)]];
const C_LENS: Key[] = [[cutC * FPS, 26], [frameCount - 1, 28]];
// 镜 4（用户 10-13 嫌二人站着说话 9 秒多一个画面僵）：刘心忠的越肩、黄叛的近景，机位在刘心忠西北、离地 1.6 米，越过他的右肩看黄叛的脸，
// 黄叛说话时左右打量（先南边的中央台、再北墙头）都对着镜头这边；机位慢慢往北绕一点。6-4-7 开头再反打刘心忠（6-4-7/编排.ts）。
export const cutD = strangeLineStart - 0.15;
const D_POS: VKey[] = [[cutD * FPS, G4(-856.6, -49.35, 225.7)], [frameCount - 1, G4(-856.4, -49.35, 226.2)]]; // 刘心忠的肩只占画面左边一条
const D_LENS: Key[] = [[cutD * FPS, 30], [frameCount - 1, 33]];
const huangHead = (frame: number): V3 => {
  const loc = pursuers(Math.min(frame, frameCount - 1)).黄.loc;
  return [loc[0], loc[1], loc[2] + 1.45];
};
const smoothMidpoint = (frame: number): V3 => {
  const sum: V3 = [0, 0, 0];
  for (let k = -3; k <= 3; k++) {
    const mid = midpoint(frame + k);
    for (let i = 0; i < 3; i++) sum[i] += mid[i] / 7;
  }
  return sum;
};
export const camera = (frame: number): Cam => {
  const t = frame / FPS;
  if (t < cutB) {
    const mid = smoothMidpoint(frame);
    return { pos: sampleV(A_POS, frame + headTrim646) as V3, tgt: [mid[0], mid[1], mid[2] + 1.2], lens: sample(A_LENS, frame + headTrim646) };
  }
  if (t < cutC) {
    const mid = smoothMidpoint(frame);
    const groundZ = G4(0, -51, 0)[2];
    return { pos: B_POS, tgt: [mid[0], mid[1], (mid[2] + groundZ) / 2 + 1.4], lens: sample(B_LENS, frame) };
  }
  if (t < cutD) return { pos: sampleV(C_POS, frame) as V3, tgt: sampleV(C_TGT, frame) as V3, lens: sample(C_LENS, frame) };
  return { pos: sampleV(D_POS, frame) as V3, tgt: huangHead(frame), lens: sample(D_LENS, frame) };
};
export const lastCam = camera(frameCount - 1);

// ---------- 李樱 ----------
// 他这时正绕向场子西边的屋顶 V（6-4-5/编排.ts 的 李樱绕行），从场子里往西看偶尔看得到远处一个小人，照他的时刻画
export const liYingPose = (f: number) => K645.detourPose(τ(f));
export const liYingWool = (f: number) => K645.woolAt(τ(f));
