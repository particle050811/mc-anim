// 第 7 章第 3 场「墙头追逐」：整场的戏（人、马、监守者、三发迫击炮、护盾、音爆、黄叛一箭），全是场时刻 T（秒，见 时间线.ts）的函数。
// 接 7-1-7 末帧（契约 ../古城4x布局.ts 的 衔接.七三首）：刘心忠骑幽灵马刚落上场子北墙头，监守者在墙脚下，黄叛在黄叛高台。路线和快慢见 追逐.ts，事件时刻见 时间线.ts。
// 原版依据：
// - 骑着的马（AbstractHorse.tickRidden）每刻把朝向设成骑手的朝向；刘心忠回身打它时扭身、回头，马照跑。
// - 苦力怕迫击炮（铁魔法 Lob Creeper，../../模型/特效/苦力怕迫击炮.tsx）：瞬发，每刻重力 0.05 格/刻²，碰到实体就炸；出手速度用户 10-18 定动画里搞快（追逐.ts 的 `mortarShotSpeed`）、
//   爆炸做大（画面.tsx）。投射物不继承施法者速度。监守者击退抗性 1，炸了照走，只变红一下。
// - 音爆（SonicBoom）第 34 刻放出，一条直线穿过目标、穿墙，无视护甲和护盾，所以护盾术挡不住；用户 10-18 定：边走边蓄、不管 15 格射程。挨打不打断蓄力。
// - 音爆击退：水平 2.5 格/刻 × 方向的水平分量，之后按地面摩擦每刻 × 0.546（追逐.ts 的 `knockAfter`）。
// - 够不着目标（马在塔顶）时原版 MoveToTargetSink 隔 0～40 刻才重新找路：它挨完这一下在塔脚站着，7-3-3 收尾时还没动（下墙绕去城心不演）。
// 和第 1 场的接口：只用 7-1/戏.ts 里跟坐标无关的（游戏秒、马腿相位、箭相对它的位置）；位置全按契约。
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../角色/骨架.tsx';
import { standPose } from '../../../角色/骨架.tsx';
import { drawBowPose, ridePose } from '../../../角色/追兵.tsx';
import { STEED, horseGait, riderFeet, steedRear } from '../../../生物/幽灵马.tsx';
import { shieldPos } from '../../../特效/护盾术.tsx';
import { mortarTrajectory } from '../../../特效/苦力怕迫击炮.tsx';
import { WARDEN, pinToWardenBody, wardenBodyHit, wardenBodyPinAt, wardenBodyPoint, type BodyPin, type WardenFrame } from '../../../生物/监守者.tsx';
import { airPose, landPose, nearYaw, takeoffPose, yawTo } from '../6-4-1/古城戏.ts';
import { bowPointWorld, BOW_ARROW_TIP, bowTextureFor } from '../../../物品/弓.tsx';
import { arena, eliteLeap, leapFeetAt, type 跳 } from '../布局.ts';
import { G4, toGame4 } from '../../古城4x.tsx';
import * as X71 from '../7-1/戏.ts';
import { breathe } from '../7-1/戏/跳.ts';
import type { 弓前风扇 } from '../7-1/弓前风扇.tsx';
import * as geom from './几何.ts';
import * as chase from './追逐.ts';
import * as timeline from './时间线.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const decay = (u: number, timeConst: number) => (u < 0 ? 0 : Math.exp(-u / timeConst));
const yawFromTo = (a: V3, b: V3) => yawTo(b[0] - a[0], b[1] - a[1]);

// 打在监守者身上的伤害（三炮、7-3-3 一箭）和打在刘心忠身上的音爆：数字层（伤害数字层.tsx）和 7-4-1 的血账都用这一份（各数的来历见 伤害数字层.tsx）
export const mortarDamages = [312.6, 287.4, 296.1];
export const arrowDamage = 1584.3;
export const sonicBoomDamage = 156.6;
export const scene1T = (T: number) => X71.sceneEndT + T; // 第 1 场时间轴上的时刻（游戏秒接着走）
export const gameSec = (T: number) => X71.gameSec(scene1T(T));
export const endT = timeline.segmentEndT('7-3-3');
export const horseSec = (T: number) => scene1T(T);

// ======================= 马 =======================
const liuEyeHeight = STEED.riderHeight + 1.62;
const fps = geom.FPS;
const { leap1, leap2, leap3 } = timeline;
const towerDir = (() => {
  const d = [geom.towerTop[0] - geom.wallTopEast[0], geom.towerTop[1] - geom.wallTopEast[1]];
  const n = Math.hypot(d[0], d[1]);
  return [d[0] / n, d[1] / n];
})();
// 落到大道往东冲：从落地的水平速度加到全速
const gallopDist = (u: number) => {
  const a = chase.horseAccel;
  const v0 = leap3.horizSpeed;
  const ua = Math.min(u, timeline.gallopAccelSec);
  return v0 * ua + 0.5 * a * ua * ua + chase.horseChaseSpeed * Math.max(0, u - timeline.gallopAccelSec);
};
const horseMotion = (T: number): { p: V3; v: number; airborne: boolean } => {
  if (T < timeline.leap1T) return { p: geom.horseStart, v: 0, airborne: false };
  if (T < timeline.leap1LandT) return { p: leapFeetAt(leap1, T * fps), v: leap1.horizSpeed, airborne: true };
  if (T < timeline.leap2T) return { p: geom.wallTopEast, v: 0, airborne: false };
  if (T < timeline.leap2LandT) return { p: leapFeetAt(leap2, T * fps), v: leap2.horizSpeed, airborne: true };
  if (T < timeline.towerStopT) {
    const u = T - timeline.leap2LandT;
    const v0 = leap2.horizSpeed;
    const d = v0 * u - (v0 * u * u) / (2 * chase.towerBrakeSec);
    return { p: [geom.towerTop[0] + towerDir[0] * d, geom.towerTop[1] + towerDir[1] * d, geom.towerTop[2]], v: v0 * (1 - u / chase.towerBrakeSec), airborne: false };
  }
  if (T < timeline.leap3T) {
    const slide = T < timeline.hitT ? 0 : chase.knockAfter(timeline.knockHorizFraction, T - timeline.hitT);
    const v = T < timeline.hitT ? 0 : 2.5 * timeline.knockHorizFraction * 20 * chase.knockFriction ** ((T - timeline.hitT) * 20);
    const s = timeline.towerStop;
    return { p: [s[0] + timeline.knockDir[0] * slide, s[1] + timeline.knockDir[1] * slide, s[2]], v, airborne: false };
  }
  if (T < timeline.leap3LandT) return { p: leapFeetAt(leap3, T * fps), v: leap3.horizSpeed, airborne: true };
  const u = T - timeline.leap3LandT;
  return { p: chase.avenueEast(gallopDist(u)), v: Math.min(chase.horseChaseSpeed, leap3.horizSpeed + chase.horseAccel * u), airborne: false };
};
// 不带朝向的眼睛位置（监守者朝哪看用这个，免得马 ↔ 监守者互相调用）
const roughEye = (T: number): V3 => {
  const p = horseMotion(T).p;
  return [p[0], p[1], p[2] + liuEyeHeight];
};
// 腿的相位：照原版按跑过的路程走（每米 1.8），但一秒最多 5 个步子（再快 24 帧的画面里腿就成了乱闪）；腾空时腿不动；原地拨头迈小碎步
const horseLegMaxRate = (2 * Math.PI * 5) / 0.6662;
const wardenLegMaxRate = (2 * Math.PI * 4.5) / 0.8662;
const phaseTable = (rate: (T: number) => number) => {
  const step = 1 / 240;
  const table = [0];
  const lastT = endT + 1;
  for (let t = 0; t < lastT; t += step) table.push(table[table.length - 1] + rate(t + step / 2) * step);
  return (T: number) => {
    const k = Math.min(table.length - 1.001, Math.max(0, T / step));
    const i = Math.floor(k);
    return table[i] + (table[i + 1] - table[i]) * (k - i);
  };
};
// 马（= 骑手）朝向：朝北站着 → 拨头朝东 → 第一跃、第二跃顺着跳的方向 → 塔顶刹住拨过来对着塔脚下的它 → 挨了音爆稳住 → 拨头朝大道 → 第三跃 → 落地转向东
const north = 0;
const east = -90;
const towerFaceSec = 0.45;
const wardenEndPos = (() => {
  const p = chase.wardenRoute.at(chase.wardenRoute.length);
  return G4(p[0], p[2], p[1]);
})();
const faceWardenYaw = nearYaw(leap2.yaw, yawFromTo(timeline.towerStop, wardenEndPos));
const turning = (T: number) =>
  (T >= timeline.turnEastT && T < timeline.turnEastT + timeline.turnEastSec) ||
  (T >= timeline.leap2LandT && T < timeline.leap2LandT + towerFaceSec) ||
  (T >= timeline.steadyT && T < timeline.steadyT + timeline.turnDownSec);
const horseYaw = (T: number) => {
  if (T < timeline.leap1T) return lerp(north, nearYaw(north, leap1.yaw), ss((T - timeline.turnEastT) / timeline.turnEastSec));
  if (T < timeline.leap1LandT) return nearYaw(east, leap1.yaw);
  if (T < timeline.leap2T) return lerp(nearYaw(east, leap1.yaw), nearYaw(east, leap2.yaw), ss((T - timeline.leap1LandT) / (timeline.leap2T - timeline.leap1LandT)));
  if (T < timeline.leap2LandT) return nearYaw(east, leap2.yaw);
  if (T < timeline.leap3T) {
    const face = lerp(nearYaw(east, leap2.yaw), nearYaw(east, faceWardenYaw), ss((T - timeline.leap2LandT) / towerFaceSec));
    return lerp(face, nearYaw(face, leap3.yaw), ss((T - timeline.steadyT) / timeline.turnDownSec));
  }
  if (T < timeline.leap3LandT) return nearYaw(east, leap3.yaw);
  return lerp(nearYaw(east, leap3.yaw), east, ss((T - timeline.leap3LandT) / 0.25));
};
const horseLegPhase = phaseTable((t) => {
  const m = horseMotion(t);
  if (m.airborne) return 0;
  return Math.max(Math.min(1.8 * m.v, horseLegMaxRate), turning(t) ? 6 : 0);
});
const horsePhase0 = X71.horseState(X71.sceneEndT)?.行走.相位 ?? 0;
// 起跳人立（幽灵马.tsx 的 `steedStand`）：连上第 1 场跳墙那一跃（换到本场时刻是负的），三跃
const horseTakeoffs = [...X71.horseTakeoffs.map((t) => t - X71.sceneEndT), timeline.leap1T, timeline.leap2T, timeline.leap3T];
// 打中那一下：马往旁边一晃（衰减）
const sway = (T: number) => (T < timeline.hitT ? 0 : Math.sin((T - timeline.hitT) * 22) * decay(T - timeline.hitT, 0.25));
export const horseState = (T: number) => {
  const m = horseMotion(T);
  const yaw = horseYaw(T) + 6 * sway(T);
  // 摆幅：原版跑起来是 1，越快越夸张（80 米/秒以上 1.5）；腾空 1.2；原地拨头迈小碎步
  const amplitude = m.airborne ? 1.2 : Math.max(horseGait(m.v, 0).幅度 * (1 + 0.5 * ss((m.v - 20) / 60)), turning(T) ? 0.3 : 0);
  return { p: m.p, yaw, entityYaw: yaw + 180, 行走: { 相位: horsePhase0 + horseLegPhase(T), 幅度: amplitude }, 速度: m.v, 腾空: m.airborne, 人立: steedRear(horseTakeoffs, T) };
};
export const liuEye = (T: number): V3 => {
  const horse = horseState(T);
  const feet = riderFeet(horse.p, horse.yaw, horse.人立.骑手);
  return [feet[0], feet[1], feet[2] + 1.62];
};
// 马每一跃的起落（声音用）
export const horseLeaps: 跳[] = [leap1, leap2, leap3];

// ======================= 监守者 =======================
// 墙脚下仰头站着 → 马一起跳就冲：钻城门洞、上台阶，墙头上站定蓄音爆 → 马落上塔顶再冲到塔脚（追逐.ts，时刻见 时间线.ts）→ 塔脚下仰头对着塔顶的马
const toScene = (p: number[]): V3 => G4(p[0], p[2], p[1]);
const wardenTrack = (T: number) => {
  const second = T >= timeline.wardenRun2T;
  const route = second ? chase.wardenRouteToTower : chase.wardenRouteToHold;
  const run = route.run(T - (second ? timeline.wardenRun2T : timeline.wardenRunT));
  const s = Math.min(route.length - 0.6, Math.max(0.6, run.s));
  const ahead = toScene(route.at(s + 0.6));
  const behind = toScene(route.at(s - 0.6));
  return { p: toScene(route.at(run.s)), v: run.v, heading: yawTo(ahead[0] - behind[0], ahead[1] - behind[1]) };
};
const end71 = X71.wardenState(X71.sceneEndT);
const wardenLegPhase = phaseTable((t) => Math.min(4 * wardenTrack(t).v, wardenLegMaxRate));
const mortarHitTs: number[] = [];
const arrowHitTs: number[] = [];
export const wardenState = (T: number) => {
  const sec = gameSec(T);
  const { p: pos, v, heading } = wardenTrack(T);
  const eye = roughEye(T);
  const toLiu = (near: number) => nearYaw(near, yawTo(eye[0] - pos[0], eye[1] - pos[1]));
  // 朝向：开场从 7-1-7 末帧转过去对着马上的人（0.3 秒，身子跟着转）；跑起来 0.15 秒拧到前进方向；站定、到了塔脚 0.3 秒转回来对着他、一直跟着他转
  const startYaw = lerp(end71.entityYaw - 180, toLiu(end71.entityYaw - 180), ss(T / 0.3));
  let yaw = lerp(startYaw, nearYaw(startYaw, heading), ss((T - timeline.wardenRunT) / 0.15));
  yaw = lerp(yaw, toLiu(yaw), ss((T - timeline.wardenHoldT + 0.15) / 0.3));
  yaw = lerp(yaw, nearYaw(yaw, heading), ss((T - timeline.wardenRun2T) / 0.15));
  yaw = lerp(yaw, toLiu(yaw), ss((T - timeline.wardenArriveT + 0.15) / 0.3));
  // 放音爆前 0.35 秒身子拧正对着他（跑的时候也是）
  yaw = lerp(yaw, toLiu(yaw), ss((T - timeline.sonicBoomFireT + 0.35) / 0.25) * (1 - ss((T - timeline.sonicBoomFireT - 0.1) / 0.3)));
  // 抬头看刘心忠（原版生物抬头最多 40°）：跑起来平视
  const head = [pos[0], pos[1], pos[2] + 2.6];
  const elevationDeg = (Math.atan2(eye[2] - head[2], Math.hypot(eye[0] - head[0], eye[1] - head[1])) * 180) / Math.PI;
  const headPitch = lerp(end71.headPitch, -Math.min(40, Math.max(0, elevationDeg)), ss(T / 0.3)) * (1 - ss(v / 20));
  const hurt = [...mortarHitTs, ...arrowHitTs].some((t) => T >= t && T < t + 0.5) ? 1 : 0;
  // 挨箭一抖：往后一仰又回来（不打断蓄力）
  const flinch = arrowHitTs.reduce((sum, t) => sum + (T >= t ? ((T - t) / 0.05) * Math.exp(1 - (T - t) / 0.05) : 0), 0);
  const boom = T >= timeline.sonicBoomStartT && T < timeline.sonicBoomStartT + WARDEN.sonicBoomSec ? T - timeline.sonicBoomStartT : undefined;
  // 冲刺时往前扑（度，绕脚底；画面.tsx 和插着的箭照这个转）
  const lean = 18 * ss(v / 60) - 9 * flinch;
  return { p: pos, entityYaw: yaw + 180 - 6 * flinch, 秒: sec, 行走: { 相位: wardenLegPhase(T) + (end71.行走?.相位 ?? 0), 幅度: Math.min(1, v / 5.7) }, 受伤: hurt, 头偏: lerp(end71.头偏, 0, ss(T / 0.3)), 头仰: headPitch, 音爆: boom, 前倾: lean, 速度: v };
};
// 前倾：绕脚底把身上的点往前进方向转 前倾 度（插着的箭、胸口跟着身子走）
const leanOffset = (warden: { entityYaw: number; 前倾: number }, off: number[]): V3 => {
  const yawRad = ((warden.entityYaw - 180) * Math.PI) / 180;
  const fwd = [-Math.sin(yawRad), Math.cos(yawRad)];
  const lean = (warden.前倾 * Math.PI) / 180;
  const along = off[0] * fwd[0] + off[1] * fwd[1];
  const alongNew = along * Math.cos(lean) + off[2] * Math.sin(lean);
  const up = -along * Math.sin(lean) + off[2] * Math.cos(lean);
  return [off[0] + (alongNew - along) * fwd[0], off[1] + (alongNew - along) * fwd[1], up];
};
export const wardenChest = (T: number): V3 => {
  const warden = wardenState(T);
  const off = leanOffset(warden, [0, 0, 1.6]);
  return [warden.p[0] + off[0], warden.p[1] + off[1], warden.p[2] + off[2]];
};

// ======================= 苦力怕迫击炮（三发） =======================
// 出手时刘心忠的眼睛、往哪打：解出一条弹道，让炮弹在第 k 刻正好落到监守者胸口（按它那一刻的位置），取出手速度最接近 `mortarShotSpeed` 的那个解。
const solveMortar = (fireT: number, ticks: number | null) => {
  const eye = liuEye(fireT);
  let best: { k: number; d: V3; err: number; speed: number } | null = null;
  for (let k = ticks ?? 2; k <= (ticks ?? 40); k++) {
    const target = wardenChest(fireT + k / 20);
    let dir: V3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    let vlen = 0;
    for (let it = 0; it < 8; it++) {
      const norm = Math.hypot(...dir);
      const unit: V3 = [dir[0] / norm, dir[1] / norm, dir[2] / norm];
      const p0: V3 = [eye[0] + unit[0], eye[1] + unit[1], eye[2] + unit[2] - 0.25];
      const v0: V3 = [(target[0] - p0[0]) / k, (target[1] - p0[1]) / k, (target[2] - p0[2] + (0.05 * k * (k - 1)) / 2) / k];
      vlen = Math.hypot(...v0);
      dir = v0;
    }
    const err = Math.abs(vlen - chase.mortarShotSpeed);
    if (!best || err < best.err) best = { k, d: dir, err, speed: vlen };
  }
  const trajectory = mortarTrajectory(eye, best!.d, 1, best!.speed);
  const hitT = fireT + best!.k / 20;
  return { 出T: fireT, 眼: eye, 视线: best!.d, trajectory, tickCount: best!.k, 中T: hitT, blastPos: trajectory.posAt(best!.k), speed: best!.speed };
};
// 监守者受伤要等炮算完才知道，按顺序解（受伤不影响位置）
export const mortars = timeline.mortarFireTs.map((fireT, i) => {
  const shot = solveMortar(fireT, timeline.mortarTicks[i]);
  mortarHitTs.push(shot.中T);
  return shot;
});
// 飞行中的炮弹（出手后 τ 刻）
export const mortarShells = (T: number) =>
  mortars
    .filter((c) => T >= c.出T && T < c.中T)
    .map((shot) => {
      const τ = (T - shot.出T) * 20;
      return { at: shot.trajectory.drawPos(τ), vel: shot.trajectory.drawVelAt(τ) };
    });

// ======================= 刘心忠 =======================
export const liuXinzhongPose = (T: number): { pose: FigurePose; hurt: boolean } => {
  const horse = horseState(T);
  const chest = wardenChest(T);
  const eye = liuEye(T);
  const depressionDeg = (Math.atan2(eye[2] - chest[2], Math.hypot(chest[0] - eye[0], chest[1] - eye[1])) * 180) / Math.PI;
  // 头、身子对着监守者（它在身后就扭身、回头）；稳住以后转回前面准备跳
  const yawToWarden = nearYaw(horse.yaw, yawTo(chest[0] - eye[0], chest[1] - eye[1]));
  const yawOffset = Math.max(-110, Math.min(110, yawToWarden - horse.yaw));
  const look = ss(T / 0.3) * (1 - ss((T - timeline.steadyT) / 0.25));
  // 跑着、跃着身子前倾（越快伏得越低），停住坐直
  const crouch = ss(horse.速度 / 40);
  const ridingPitch = -6 * ss(horse.速度 / 6.5) - 16 * crouch;
  // 出炮：右手连杖往目标一指，打完放下
  const castArm = (t: number) => ss((T - t + 0.3) / 0.25) * (1 - ss((T - t - 0.35) / 0.4));
  const point = Math.max(...timeline.mortarFireTs.map(castArm));
  // 护盾：杖往前一推就出 → 挨了音爆稳住、杖收回来
  const lower = 1 - ss((T - timeline.hitT - 0.25) / 0.25);
  const push = ss((T - timeline.shieldT + 0.1) / 0.15) * lower;
  // 打中：往后一仰
  const recoil = T >= timeline.hitT ? decay(T - timeline.hitT, 0.5) * (0.7 + 0.3 * Math.cos((T - timeline.hitT) * 18)) : 0;
  const armR = lerp(lerp(36, 85 - depressionDeg * 0.6, point), 95 - depressionDeg * 0.5, push);
  const twist = yawOffset * 0.45 * Math.max(point, push, look * 0.8);
  const pose = ridePose(horse, {
    pitch: ridingPitch + 14 * recoil,
    headPitch: lerp(4, -Math.min(50, depressionDeg), look) + 10 * recoil,
    headYaw: Math.max(-70, Math.min(70, (yawOffset - twist) * look)),
    twist,
    armR,
  });
  return { pose, hurt: T >= timeline.hitT && T < timeline.hitT + 0.5 };
};

// ======================= 护盾 =======================
// 护盾术：瞬发，出在眼前 3 格、朝监守者（之后不跟着人动，铁魔法的护盾是个实体）
export const shieldState = (T: number) => {
  if (T < timeline.shieldT) return undefined;
  const eye = liuEye(timeline.shieldT);
  const chest = wardenChest(timeline.shieldT);
  const delta = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]];
  const norm = Math.hypot(delta[0], delta[1], delta[2]);
  const dir: V3 = [delta[0] / norm, delta[1] / norm, delta[2] / norm];
  return { at: shieldPos(eye, dir), dir, sec: T - timeline.shieldT };
};

// ======================= 黄叛 =======================
// 黄叛高台上站着、身子跟着监守者转（同 7-1-7 末帧的站姿、呼吸）；音爆那一刻开鼓风机射一箭；射完放下弓，一蹲一跳往东走（去 7-4-1 的传送门顶）
export const wardenFrame = (T: number): WardenFrame => {
  const w = wardenState(T);
  return { p: w.p, entityYaw: w.entityYaw, 前倾: w.前倾, props: { 秒: w.秒, 行走: w.行走, 头偏: w.头偏, headPitch: w.头仰, 音爆: w.音爆 } };
};
// 那一箭（风矢，同 7-1-5 满风 1000 米/秒）：从满弓的箭尖直线飞到监守者身上，瞄身子方盒（音爆时身子往后仰，跟着骨头算），钉在射线碰到身子的地方
const arrowSpeed = 1000;
const huangHeight = 1.875;
const huangFeet = geom.huangPanStart;
const makeHuangArrow = (releaseT: number) => {
  const eye: V3 = [huangFeet[0], huangFeet[1], huangFeet[2] + 1.62];
  const targetAt = (t: number): V3 => wardenBodyPoint(wardenFrame(t), 0.35);
  let hitPos = targetAt(releaseT + 0.04);
  let start: V3 = eye;
  let aim = { yaw: 0, 俯仰: 0 };
  let hitT = releaseT;
  for (let it = 0; it < 3; it++) {
    const delta = [hitPos[0] - eye[0], hitPos[1] - eye[1], hitPos[2] - eye[2]];
    aim = { yaw: yawTo(delta[0], delta[1]), 俯仰: (Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) * 180) / Math.PI };
    start = bowPointWorld(drawBowPose(huangFeet, aim.yaw, 0, aim.俯仰, 1), huangHeight, 'L', BOW_ARROW_TIP.弓拉2);
    hitT = releaseT + Math.hypot(hitPos[0] - start[0], hitPos[1] - start[1], hitPos[2] - start[2]) / arrowSpeed;
    hitPos = targetAt(hitT);
  }
  return { 放: releaseT, 中: hitT, 起: start, 落: hitPos, ...aim };
};
const ARROW_TIP = 0.225; // 箭的 p 到箭尖，见 模型/物品/箭.tsx 的 tipAhead
export const huangArrows = [timeline.huangArrowHitT].map((hitT) => {
  // 按要钉中的时刻倒推放箭：先按 0.04 秒飞行算一次，再把差的补上
  const first = makeHuangArrow(hitT - 0.04);
  const arrow = makeHuangArrow(first.放 + hitT - first.中);
  const d = [arrow.落[0] - arrow.起[0], arrow.落[1] - arrow.起[1], arrow.落[2] - arrow.起[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  const dir: V3 = [d[0] / n, d[1] / n, d[2] / n];
  // 钉住时箭的 p：箭尖扎进身子表面 0.12 格
  const surface = wardenBodyHit(wardenFrame(arrow.中), arrow.起, dir) ?? arrow.落;
  const stuck: V3 = [surface[0] - dir[0] * (ARROW_TIP - 0.12), surface[1] - dir[1] * (ARROW_TIP - 0.12), surface[2] - dir[2] * (ARROW_TIP - 0.12)];
  arrowHitTs.push(arrow.中);
  return { ...arrow, dir, 钉: stuck };
});
const theArrow = huangArrows[0];
export const huangPanLeap: 跳 = eliteLeap(huangFeet, geom.huangPanExit, 7, timeline.huangLeapT * fps, fps);
const huangLandT = huangPanLeap.f1 / fps;
export const huangPanState = (T: number) => {
  const wardenPos = wardenChest(T);
  const lookYaw = yawFromTo(huangFeet, wardenPos);
  const pitchToWarden = (Math.atan2(wardenPos[2] - huangFeet[2] - 1.62, Math.hypot(wardenPos[0] - huangFeet[0], wardenPos[1] - huangFeet[1])) * 180) / Math.PI;
  const drawStart = theArrow.放 - timeline.huangDrawSec;
  if (T < drawStart) {
    // 同 7-1-7 末帧：站着、身子对着它
    const pose: FigurePose = { ...standPose(huangFeet), yaw: lookYaw, armL: 40, armLRoll: 4, armR: 22, armRRoll: 2, headPitch: -Math.max(-35, Math.min(20, pitchToWarden)) * 0.7 };
    return { pose: breathe(pose, scene1T(T), 0.45, 2.1), 弓: bowTextureFor(false, 0) };
  }
  const crouchT = timeline.huangLeapT - 0.2;
  if (T < crouchT) {
    // 拉弓（转向箭的方向）→ 放 → 拉弦手一甩、弓放低
    const k = (T - drawStart) / timeline.huangDrawSec;
    const yaw = lerp(nearYaw(theArrow.yaw, lookYaw), theArrow.yaw, ss(k * 2));
    const draw = T < theArrow.放 ? ss(k) : 1 - ss((T - theArrow.放 - 0.15) / 0.3);
    let pose = drawBowPose(huangFeet, yaw, 0, theArrow.俯仰 * ss(draw * 2), Math.max(draw, 0.0001));
    const rel = T >= theArrow.放 ? ss((T - theArrow.放) / 0.12) * draw : 0;
    if (rel > 0) pose = { ...pose, armR: pose.armR - 15 * rel, elbowR: 25 * rel };
    return { pose, 弓: bowTextureFor(T < theArrow.放, k) };
  }
  if (T < timeline.huangLeapT) return { pose: takeoffPose(huangFeet, nearYaw(theArrow.yaw, huangPanLeap.yaw), (T - crouchT) / 0.2), 弓: bowTextureFor(false, 0) };
  if (T < huangLandT) return { pose: airPose(huangPanLeap, T * fps), 弓: bowTextureFor(false, 0) };
  return { pose: landPose(geom.huangPanExit, huangPanLeap.yaw, (T - huangLandT) * fps, 6), 弓: bowTextureFor(false, 0) };
};
export const huangPanFeetAt = (T: number): V3 => (T < timeline.huangLeapT ? huangFeet : T < huangLandT ? leapFeetAt(huangPanLeap, T * fps) : geom.huangPanExit);
// 鼓风机虚影和风道（同 7-1 的 fansAt、画法见 ../7-1/弓前风扇.tsx）：放箭前 0.35 秒化出、放箭后 0.3 秒散；他站着不动
export const fansAt = (T: number): 弓前风扇[] =>
  huangArrows.flatMap((arrow, i) => {
    const lead = 0.35;
    const visibility = ss((T - (arrow.放 - lead)) / 0.12) * (1 - ss((T - arrow.放) / 0.3));
    if (visibility <= 0) return [];
    const off = ARROW_TIP + 0.04 + X71.fanSize / 2;
    const center: V3 = [0, 1, 2].map((k) => arrow.起[k] + arrow.dir[k] * off) as V3;
    const mouth: V3 = [0, 1, 2].map((k) => center[k] + (arrow.dir[k] * X71.fanSize) / 2) as V3;
    return [{ 显: visibility, dir: arrow.dir, 心: center, 口: mouth, 边长: X71.fanSize, 转起: arrow.放 - lead, 风停: arrow.放 + 0.25, 转速: 256, 快放: 880, 种子: 733 + 2 * i }];
  });
// 飞到 中 那一刻正好到 钉
export const flyingHuangArrows = (T: number) =>
  huangArrows.filter((a) => T >= a.放 && T < a.中).map((a) => ({ p: lerpV3(a.起, a.钉, (T - a.放) / (a.中 - a.放)), dir: a.dir }));
const lerpV3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ======================= 第 1 场留下的东西 =======================
// 钉在监守者身上的箭：第 1 场的按第 1 场末帧钉在身子上的位置接着，7-3-3 那一箭按钉中那一刻；都跟着身子走（走路摆、音爆后仰、前倾）
const oldPins = X71.stuckArrows(X71.sceneEndT).map((a) => pinToWardenBody(X71.wardenFrame(X71.sceneEndT), a.p, a.dir));
const freshPins = new Map<number, BodyPin>();
const freshPin = (i: number) => {
  if (!freshPins.has(i)) freshPins.set(i, pinToWardenBody(wardenFrame(huangArrows[i].中), huangArrows[i].钉, huangArrows[i].dir));
  return freshPins.get(i)!;
};
export const stuckArrows = (T: number) => {
  const frame = wardenFrame(T);
  const fresh = huangArrows.map((a, i) => (T >= a.中 ? freshPin(i) : null)).filter((pin): pin is BodyPin => pin !== null);
  return [...oldPins, ...fresh].map((pin) => wardenBodyPinAt(frame, pin));
};
// 第 1 场插下的火把：只画在场子里的
const [zx0, zz0, zx1, zz1] = arena.范围;
export const torches = X71.torches(X71.sceneEndT).filter((torch) => {
  const gamePos = toGame4(torch.cell);
  return gamePos[0] >= zx0 - 1 && gamePos[0] <= zx1 + 1 && gamePos[2] >= zz0 - 1 && gamePos[2] <= zz1 + 1;
});

// ======================= 音爆 =======================
// 第 34 刻：从监守者脚底 + 1.6 格朝刘心忠眼睛一条直线，穿过护盾、穿过他，再往后 6 格
export const sonicBoomOrigin = () => wardenState(timeline.sonicBoomFireT).p;
export const sonicBoomTarget = () => liuEye(timeline.sonicBoomFireT - 0.01);

// ======================= 第 3 场末（7-3-3 末帧） =======================
export const scene3End = { 末T: endT, 马: horseState(endT).p, 监守者: wardenState(endT).p, 黄叛: huangPanFeetAt(endT) };
