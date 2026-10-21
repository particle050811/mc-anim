// 6-4-6 追来、6-4-7 贪功两段共用的追兵戏（古城4x）：二人从传送门一路强者跳过来、落进场子、站住说话，6-4-7 刘心忠一跳踩下去。
// 两段和 6-4-5 一条时钟：追兵钟 τ = 秒，从 6-4-5 第 0 帧起。6-4-5 → 6-4-6 → 6-4-7 都是硬切、不共用帧（用户 10-18 定的段界规矩），后一段第 0 帧是前一段末帧的下一刻：
//   6-4-6 第 f 帧 τ = (6-4-5 帧数 + 砍头 + f) / 24；6-4-7 第 f 帧 τ = (6-4-5 帧数 + 砍头 + 6-4-6 帧数 + f) / 24。
//   砍头：6-4-6 开头 14 帧二人在城心大殿里、巷子的洞顶把他们整个挡住（机位怎么挪都看不到），用户 10-19 让挪机位或删挡的，这里直接从他们出来那一刻起；那 14 帧追兵在画外。
// 地点、落点、离地都在 ../古城4x布局.ts（`pursuerPath`、`liuXinzhongPursuitPath`、`pursuerStops`、`liuXinzhongStompPoint`、`huangPanLanding647`、`shrieks.第三次` / `第四次`、`handoffs.pursuerStart` / `六四八首`）。
//
// 戏：
//   - 李樱跳走以后，6-4-5 第 4.92 秒黄叛从传送门框底梁、刘心忠从门西边的高台同时起跳（`handoffs.pursuerStart`），各五跳、约 160 米、7.1 秒，最后越过场子东墙落进场子。
//     黄叛先落地，落地的振动 2 刻到感测体 (−850,−51,226)、再 5 刻到尖啸体 (−855,−51,227)：第三次尖啸。刘心忠晚 0.3 秒落在他北边，那个感测体已经在抖、不收，第三次只是黄叛这一下（振动链.ts 逐个算的，不是照脚本让它叫）。
//   - 二人刹住站定、扭头看尖啸体；黄叛起疑「等一下刘兄，你不觉得这个结构……有些奇怪吗？」。站着说话不走动（走在幽匿块上每一步都发振动，见布局文件 `pursuerStops`）。
//   - 6-4-7 刘心忠「管他的……」，话没说完就往西一跳（离地 7、11 米），落地那一下踩在幽匿块上：振动 3 刻到感测体 (−868,−51,218)、1 刻到尖啸体 (−869,−51,218)，第四次尖啸。
//     离第三次 11 秒，过了警告的 10 秒冷却（布局说老版只有 8.5 秒，不够）。黄叛跟着一跳，落在第四次以后（冷却里，只有咔嗒）。
//   - 二人落地后往西慢慢走（1.6 米/秒），6-4-7 末帧 = 第四次尖啸后 1.0 秒，位置、速度照 `handoffs.六四八首`。
// 和游戏不一样的（照旧）：警告次数照脚本数（原版每个玩家各记各的）；6-4-3 那次和这两次尖啸后 90 刻的回应（黑暗、低吼）不演。
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { walkPose } from '../../../../world/角色/追兵.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import { crouchPose, landPose, mixPose, takeoffPose, yawTo } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import * as K3 from '../6-4-3/编排.ts';
import * as K645 from '../6-4-5/编排.ts';
import {
  vanilla, elite, eliteLeap, handoffs, pursuerPath, pursuerApexHeights, liuXinzhongPursuitPath, liuXinzhongApexHeights, liuXinzhongStartDelaySec, pursuerStops, liuXinzhongStompPoint, liuXinzhongStompApex, huangPanLanding647,
  shrieks, allWool, footOf, withHang, type BlockPos, type 跳,
} from '../../../../world/地点/古城4x/布局.ts';
import { buildEliteRoute, eliteAirPose } from './走位.ts';
import { computeChain, cellKey } from './振动链.ts';

export const FPS = 24;
// ---------- 段长、时钟 ----------
// 黄叛那句说完只留 0.4 秒（站着不动）；第三、四次尖啸隔 10.9 秒（> 10 秒冷却，振动链在下面自己核）
export const headTrim646 = 14;
export const frameCount646 = 278;
export const frameCount647 = 157; // 末帧 = 第四次尖啸后 1.0 秒
export const τ646 = (f: number) => (K645.frameCount + headTrim646 + f) / FPS;
export const τ647 = (f: number) => (K645.frameCount + headTrim646 + frameCount646 + f) / FPS;
export const startSec647 = τ647(0);
const endSec647 = τ647(frameCount647 - 1);

// ---------- 6-4-6：两路强者跳 ----------
export const huangRoute = buildEliteRoute(pursuerPath, pursuerApexHeights, handoffs.pursuerStart.relSec645, pursuerStops.黄, '黄');
export const liuRoute = buildEliteRoute(liuXinzhongPursuitPath, liuXinzhongApexHeights, handoffs.pursuerStart.relSec645 + liuXinzhongStartDelaySec, pursuerStops.刘, '刘');

// ---------- 6-4-7：刘心忠一跳踩下去，黄叛跟一跳 ----------
const cellCenter = ([x, y, z]: BlockPos): V3 => G4(x + 0.5, y + 0.5, z + 0.5);
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 第四次尖啸 = 6-4-7 末帧前 衔接.六四八首.尖啸后秒；刘心忠落地到尖啸 = 两段振动各飞 floor(距离) 刻
export const fourthShriekSec = endSec647 - handoffs.六四八首.尖啸后秒;
const stompDelay = (Math.floor(dist(liuXinzhongStompPoint, cellCenter(shrieks.第四次感测体))) + Math.floor(dist(cellCenter(shrieks.第四次感测体), cellCenter(shrieks.第四次)))) / 20;
export const stompSec = fourthShriekSec - stompDelay;
const liuStompJumpRaw = eliteLeap(footOf(pursuerStops.刘), liuXinzhongStompPoint, liuXinzhongStompApex);
// 踩的这一跳顶点停得最久（`withHang` 第 4 档），落下来最快、最重；跟跳停得短
export const liuStompJump: 跳 = withHang(eliteLeap(footOf(pursuerStops.刘), liuXinzhongStompPoint, liuXinzhongStompApex, (stompSec - liuStompJumpRaw.T) * FPS, FPS), 4);
// 黄叛：比第四次晚一点落地（冷却里），蹲 0.25 秒，再起步往西走、到末帧正好 1.6 米/秒走到 衔接.六四八首.黄
const huangWalkSec = (2 * dist(huangPanLanding647, handoffs.六四八首.黄)) / handoffs.六四八首.walkSpeed; // 从 0 匀加速到 1.6 米/秒走完这一截
const huangLandSec = endSec647 - huangWalkSec - elite.landingSquatSec;
const huangJumpRaw = eliteLeap(footOf(pursuerStops.黄), huangPanLanding647, liuXinzhongStompApex);
export const huangFollowJump: 跳 = withHang(eliteLeap(footOf(pursuerStops.黄), huangPanLanding647, liuXinzhongStompApex, (huangLandSec - huangJumpRaw.T) * FPS, FPS), 2);
// 刘心忠：重重一踩，蹲 0.2 秒，然后同样匀加速走到 衔接.六四八首.刘
const liuCrouchSec = 0.2;
const liuWalkSec = (2 * dist(liuXinzhongStompPoint, handoffs.六四八首.刘)) / handoffs.六四八首.walkSpeed;
const liuWalkStartSec = endSec647 - liuWalkSec;

// ---------- 振动链（两段一起算） ----------
const cooldownUntil = (K3.shriek ? K3.shriek.t - K3.storySecAt(K645.startGlobalFrame) : -99) + vanilla.warningCooldownSec; // 第二次尖啸（6-4-3 挥刀）的冷却
export const chain = computeChain(
  [
    ...huangRoute.振动,
    ...liuRoute.振动,
    { 名: '刘心忠踩', t: stompSec, p: liuXinzhongStompPoint },
    { 名: '黄叛跟跳落地', t: huangFollowJump.f1 / FPS, p: huangFollowJump.p1 },
  ],
  cooldownUntil,
  Object.values(allWool),
);
const found3 = chain.尖啸们.find((s) => cellKey(s.体) === cellKey(shrieks.第三次));
const found4 = chain.尖啸们.find((s) => cellKey(s.体) === cellKey(shrieks.第四次));
// 振动链只该叫这两次、第四次正好落在编排排的时刻（不然是改了落点、时刻以后链变了，要回头看）
if (!found3 || !found4 || Math.abs(found4.t - fourthShriekSec) > 1e-6 || chain.尖啸们.length !== 2)
  throw new Error(`6-4-6/6-4-7 振动链和编排对不上：${JSON.stringify(chain.尖啸们.map((s) => [cellKey(s.体), s.t.toFixed(3)]))}`);
export const thirdShriek = found3;
export const fourthShriek = found4;
export const thirdShriekSec = thirdShriek.t;

// ---------- 姿势 ----------
const walk = (loc: V3, yaw: number, phase: number, amp: number) => walkPose(loc, yaw, phase, amp, 0);
const west = yawTo(-1, 0);
// 6-4-7：站定 → 起跳蓄力 → 空中 → 落地蹲 → 匀加速往西走（相位按走过的路，每米 4 弧度，同 6-4-8）
const pose647 = (τ: number, leap: 跳, crouchSec: number, walkStartSec: number, target: V3, standPose: FigurePose, crouchDepth = 1): FigurePose => {
  const frame = τ * FPS;
  if (frame < leap.f0 - elite.takeoffCrouchSec * FPS) return standPose;
  if (frame < leap.f0) return mixPose(standPose, takeoffPose(leap.p0, leap.yaw, (frame - (leap.f0 - elite.takeoffCrouchSec * FPS)) / (elite.takeoffCrouchSec * FPS)), Math.min(1, (frame - (leap.f0 - elite.takeoffCrouchSec * FPS)) / 3));
  if (frame < leap.f1) return eliteAirPose(leap, frame);
  const sinceLand = τ - leap.f1 / FPS;
  if (τ < walkStartSec || sinceLand < crouchSec) {
    const k = Math.min(1, sinceLand / Math.max(crouchSec, 0.01));
    const depth = crouchDepth * (k < 0.3 ? 0.7 + 0.3 * (k / 0.3) : 1 - 0.6 * ((k - 0.3) / 0.7));
    const yaw = leap.yaw + (west - leap.yaw) * Math.min(1, sinceLand / 0.5);
    return sinceLand < crouchSec ? landPose(leap.p1, leap.yaw, sinceLand * FPS, crouchSec * FPS, 0.4) : crouchPose(leap.p1, yaw, Math.max(0, depth), 0);
  }
  // 匀加速：路程 = ½ a u²，到末帧速度 = 步速
  const walkElapsed = τ - walkStartSec;
  const walkDuration = endSec647 - walkStartSec;
  const accel = handoffs.六四八首.walkSpeed / walkDuration;
  const walkDist = 0.5 * accel * walkElapsed * walkElapsed;
  const totalDist = dist(leap.p1, target);
  const k = walkDist / totalDist;
  const loc: V3 = [leap.p1[0] + (target[0] - leap.p1[0]) * k, leap.p1[1] + (target[1] - leap.p1[1]) * k, leap.p1[2]];
  const speed = accel * walkElapsed;
  return walk(loc, west, walkDist * 4, Math.min(1, speed / 1.0));
};
export const huangPanPose = (τ: number, standPose?: (loc: V3, yaw: number) => FigurePose): FigurePose => {
  if (τ < huangFollowJump.f0 / FPS - elite.takeoffCrouchSec) return huangRoute.pose(τ, standPose);
  return pose647(τ, huangFollowJump, elite.landingSquatSec, huangFollowJump.f1 / FPS + elite.landingSquatSec, handoffs.六四八首.黄, huangRoute.pose(huangFollowJump.f0 / FPS - elite.takeoffCrouchSec, standPose));
};
export const liuXinzhongPose = (τ: number, standPose?: (loc: V3, yaw: number) => FigurePose): FigurePose => {
  if (τ < liuStompJump.f0 / FPS - elite.takeoffCrouchSec) return liuRoute.pose(τ, standPose);
  return pose647(τ, liuStompJump, liuCrouchSec, liuWalkStartSec, handoffs.六四八首.刘, liuRoute.pose(liuStompJump.f0 / FPS - elite.takeoffCrouchSec, standPose), 1.15);
};
export { west as 朝西 };
