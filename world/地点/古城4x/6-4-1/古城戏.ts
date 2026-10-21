// 第 4 场「古城」三段（6-4-1 羊毛搜刮、6-4-3 挡箭、6-4-8 钻出）共用：站位、羊毛、李樱的几个动作。纯函数。
// 场景是导出的古城（模型/场景/古城.tsx），Z 朝上、北 = +Y、1 = 一格；场景 (x, y, z) = (游戏 x + 720, 240 - 游戏 z, 游戏 y + 50)。方块位置都写游戏坐标，从导出网格量的。
//
// 地理（城中央东半边）：内院东通道落点（6-3-6，游戏 (-710, 240)）对着门洞，往东是「回廊」（东西向厚墙 z 235～243，墙顶 y -45，墙里带顶走道），中段 4 格宽缺口（x -676～-673）南北贯通。
//   缺口南「幽匿田」：幽匿块平地（x -701～-661、z 244～260，地面 y -51，洞顶约 y -32），中间两座 4 格高小石像，南边半开的箱子屋 B（箱子 (-687,-50,272)，北边两根带脸石柱夹 5 格宽口子）；南半边压着低垂岩顶（z 255～270，离地 9～12 格）。
//   缺口北「北条」：z 229～234 的 6 格宽空地，东头小石屋 C（箱子 (-673,-49,227)，只有东边矮）；缺口正北有顶到洞顶的高柱，所以从田里去 C 要绕东边翻回廊。
//
// 李樱一跳二三十米（用户 10-02 嫌跳得近）：弹道用游戏玩家重力（32 格/秒²），最高点比起跳点高 4.5～6 格（受洞顶限制），一跳 1.1～1.3 秒、水平 18～22 米/秒。
//   照原文「熟练地用着羊毛跳搭」，快落地时（离落点三四格）往落脚处垫羊毛（在 BlockTags.DAMPENS_VIBRATIONS 里，踩上去无振动），落地深蹲卸力即下一跳蓄力。羊毛场景里一直留着，6-4-3、6-4-8 也画。
//   跳的动作（用户 10-18 定：优先观感、不必严格重力）：起跳前蹲住蓄力、最后两帧蹬直（`launchShape`），空中蹬直 → 收腿 → 顶点舒展 → 伸腿找落点（`flightPose`），
//   落地一下压到最深、上身前栽、头晚一拍（`absorbPose`）。6-4-5、6-4-6、6-4-7、第 7 章古城共用；6-4-1、6-4-2 李樱的连跳在 跳搭.ts 里另排。
//   6-4-1：缺口南口 → A1 → B（开箱）→ A3 → A4（半空出画）。6-4-2：A4 → 翻回廊落 D → 小跳上 C（A4→C 直线会撞 C 南墙，见 6-4-2/编排.ts）；6-4-3 他站在 C 开箱。
//   6-4-6～6-4-8：二人回田里，A1 在二人脚边；刘心忠踩响田西尖啸体 (-695,-51,259)，监守者在其北 4.5 格钻出（尖啸体召唤监守者，落点在周围水平 ±5 格内）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { rad } from '../../../../engine/anim/anim.ts';
import { type FigurePose, standPose } from '../../../角色/骨架.tsx';
import { flightWarp } from '../布局/强者.ts';

export const FPS = 24;

export const toScene = (x: number, y: number, z: number): V3 => [x + 720, 240 - z, y + 50];
// 放在方块 (bx, bz) 上、站立面高 top（游戏 y）的一块羊毛：返回羊毛方块的底面中心（场景坐标）
export const woolAt = (bx: number, top: number, bz: number): V3 => [bx + 720.5, 239.5 - bz, top + 50];
export const onWool = (w: V3): V3 => [w[0], w[1], w[2] + 1];
export const blockFoot = (bx: number, top: number, bz: number): V3 => [bx + 720.5, 239.5 - bz, top + 50];

// 朝向：骨架默认面朝 +Y，yaw 正 = 往左转。面朝 (dx, dy) 方向时的 yaw（度）
export const yawTo = (dx: number, dy: number) => (Math.atan2(-dx, dy) * 180) / Math.PI;
// 从 a 转到 b 走近的那一边：返回和 a 连续的 b（可能加减 360）
export const nearYaw = (a: number, b: number) => a + ((((b - a + 540) % 360) + 360) % 360) - 180;

// ---------- 位置 ----------
export const chestB = { block: [-687, -50, 272], facing: 'north' as const }; // 6-4-1
export const chestC = { block: [-673, -49, 227], facing: 'north' as const }; // 6-4-3
export const shriekers = {
  besideB: [-689, -50, 271], // 箱子 B 西北角
  fieldWest: [-695, -51, 259], // 6-4-7 第四次警告、6-4-8 监守者在它旁边钻出
  corridorTop: [-694, -45, 243],
  houseC: [-676, -49, 223],
};
export const blockCenter = ([x, y, z]: number[]): V3 => [x + 720.5, 239.5 - z, y + 50];
// 6-4-8：监守者钻出的地方（脚底，地面 y -51）、二人站的地方
export const wardenLanding: V3 = toScene(-695.5, -51, 254.5);
export const liuStandPos: V3 = toScene(-694.2, -51, 249.4);
export const huangStandPos: V3 = toScene(-697.5, -51, 248.6);

// ---------- 羊毛 ----------
// [方块 x, 站立面 y, 方块 z]：羊毛放在站立面上，人踩在羊毛顶（站立面 + 1）。高度从网格量的。
// 李樱一路垫的羊毛（一跳一块，见文件头）。跳与跳之间（米）：起跳点→A1 23，A1→B 26，B→A3 20，A3→A4 22，A4→D 20，D→C 5
export const woolSpots = {
  A1: [-697, -51, 247], // 田西北角，紧挨回廊南墙根（6-4-8 二人就从它旁边走过）
  B: [-687, -50, 271], // 箱子 B 北边一格
  A3: [-685, -51, 251], // 田中间，两座石像之间、正对箱子屋 B 两根石柱的口子
  A4: [-663, -51, 247], // 田东头
  D: [-667, -50, 227], // 石屋 C 东边空地（6-4-2 先落这里再小跳上 C）；6-4-3、6-4-8 也画它，那两段机位拍不到
  C: [-672, -49, 227], // 石屋 C 箱子东边的台子（6-4-3 李樱站在这块上开箱）
} satisfies Record<string, [number, number, number]>;
export const allWool: V3[] = Object.values(woolSpots).map(([x, t, z]) => woolAt(x, t, z));
export const footOnWool = (k: keyof typeof woolSpots): V3 => onWool(woolAt(...woolSpots[k]));

// ---------- 大跳 ----------
const gravity = 32; // 格/秒²：游戏里玩家下落的重力（0.08 格/刻²）
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const bump = (x: number, a: number, b: number) => Math.sin(Math.PI * clamp01((x - a) / (b - a)));

// 一跳：从脚底 p0 离地（第 f0 帧）跳到 p1，最高点脚底高 top（场景 z）。水平匀速，竖直按重力 G 的抛物线；有 hang 时沿弧的快慢按 `flightWarp`。
export type Leap = { p0: V3; p1: V3; top: number; f0: number; T: number; tUp: number; f1: number; yaw: number; hang?: number };
export const leap = (p0: V3, p1: V3, top: number, f0: number): Leap => {
  const tUp = Math.sqrt((2 * (top - p0[2])) / gravity);
  const airSec = tUp + Math.sqrt((2 * (top - p1[2])) / gravity);
  return { p0, p1, top, f0, T: airSec, tUp, f1: f0 + airSec * FPS, yaw: yawTo(p1[0] - p0[0], p1[1] - p0[1]) };
};
// 第 f 帧的脚底位置（空中；f 在 f0～f1 之外时夹到两端）
export const leapAt = (jump: Leap, frame: number): V3 => {
  const t0 = Math.min(jump.T, Math.max(0, (frame - jump.f0) / FPS));
  const t = jump.hang ? flightWarp(t0 / jump.T, jump.tUp / jump.T, jump.hang) * jump.T : t0;
  const k = t / jump.T;
  return [lerp(jump.p0[0], jump.p1[0], k), lerp(jump.p0[1], jump.p1[1], k), jump.p0[2] + gravity * jump.tUp * t - 0.5 * gravity * t * t];
};
// 垫羊毛那一刻：落地前 0.22 秒（离落点约 4 格、在手够得着的距离里）
export const PLACE_BEFORE = 0.22;
export const placeFrame = (L: Leap) => L.f1 - PLACE_BEFORE * FPS;

// 深蹲（落地卸力、起跳蓄力）：d 0～1 蹲的深浅，arms 两臂前后摆的角度（负 = 往后甩）
export const crouchPose = (foot: V3, yaw: number, depth: number, arms = 0): FigurePose => {
  // 大腿往前抬 α、小腿往后折 2α，脚落在髋正下方；躯干前倾
  const thighAngle = 62 * depth;
  const pitch = -26 * depth;
  return {
    loc: foot,
    pitch,
    squash: 1,
    headPitch: 18 * depth,
    headYaw: 0,
    legR: thighAngle - pitch,
    legL: thighAngle - pitch - 6 * depth,
    kneeR: 2 * thighAngle,
    kneeL: 2 * thighAngle - 10 * depth,
    armR: arms,
    armRRoll: 10,
    elbowR: 15 + 10 * depth,
    armL: arms,
    armLRoll: 12,
    elbowL: 20 + 10 * depth,
    ground: 1,
    yaw,
  };
};

// 蹬离地面那一刻（地上最后一帧 = 空中第一帧）：后腿（左）蹬直、前腿（右）提膝，上身前倾，两臂往前上方甩。同 跳搭.ts 的 launchShape
export const launchShape = (foot: V3, yaw: number): FigurePose => ({
  loc: foot, pitch: -26, squash: 1, headPitch: 16, headYaw: 0, legR: 60, kneeR: 80, legL: -40, kneeL: 8,
  armR: 95, armRRoll: 6, elbowR: 15, armL: 95, armLRoll: 8, elbowL: 20, twist: 10, ground: 1, yaw,
});
export const PUSH = 2; // 蹬地的帧数
const ABSORB = 3; // 落地压到最深的帧数

// 蹲下蓄力再蹬起：v 0～1（0.65 蹲到最深、手甩到最后，之后蹬到 `launchShape`；1 那一刻离地）
export const takeoffPose = (foot: V3, yaw: number, progress: number, from = 0): FigurePose => {
  if (progress < 0.65) return crouchPose(foot, yaw, lerp(from, 1, ss(progress / 0.65)), -55 * ss(progress / 0.65));
  return mixPose(crouchPose(foot, yaw, 1, -55), launchShape(foot, yaw), ss((progress - 0.65) / 0.35));
};

// 空中（u 0～1 = 画面上这一跳过了几成；位置走 `leapAt`，有 hang 时顶点前后慢）：蹬直的腿和甩起的手 → 收腿抱膝上到顶点 → 顶点前后两臂张开、身子舒展 →
// 伸腿找落点、头晚一拍低下去盯着。place：落地前右手往脚下一挥垫羊毛；armRScale：右臂摆幅（刘心忠拿杖压一半）。
// 刚离地和快落地时脚底贴着弧（ground 1），中间按髋算（ground 0），离地、着地那帧不跳。同 跳搭.ts 的 flightPose
export const flightPose = (jump: Leap, frame: number, { place = true, armRScale = 1 } = {}): FigurePose => {
  const u = clamp01((frame - jump.f0) / FPS / jump.T);
  const ua = jump.tUp / jump.T;
  const ext = 1 - ss(u / 0.2);
  const tuck = ss((u - 0.12) / Math.max(0.1, ua - 0.12)) * (1 - ss((u - ua - 0.08) / 0.22));
  const reachStart = Math.max(ua + 0.12, 0.62);
  const reach = ss((u - reachStart) / 0.25);
  const reachHead = ss((u - 0.06 - reachStart) / 0.25);
  const float = bump(u, ua - 0.18, ua + 0.2);
  const wave = place ? bump(u, 1 - (PLACE_BEFORE + 0.12) / jump.T, 1 - (PLACE_BEFORE - 0.1) / jump.T) : 0;
  return {
    loc: leapAt(jump, frame),
    pitch: -26 * ext - 14 * tuck + 4 * float + 8 * reach,
    squash: 1,
    headPitch: 16 * ext - 6 * tuck + 6 * float - 30 * reachHead - 14 * wave,
    headYaw: 0,
    legR: 60 * ext + 95 * tuck + 40 * reach,
    kneeR: 80 * ext + 120 * tuck + 22 * reach,
    legL: -40 * ext + 70 * tuck + 18 * reach,
    kneeL: 8 * ext + 105 * tuck + 35 * reach,
    armR: (95 * ext + 20 * tuck + 30 * float + 55 * reach + 40 * wave) * armRScale,
    armRRoll: 6 - 18 * tuck + 40 * float + 20 * reach,
    elbowR: 15 + 35 * tuck,
    armL: 95 * ext + 20 * tuck + 30 * float + 65 * reach,
    armLRoll: 8 - 22 * tuck + 40 * float + 25 * reach,
    elbowL: 20 + 35 * tuck,
    twist: 10 * ext - 6 * reach,
    ground: 1 - ss(u / 0.1) * (1 - ss((u - 0.86) / 0.14)),
    yaw: jump.yaw,
  };
};
// 李樱（落地前垫羊毛）；7-2、7-3、7-4-1 也用
export const airPose = (jump: Leap, frame: number): FigurePose => flightPose(jump, frame);

// 一着地：压到最深（比蓄力还深）、上身往前栽、手往前下压，头晚一拍才低下去；k 0～1（`ABSORB` 帧）。同 跳搭.ts 的 absorbPose
export const absorbPose = (foot: V3, yaw: number, k: number): FigurePose => {
  const p = crouchPose(foot, yaw, lerp(0.75, 1.12, 1 - (1 - k) ** 2), lerp(70, 25, k));
  return { ...p, pitch: p.pitch - 10 * bump(k, 0, 1.4), headPitch: p.headPitch - 12 * bump(k, 0.2, 1.2) };
};
// 压到底以后，前栽和低头的余势接着收回来（k 0～1），免得 absorb 一结束身子一跳
const absorbTail = (p: FigurePose, k: number): FigurePose => ({ ...p, pitch: p.pitch - 10 * bump(1 + 0.4 * k, 0, 1.4), headPitch: p.headPitch - 12 * bump(1 + 0.2 * k, 0.2, 1.2) });

// 落地卸力：s 落地后的帧数，len 蹲多久（帧）；先 `absorbPose` 压到最深（len 短时压得快些），再回到 rest（接着起跳就别站起来）
export const landPose = (foot: V3, yaw: number, framesSinceLand: number, len: number, rest = 0): FigurePose => {
  const absorbLen = Math.min(ABSORB, len * 0.5);
  if (framesSinceLand < absorbLen) return absorbPose(foot, yaw, Math.max(0, framesSinceLand) / absorbLen);
  const k = clamp01((framesSinceLand - absorbLen) / Math.max(1e-6, len - absorbLen));
  return absorbTail(crouchPose(foot, yaw, lerp(1.12, rest, ss(k)), lerp(25, 5, k)), k);
};

// 两跳之间在地上（s 落地后第几帧，len 待几帧）：卸力 → 蹲着蓄力（手往后甩、抬头看下一跳）→ 最后 `PUSH` 帧蹬直，同时转向下一跳。
// 只待 6 帧时蓄力只剩 1 帧，手少往后甩一点，不然一帧里来回抡
export const groundPose = (foot: V3, yawIn: number, yawOut: number, s: number, len: number): FigurePose => {
  const windEnd = len - PUSH;
  const absorbLen = Math.min(ABSORB, windEnd);
  const yaw = lerp(yawIn, nearYaw(yawIn, yawOut), ss(s / Math.max(1, windEnd)));
  if (s < absorbLen) return absorbPose(foot, yaw, Math.max(0, s) / absorbLen);
  const windFrames = windEnd - absorbLen;
  const armsBack = -60 * Math.min(1, windFrames / 3);
  const wind = (x: number) => {
    const k = clamp01((x - absorbLen) / Math.max(1, windFrames));
    const p = crouchPose(foot, yaw, lerp(1.12, 1, ss(k)), lerp(25, armsBack, ss(k)));
    return absorbTail({ ...p, headPitch: p.headPitch + 10 * ss(k) }, k);
  };
  if (s < windEnd) return wind(s);
  return mixPose(wind(windEnd), launchShape(foot, yaw), ss((s - windEnd) / PUSH));
};

// 两个姿势按 w 混合（角度线性插值，loc 用 a 的）
export const mixPose = (from: FigurePose, to: FigurePose, weight: number): FigurePose => {
  const mix = (x = 0, y = 0) => x + (y - x) * weight;
  return {
    loc: from.loc,
    pitch: mix(from.pitch, to.pitch),
    squash: 1,
    headPitch: mix(from.headPitch, to.headPitch),
    headYaw: mix(from.headYaw, to.headYaw),
    legR: mix(from.legR, to.legR),
    legL: mix(from.legL, to.legL),
    kneeR: mix(from.kneeR, to.kneeR),
    kneeL: mix(from.kneeL, to.kneeL),
    armR: mix(from.armR, to.armR),
    armRRoll: mix(from.armRRoll, to.armRRoll),
    elbowR: mix(from.elbowR, to.elbowR),
    armL: mix(from.armL, to.armL),
    armLRoll: mix(from.armLRoll, to.armLRoll),
    elbowL: mix(from.elbowL, to.elbowL),
    ground: mix(from.ground ?? 1, to.ground ?? 1),
    yaw: mix(from.yaw, to.yaw),
    twist: mix(from.twist, to.twist),
  };
};

// 弯腰开箱、伸手拿东西：u 0～1，0～0.3 弯腰伸手掀盖，0.3～0.75 手伸进箱里抓，0.75～1 收手直腰
export const lootPose = (foot: V3, yaw: number, progress: number, below = 1): FigurePose => {
  const bend = ss(progress / 0.25) * (1 - ss((progress - 0.8) / 0.2));
  const reach = ss((progress - 0.1) / 0.25) * (1 - ss((progress - 0.72) / 0.2));
  const grab = Math.sin(Math.PI * Math.min(1, Math.max(0, (progress - 0.35) / 0.35)));
  return {
    ...standPose(foot),
    pitch: -18 * bend * below,
    headPitch: -45 * bend,
    legR: 20 * bend,
    legL: 10 * bend,
    kneeR: 30 * bend,
    kneeL: 20 * bend,
    armR: 20 + 55 * reach - 15 * grab,
    armRRoll: 6,
    elbowR: 10 + 20 * grab,
    armL: 5 + 10 * bend,
    armLRoll: 8,
    elbowL: 15,
    yaw,
  };
};

// 原地转身挪步：整个人（yaw）转的那一段里 k 走 0～1，前半提一下转向那边的脚、后半另一只跟上（脚底不动，提腿屈膝看得出在挪步）。
// 用户 10-19：「你转头不转身体 很诡异」——转头看东西都是头先、肩和身子随后、脚挪步，身子的转用这个配脚
export const pivotStep = (pose: FigurePose, k: number, turnLeft: boolean): FigurePose => {
  const lead = bump(k, 0, 0.6);
  const follow = bump(k, 0.4, 1);
  const [r, l] = turnLeft ? [follow, lead] : [lead, follow];
  return { ...pose, legR: pose.legR + 22 * r, kneeR: (pose.kneeR ?? 0) + 38 * r, legL: pose.legL + 22 * l, kneeL: (pose.kneeL ?? 0) + 38 * l };
};

// 站着：放松站姿，手扶刀柄（左手按鞘）
export const standAt = (foot: V3, yaw: number, headYaw = 0, headPitch = 0): FigurePose => ({
  ...standPose(foot),
  armR: 8,
  armRRoll: 4,
  elbowR: 10,
  armL: -10,
  armLRoll: 6,
  elbowL: 35,
  headYaw,
  headPitch,
  yaw,
});

export { rad };
