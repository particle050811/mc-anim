// 6-4-1 羊毛搜刮、6-4-2 规矩在放大 4 倍的新城里共用的剧情时间线：李樱从 6-3-6 落点起 13 跳往西到 #210。纯函数。
// 剧情时间按秒，0 = 6-4-1 第 0 帧 = 6-3-6 末帧；6-4-1、6-4-2 各自是时间线上剪出的窗口（跳切），见各自的 编排.ts。
// 下面不整的秒数（n / 24）是原来按 1/24 秒一格手调的，换成秒照抄。
// 用户 10-13 要求 4x 古城、跳得高远，10-18 定人跑跳 30 米/秒：路线、羊毛、每跳离地（`woolLeapApex`）照 ../古城4x布局.ts，弧是布局文件的 `eliteLeap`
//   （工具/古城4x布局/核对.py 按同一条弧查过身子碰撞箱），一跳 36～42 米、28～33 米/秒（头一跳蹬上墙头、P5 翻北墙短一些）。
//   落地前 0.22 秒垫羊毛（不发振动）。
// 用户 10-18 定：跳跃优先观感、不必严格重力（「古城的跳跃动画太难崩了，重做一下」）。弧的形状不变（核过的不撞墙），只换走法和动作，见下面「跳的走法」：
//   起跳前蹲住蓄力、1/12 秒蹬直；蹬离地面快、顶点前后慢下来舒展一下、落地前又快（`warp`）；空中前腿提膝后腿蹬直 → 收腿 → 两臂张开 → 伸腿找落点；
//   落地一下压到最深、上身往前栽、头晚一拍；每跳在地上停多久、顶点停多久各不一样（`jumpStyle`），不再一个节奏弹着走。
// 起点：6-3-6 末帧他站在 `GUCHENG4X.落点`，面朝南、右手握重锤（手臂 20°、肘 30°、roll 18°、锤角 230°；数取自 6-3-下坠/编排.ts 的 李樱(w) 落地 0.35 秒后）。1/6 秒时换到羊毛那一格（锤收进背包），转身往北蹲下起跳。
//   G1 改 6-3-6 时落点、站姿不变，所以照抄数，不 import 下坠时间线。
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { GUCHENG4X } from '../../../地点/古城4x.tsx';
import { allWool, elite, eliteLeap, leapFeetAt, feetOnWool, wool641, wool642, woolLeapApex, chestB, type Jump, type WoolName } from '../../../地点/古城4x/布局.ts';
import { PLACE_BEFORE, crouchPose, lootPose, mixPose, nearYaw, placeTime, takeoffPose, yawTo } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { smoothstep01, lerp, clamp01 } from '@engine/core/数学.ts';

const bump = (x: number, a: number, b: number) => Math.sin(Math.PI * clamp01((x - a) / (b - a)));

// ---------- 起点（6-3-6 末帧） ----------
export const startFoot: V3 = GUCHENG4X.landingPos;
export const startYaw = 180; // 面朝南
export const stowHammerSec = 1 / 6; // 这一刻起手里没有锤
export const hammerAngle = 230; // 6-3-6 末帧锤在右手里的角度（`bladeInHand` 的 angle）
const startStance = (yaw: number): FigurePose => ({
  loc: startFoot, pitch: 0, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, kneeR: 0, kneeL: 0, legRRoll: 2, legLRoll: 2,
  armR: 20, armL: 20, armRRoll: 18, armLRoll: 18, elbowR: 30, elbowL: 30, ground: 1, yaw,
});
const turnStart = 5 / 24; // 换完物品往北转身（0.3 秒转过来）
const turnLen = 7 / 24;
const windupSec = Math.round(elite.takeoffCrouchSec * 24) / 24;
export const firstJumpSec = 2 / 3; // 转过来以后多蹲 1/6 秒再走

// ---------- 跳的走法（用户 10-18 定：跳跃优先观感、不必严格重力） ----------
// 每跳两个数：落地以后在地上待几秒（卸力 + 蓄力，最后 `PUSH` 秒蹬地）、顶点前后慢多少（`warp` 的 hang）。按跳的顺序轮着取，长短穿插：
// 大多数 1/4～1/3 秒就势再起，隔几跳停 5/12～13/24 秒（站起一点看下一个落点再蹲下去）。
const GROUND_SEC = [1 / 3, 1 / 4, 11 / 24, 7 / 24, 1 / 4, 3 / 8, 13 / 24, 7 / 24, 1 / 4, 5 / 12];
const HANG = [0.32, 0.42, 0.26, 0.38, 0.46, 0.3, 0.36];
const PUSH = 1 / 12;
export const jumpStyle = (i: number) => ({ groundSec: GROUND_SEC[i % GROUND_SEC.length], hang: HANG[i % HANG.length] });
// 空中的画面进度 u（0 离地、1 落地）→ 弧上的进度：顶点（ua）两边各一段，蹬地后快、到顶点只剩 1 − hang 倍速、落地前又快到 1 + hang 倍；
// 两段在顶点速度相同，弧的形状和总时长不变，落点照旧准
const warp = (u: number, ua: number, hang: number) => {
  if (u < ua) {
    const s = u / ua;
    return ua * (s + hang * s * (1 - s));
  }
  const s = (u - ua) / (1 - ua);
  return ua + (1 - ua) * (s - hang * s * (1 - s));
};
// 跳的 f0、f1 是秒（`eliteLeap`、`leapFeetAt` 的每秒格数给 1）
const flightU = (jump: Jump, t: number) => clamp01((t - jump.f0) / jump.T);
const flightFeetAt = (jump: Jump, i: number, t: number): V3 =>
  leapFeetAt(jump, jump.f0 + warp(flightU(jump, t), jump.tUp / jump.T, jumpStyle(i).hang) * jump.T, 1);
// 蹬离地面那一刻的样子（地上最后一帧和空中第一帧一样）：后腿（左）蹬直、前腿（右）提膝，上身前倾，两臂往前上方甩
const launchShape = (foot: V3, yaw: number): FigurePose => ({
  loc: foot, pitch: -26, squash: 1, headPitch: 16, headYaw: 0, legR: 60, kneeR: 80, legL: -40, kneeL: 8,
  armR: 95, armRRoll: 6, elbowR: 15, armL: 95, armLRoll: 8, elbowL: 20, twist: 10, ground: 1, yaw,
});
// 空中：蹬直的腿和甩起的手 → 收腿抱膝上到顶点 → 顶点前后两臂张开、身子舒展 → 伸腿找落点、头低下去盯着、右手往脚下一挥垫羊毛。
// 刚离地和快落地时脚底贴着弧（ground 1），中间按髋算（ground 0），着地那帧不跳
const flightPose = (jump: Jump, i: number, t: number): FigurePose => {
  const u = flightU(jump, t);
  const ua = jump.tUp / jump.T;
  const ext = 1 - smoothstep01(u / 0.2);
  const tuck = smoothstep01((u - 0.12) / Math.max(0.1, ua - 0.12)) * (1 - smoothstep01((u - ua - 0.08) / 0.22));
  const reach = smoothstep01((u - Math.max(ua + 0.12, 0.62)) / 0.25);
  const float = bump(u, ua - 0.18, ua + 0.2);
  const place = bump(u, 1 - (PLACE_BEFORE + 0.12) / jump.T, 1 - (PLACE_BEFORE - 0.1) / jump.T);
  // 头比身子晚一拍：按 0.06 以前的进度算低头
  const reachHead = smoothstep01((u - 0.06 - Math.max(ua + 0.12, 0.62)) / 0.25);
  return {
    loc: flightFeetAt(jump, i, t),
    pitch: -26 * ext - 14 * tuck + 4 * float + 8 * reach,
    squash: 1,
    headPitch: 16 * ext - 6 * tuck + 6 * float - 30 * reachHead - 14 * place,
    headYaw: 0,
    legR: 60 * ext + 95 * tuck + 40 * reach,
    kneeR: 80 * ext + 120 * tuck + 22 * reach,
    legL: -40 * ext + 70 * tuck + 18 * reach,
    kneeL: 8 * ext + 105 * tuck + 35 * reach,
    armR: 95 * ext + 20 * tuck + 30 * float + 55 * reach + 40 * place,
    armRRoll: 6 - 18 * tuck + 40 * float + 20 * reach,
    elbowR: 15 + 35 * tuck,
    armL: 95 * ext + 20 * tuck + 30 * float + 65 * reach,
    armLRoll: 8 - 22 * tuck + 40 * float + 25 * reach,
    elbowL: 20 + 35 * tuck,
    twist: 10 * ext - 6 * reach,
    ground: 1 - smoothstep01(u / 0.1) * (1 - smoothstep01((u - 0.86) / 0.14)),
    yaw: jump.yaw,
  };
};
// 一着地：压到最深（比蓄力还深）、上身往前栽、手往前下压，头晚一拍才低下去；k 0～1
const absorbPose = (foot: V3, yaw: number, k: number): FigurePose => {
  const p = crouchPose(foot, yaw, lerp(0.75, 1.12, 1 - (1 - k) ** 2), lerp(70, 25, k));
  return { ...p, pitch: p.pitch - 10 * bump(k, 0, 1.4), headPitch: p.headPitch - 12 * bump(k, 0.2, 1.2) };
};
const ABSORB = 1 / 8;
// 两跳之间在地上（s 落地后几秒，len 待几秒）：卸力 → 蹲着蓄力（手往后甩、抬头看下一跳；停得久的先站起一点再蹲下去）→ 1/12 秒蹬直。
// 1/24 秒是原来按格编时的下限（至少一格）
const groundPose = (foot: V3, yawIn: number, yawOut: number, s: number, len: number): FigurePose => {
  const windEnd = len - PUSH;
  const yaw = lerp(yawIn, nearYaw(yawIn, yawOut), smoothstep01(s / Math.max(1 / 24, windEnd)));
  if (s < ABSORB) return absorbPose(foot, yaw, s / ABSORB);
  if (s < windEnd) {
    const k = (s - ABSORB) / Math.max(1 / 24, windEnd - ABSORB);
    // len 是两个秒数相减，带浮点零头，按 5/12 秒比要留余量
    const settle = len >= 5 / 12 - 1e-9 ? 0.5 * bump(k, 0, 0.75) : 0;
    const p = crouchPose(foot, yaw, lerp(1.12, 1, smoothstep01(k)) - settle, lerp(25, -60, smoothstep01(k)));
    return { ...p, headPitch: p.headPitch + 10 * smoothstep01(k) };
  }
  return mixPose(crouchPose(foot, yaw, 1, -60), launchShape(foot, yaw), smoothstep01((s - windEnd) / PUSH));
};

// ---------- 13 跳 ----------
export const route: WoolName[] = [...(Object.keys(wool641) as WoolName[]), ...(Object.keys(wool642) as WoolName[])];
const LAND_B = 1 / 4; // 落在 #212 跟前，蹲一下卸力
const LOOT_LEN = 7 / 6; // 开箱、伸手拿东西
const TURN_LEN = 7 / 24; // 收手的同时转身蹲下
const LOOT_TURN_OVERLAP = 1 / 6; // 收手和转身重叠的一截
export const jumps: Jump[] = (() => {
  const out: Jump[] = [];
  let p0 = startFoot;
  let f0 = firstJumpSec;
  for (const k of route) {
    const p1 = feetOnWool(allWool[k]);
    const jump = eliteLeap(p0, p1, woolLeapApex[k] ?? elite.apexHeight, f0, 1);
    out.push(jump);
    p0 = p1;
    f0 = k === 'B' ? jump.f1 + LAND_B + LOOT_LEN - LOOT_TURN_OVERLAP + TURN_LEN : jump.f1 + jumpStyle(out.length - 1).groundSec;
  }
  return out;
})();
export const jumpOnto = (k: WoolName): Jump => jumps[route.indexOf(k)];
// 落在 k 上那一刻、从 k 起跳那一刻（剧情秒）
export const landSec = (k: WoolName) => jumpOnto(k).f1;
export const takeoffSec = (k: WoolName) => jumps[route.indexOf(k) + 1]?.f0 ?? Infinity;

// ---------- #212（6-4-1 开箱拿东西） ----------
const landB = landSec('B');
export const LOOT0 = landB + LAND_B;
const TURN0 = LOOT0 + LOOT_LEN - LOOT_TURN_OVERLAP;
export const openLidSecB = LOOT0 + 1 / 6;
export const closeLidSecB = takeoffSec('B'); // 蹬地跳走那一刻关盖（关掉箱子界面）
const chestYawB = yawTo(0, -1); // 面朝南（#212 在 B 南边一格）

// ---------- 羊毛 ----------
// 每块在落地前 0.22 秒垫下（placeTime），放下后 1/12 秒从小长满
export const woolPlaceSec = (k: WoolName) => placeTime(jumpOnto(k));
export const woolStateAt = (t: number) => {
  const placed: WoolName[] = [];
  const growingWool: { w: WoolName; k: number }[] = [];
  for (const k of route) {
    const pf = woolPlaceSec(k);
    if (t < pf) continue;
    const progress = (t - pf) * 12;
    if (progress >= 1) placed.push(k);
    else growingWool.push({ w: k, k: 0.35 + 0.65 * progress });
  }
  return { wool: placed, growingWool: growingWool };
};

// ---------- 李樱 ----------
// 落在箱子跟前：卸力（同两跳之间），再起身到半蹲、转向箱子（6-4-2 落在 C 上也用）
export const landBeforeChest = (foot: V3, y0: number, chestYaw: number, sinceLand: number, len = 1 / 4): FigurePose => {
  const yaw = lerp(y0, chestYaw, smoothstep01(sinceLand / len));
  if (sinceLand < ABSORB) return absorbPose(foot, yaw, sinceLand / ABSORB);
  const k = clamp01((sinceLand - ABSORB) / Math.max(1 / 24, len - ABSORB));
  return crouchPose(foot, yaw, lerp(1.12, 0.35, smoothstep01(k)), lerp(25, 15, k));
};
const inAir = (J: Jump, t: number) => t >= J.f0 && t < J.f1;
// 剧情秒 t 的姿势（t 到 C 落地为止；C 之后归 6-4-2/编排.ts）；手里有没有锤看 hasHammer(t)
export const hasHammer = (t: number) => t < stowHammerSec;
export const poseAt = (t: number): FigurePose => {
  const J0 = jumps[0];
  if (t < turnStart) return startStance(startYaw);
  if (t < J0.f0) {
    // 往北转身（转过来的同时蹲下蓄力）
    const turnProgress = (t - turnStart) / turnLen;
    const yaw = lerp(startYaw, nearYaw(startYaw, J0.yaw), smoothstep01(turnProgress));
    if (t >= J0.f0 - PUSH) return mixPose(crouchPose(startFoot, yaw, 1, -60), launchShape(startFoot, yaw), smoothstep01((t - (J0.f0 - PUSH)) / PUSH));
    const tk = takeoffPose(startFoot, yaw, Math.min(0.65, Math.max(0, (t - (J0.f0 - PUSH - windupSec)) / windupSec) * 0.65), 0.25 * smoothstep01(turnProgress));
    return mixPose(startStance(yaw), tk, smoothstep01(turnProgress / 0.5));
  }
  for (let i = 0; i < jumps.length; i++) {
    const jump = jumps[i];
    if (inAir(jump, t)) return flightPose(jump, i, t);
    const nextJump = jumps[i + 1];
    const k = route[i];
    if (!nextJump || t < nextJump.f0) {
      if (k === 'B') {
        const faceChest = nearYaw(jump.yaw, chestYawB);
        if (t < LOOT0) return landBeforeChest(jump.p1, jump.yaw, faceChest, t - jump.f1, LAND_B);
        const loot = lootPose(jump.p1, faceChest, Math.min(1, (t - LOOT0) / LOOT_LEN), 1.4);
        if (t < LOOT0 + 5 / 24) return mixPose(landBeforeChest(jump.p1, jump.yaw, faceChest, LAND_B, LAND_B), loot, smoothstep01((t - LOOT0) / (5 / 24)));
        if (t < TURN0) return loot;
        const turnProgress = (t - TURN0) / TURN_LEN;
        const yaw = lerp(faceChest, nearYaw(faceChest, nextJump.yaw), smoothstep01(turnProgress / 0.6));
        if (t >= nextJump.f0 - PUSH) return mixPose(crouchPose(jump.p1, yaw, 1, -60), launchShape(jump.p1, yaw), smoothstep01((t - (nextJump.f0 - PUSH)) / PUSH));
        return mixPose(loot, takeoffPose(jump.p1, yaw, Math.min(0.65, turnProgress), 0.2), smoothstep01(turnProgress / 0.3));
      }
      if (!nextJump) return landBeforeChest(jump.p1, jump.yaw, jump.yaw, t - jump.f1); // C：6-4-2 接着演
      return groundPose(jump.p1, jump.yaw, nextJump.yaw, t - jump.f1, nextJump.f0 - jump.f1);
    }
  }
  return startStance(startYaw);
};
export const footAt = (t: number): V3 => {
  for (let i = 0; i < jumps.length; i++) if (inAir(jumps[i], t)) return flightFeetAt(jumps[i], i, t);
  return poseAt(t).loc as V3;
};
export const chestBlockB = chestB.block;

// ---------- 跳切 ----------
// 一段成片 = 剧情时间线上首尾相接的几个窗口（剧情秒 [起, 止)），窗口之间跳过的剧情不演（跳切）。窗口两头取整到 1/24 秒的格。
// 判断落在哪个窗口时留 1e-9 秒的余量：切点正好落在输出帧上时算后一个窗口
export type CutWindow = { 名: string; 起: number; 止: number };
const toGrid = (t: number) => Math.round(t * 24) / 24;
export const cutWindows = (windows: CutWindow[]) => {
  const rounded = windows.map((w) => ({ ...w, 起: toGrid(w.起), 止: toGrid(w.止) }));
  const firstSecs: number[] = [];
  let total = 0;
  for (const win of rounded) {
    firstSecs.push(total);
    total += win.止 - win.起;
  }
  // 成片秒 → 第几个窗口、剧情秒
  const windowIndex = (cutSec: number) => {
    let i = 0;
    while (i + 1 < rounded.length && cutSec >= firstSecs[i + 1] - 1e-9) i++;
    return i;
  };
  const storySec = (cutSec: number) => {
    const i = windowIndex(cutSec);
    return rounded[i].起 + (cutSec - firstSecs[i]);
  };
  return { windows: rounded, firstSecs, totalSec: total, indexAt: windowIndex, storySec };
};
