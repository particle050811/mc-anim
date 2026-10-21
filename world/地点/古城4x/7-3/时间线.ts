// 第 7 章第 3 场「墙头追逐」的整场时间线：三段是同一条连续剧情时间轴（T，秒）上前后相接的三截。
// T = 0 是 7-1-7 末帧（契约 古城4x布局.ts 的 `handoffs.七三首`），7-3-1 第 0 帧是它的下一帧（T = 1/24，同 7-1 的段界规矩：不共用帧）。
// 段界放在切镜头的那一刻，一个镜头不拆进两段。人、马、监守者、特效全是 T 的函数（戏.ts），各段只管机位和声音。
//
// 编排（用户 10-19：马一路往前、抄近路，监守者绕远路；迫击炮只在近处放；不回合制，一方出手时另一方也在动）：
//   7-3-1 马在北墙头一拨头朝东、一跃 32 米跨过墙头的豁口，它随即从墙脚下冲出去钻城门洞上台阶；刘心忠在半空回身往它身上甩一炮，落地回身又一炮。
//   7-3-2 第二炮炸在刚冒上墙头、站定蓄音爆的它身上；马再一跃上塔，落上塔顶时刘心忠回身甩第三炮，它边蓄边沿墙头冲向塔脚。
//   7-3-3 第三炮炸在冲过来的它身上，它冲出烟团、到塔脚刹住，杖一推出护盾，它当场放出音爆，同一刻黄叛在高台上开鼓风机一箭钉在它身上；音爆穿过护盾打中他，
//     马被冲得在塔顶横滑，他稳住、拨马一跃下到墙外大道往东冲（硬切 7-4-1）。音爆前后慢到 1/4（用户 10-19 定：保留音波慢放特写，变速在 7-3-3/编排.ts）。
import { FPS, horseStart, towerTop, wallTopEast, avenue } from './几何.ts';
import { leapApex, leapFrom, towerBrakeSec, knockSlide, wardenRouteToHold, wardenRouteToTower, wardenStairTopS, horseChaseSpeed, horseAccel } from './追逐.ts';
import { G4 } from '../../古城4x.tsx';
import { STEED } from '../../../生物/幽灵马.tsx';
import { scene73 } from '../布局.ts';
export { FPS };

// ---------- 马（场时刻 T，秒） ----------
// 开场马朝北站在落点上：0.3 秒拨头朝东，一跃落到墙头东段，2 帧后再一跃上塔顶西沿，按落地的水平速度刹住
export const turnEastT = 0.02;
export const turnEastSec = 0.3;
export const leap1 = leapFrom(horseStart, wallTopEast, leapApex.一, turnEastT + turnEastSec + 0.03, FPS);
export const leap1T = leap1.f0 / FPS;
export const leap1LandT = leap1T + leap1.T;
export const leap2 = leapFrom(wallTopEast, towerTop, leapApex.二, leap1LandT + 2 / FPS, FPS);
export const leap2T = leap2.f0 / FPS;
export const leap2LandT = leap2T + leap2.T;
export const towerStopT = leap2LandT + towerBrakeSec;
const towerDir = [towerTop[0] - wallTopEast[0], towerTop[1] - wallTopEast[1]];
const towerDirLen = Math.hypot(towerDir[0], towerDir[1]);
// 刹住的地方：落地水平速度匀减到 0
export const towerStop = [towerTop[0] + ((towerDir[0] / towerDirLen) * leap2.horizSpeed * towerBrakeSec) / 2, towerTop[1] + ((towerDir[1] / towerDirLen) * leap2.horizSpeed * towerBrakeSec) / 2, towerTop[2]] as [number, number, number];

// ---------- 迫击炮（三发，都在离它十来米以内放）----------
// 第一发：第一跃刚起跳，刘心忠在半空回身打墙脚下刚起步的它；第二发：第一跃落地回身打刚冒上墙头的它；第三发：落上塔顶回身打冲过来的它
export const mortarFireTs = [leap1T + 0.07, leap1LandT + 0.03, leap2LandT + 0.03];
// 弹道飞几刻（null = 取出手速度最接近 mortarShotSpeed 的）。第一发隔着墙沿往墙外打，4 刻那条擦到墙沿，取 5 刻（方块.py 逐刻查过）
export const mortarTicks: (number | null)[] = [5, null, null];

// ---------- 监守者 ----------
// 马一起跳它就冲（0.18 秒反应），钻城门洞上墙头，追到马刚跳走的地方站定蓄音爆（原版放音爆时站着不动）；
// 马在半空没有动静，落上塔顶那一下它才扑过去（原版监守者靠振动找人），冲到塔脚刹住当场放出（用户 10-19 要看到它冲过来再放）。
// 起跑早于 0.18 会在马落到墙头东段之前就追到落点
const liuEyeHeight = STEED.riderHeight + 1.62;
export const wardenRunT = leap1T + 0.18;
export const wardenStairTopT = wardenRunT + wardenRouteToHold.timeAtS(wardenStairTopS);
export const wardenHoldT = wardenRunT + wardenRouteToHold.total;
export const wardenRun2T = leap2LandT + 0.05;
export const wardenArriveT = wardenRun2T + wardenRouteToTower.total;

// ---------- 音爆、护盾、黄叛一箭（7-3-3）----------
// 原版 SonicBoom 第 34 刻（1.7 秒）放出、整个动作 3 秒；冲到塔脚刹住那一刻放出，往前倒推 1.7 秒在墙头站定时开始蓄，冲的时候接着蓄（用户 10-18：能边走边蓄）
export const sonicBoomFireT = wardenArriveT;
export const hitT = sonicBoomFireT;
export const sonicBoomStartT = sonicBoomFireT - 1.7;
if (sonicBoomStartT < wardenStairTopT - 0.1) throw new Error('7-3：音爆还没上墙头就开始蓄了');
export const shieldT = hitT - 0.2; // 杖一推就出（不举杖、不喊，用户 10-18 嫌前摇拖节奏）
// 黄叛那一箭（风矢，每一箭都开鼓风机，用户 10-19）和音爆同一刻钉中：两边同时打中对方
export const huangArrowHitT = hitT + 0.01;
export const huangDrawSec = 0.6;
// 黄叛射完放下弓，一蹲一跳往东走（去 7-4-1 的传送门顶）
export const huangLeapT = hitT + 0.75;

// ---------- 挨了音爆：横滑、稳住、一跃下墙 ----------
// 击退方向 = 它胸口（脚底 + 1.6）到他眼睛的方向，水平分量越小滑得越近（追逐.ts 的 knockSlide）
const wardenEnd = scene73.wardenRoute[scene73.wardenRoute.length - 1];
const wardenEndScene = G4(wardenEnd[0], wardenEnd[2], wardenEnd[1]);
const knockVec = [towerStop[0] - wardenEndScene[0], towerStop[1] - wardenEndScene[1], towerStop[2] + liuEyeHeight - wardenEndScene[2] - 1.6];
const knockHoriz = Math.hypot(knockVec[0], knockVec[1]);
export const knockHorizFraction = knockHoriz / Math.hypot(knockHoriz, knockVec[2]);
export const knockDir = [knockVec[0] / knockHoriz, knockVec[1] / knockHoriz];
const slide = knockSlide(knockHorizFraction);
export const slideEnd = [towerStop[0] + knockDir[0] * slide, towerStop[1] + knockDir[1] * slide, towerStop[2]] as [number, number, number];
export const steadyT = hitT + 0.5; // 稳住
export const turnDownSec = 0.35; // 拨马头朝大道
export const leap3 = leapFrom(slideEnd, avenue, leapApex.三, steadyT + turnDownSec + 0.03, FPS);
export const leap3T = leap3.f0 / FPS;
export const leap3LandT = leap3T + leap3.T;
// 落地顺大道往东冲：从落地的水平速度加到全速
export const gallopAccelSec = (horseChaseSpeed - leap3.horizSpeed) / horseAccel;

// ---------- 分段（段界 = 切镜那一刻） ----------
// 7-3-1 收在第一跃落地、刘心忠回身甩出第二炮之后；7-3-2 收在马上了塔顶刹住；7-3-3 收在马落到大道冲起来（再往后它出画、硬切 7-4-1）
// 帧数是剧情帧；7-3-3 有慢放，成片帧数是 7-3-3/编排.ts 的 END
const seg1EndT = mortarFireTs[1] + 0.12;
const seg2EndT = towerStopT + 0.04;
const seg3EndT = leap3LandT + 0.45;
const toFrame = (T: number) => Math.round(T * FPS);
const startFrame0 = 1;
export const segments = [
  { id: '7-3-1', 名: '墙头', frameCount: toFrame(seg1EndT) - startFrame0 },
  { id: '7-3-2', 名: '上塔', frameCount: toFrame(seg2EndT) - toFrame(seg1EndT) },
  { id: '7-3-3', 名: '音波', frameCount: toFrame(seg3EndT) - toFrame(seg2EndT) + 1 },
] as const;
export type SegmentId = (typeof segments)[number]['id'];
export const segmentStartFrame: Record<SegmentId, number> = (() => {
  const out = {} as Record<SegmentId, number>;
  let frameAcc = startFrame0;
  for (const seg of segments) {
    out[seg.id] = frameAcc;
    frameAcc += seg.frameCount;
  }
  return out;
})();
export const frameCountOf = (segId: SegmentId) => segments.find((s) => s.id === segId)!.frameCount;
export const tAt = (segId: SegmentId, f: number) => (segmentStartFrame[segId] + f) / FPS;
export const segmentStartT = (segId: SegmentId) => segmentStartFrame[segId] / FPS;
export const segmentEndT = (segId: SegmentId) => (segmentStartFrame[segId] + frameCountOf(segId) - 1) / FPS;

// ---------- 台词：这一场没有台词 ----------
const estimateSec = (text: string) => text.replace(/[，。！？、…—「」]/g, '').length / 4.5;
export const dialogue: Record<string, { T: number; 文: string }> = {};
export const lineDuration = (id: keyof typeof dialogue) => estimateSec(dialogue[id].文);
export const lineStartFrame = (segId: SegmentId, id: keyof typeof dialogue) => Math.round((dialogue[id].T - segmentStartT(segId)) * FPS);
