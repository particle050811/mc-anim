// 第 7 章第 2 场两段共用的「戏」：李樱的动作、羊毛、箱子、感测体和尖啸、传送石粒子、远景对齐第 1 场的哪一刻。纯函数，输入场内帧 sf（见 时间线.ts）。
// 机位各段自己定（各段 编排.ts）。羊毛按 ../古城4x布局.ts 的名字（6-4-1～6-4-5 一路垫到 V，本场加 X），一跳是强者跳。
import type { V3 } from '@engine/model/parts.tsx';
import { type FigurePose } from '@库/角色/骨架.tsx';
import { warpStoneUseParticles, teleportParticles } from '@库/物品/传送石.tsx';
import type { ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { vibrationTravelTicks } from '@库/特效/振动粒子.tsx';
import { FPS, airPose, landPose, mixPose, nearYaw, pivotStep, standAt, takeoffPose, yawTo } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { placedWoolThrough, type ChestOpening, type 羊毛4x } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import * as geom from './几何.ts';
import * as timeline from './时间线.ts';
import * as K71 from '../../../地点/古城4x/7-1/戏.ts';
import * as T71 from '../../../地点/古城4x/7-1/时间线.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const ramp = (s: number, a: number, b: number) => ss((s - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const tickSec = 1 / 20;
export const 秒 = (sf: number) => sf / FPS;

// ---------- 跳 ----------
// V → X 的强者跳（时间线.ts 算好的：19.7 米、最高点比 V 高 3 格、1.26 秒）
export const 跳 = timeline.leap;
export const 落地 = timeline.landSec;
export const 垫羊毛 = 落地 - 0.22; // 落地前 0.22 秒往落脚处垫羊毛（同 古城戏.ts 的 PLACE_BEFORE）

// ---------- 羊毛 ----------
// 场景里已经有的（6-4-1～6-4-5 一路垫到 V），X 落地前 2 帧从小长到整块（同 6-4-5）
const placedWool: 羊毛4x[] = placedWoolThrough('V');
export const 羊毛 = (sf: number): { 已有: 羊毛4x[]; 长: { w: 羊毛4x; k: number }[] } => {
  const k = (秒(sf) - 垫羊毛) * FPS / 2;
  if (k >= 1) return { 已有: [...placedWool, 'X'], 长: [] };
  return { 已有: placedWool, 长: k >= 0 ? [{ w: 'X', k }] : [] };
};

// ---------- 箱子 ----------
// 开 #240：开盖、已开贴图都由画布按 模型/物品/箱子.tsx 算
export const 开箱 = (sf: number): ChestOpening => ({ 号: geom.chest.id, 开: timeline.lidOpenSec, 关: timeline.lidCloseSec, 秒: 秒(sf) });

// ---------- 振动链（同 6-4-2/编排.ts 的写法） ----------
// 两遍：开箱（container_open）、关箱（container_close），都从箱子中心发。感测体只在不激活（激活后 30 + 10 刻以外）时收；
// 尖啸体只第一个收到开箱那一遍的叫，之后警告在 10 秒冷却里，正在叫的那个（SHRIEKING 90 刻）也不收振动。
type Vibration = { from: V3; to: V3; t: number };
const sensorBusySec = 40 * tickSec; // SculkSensorBlock：ACTIVE 30 刻 + COOLDOWN 10 刻（同 幽匿感测体.tsx 的 sensorParams）
export const 声音链 = (() => {
  const vibrations: Vibration[] = [];
  const wave = (t0: number) =>
    geom.sensors.map((sensor) => {
      const to = geom.方块中心(sensor);
      // 箱子到感测体的连线不穿羊毛（脚下的 X 不在线上，核对.py 核过），都收得到
      vibrations.push({ from: geom.chestCenter, to, t: t0 });
      return t0 + vibrationTravelTicks(geom.chestCenter, to) * tickSec;
    });
  const shriekerHears = (activateTs: number[], skip: number[]) => {
    const clicks = geom.sensors.map((b, i) => ({ t: activateTs[i], p: geom.方块中心(b) }));
    const received: { i: number; t: number }[] = [];
    geom.shriekers.forEach((shrieker, i) => {
      if (skip.includes(i)) return;
      const to = geom.方块中心(shrieker);
      const distTo = (e: { p: V3 }) => Math.hypot(to[0] - e.p[0], to[1] - e.p[1], to[2] - e.p[2]);
      const cand = clicks.filter((e) => distTo(e) <= 8).sort((a, c) => a.t - c.t || distTo(a) - distTo(c));
      if (!cand.length) return;
      vibrations.push({ from: cand[0].p, to, t: cand[0].t });
      received.push({ i, t: cand[0].t + vibrationTravelTicks(cand[0].p, to) * tickSec });
    });
    return received.sort((a, c) => a.t - c.t);
  };
  const openActivate = wave(timeline.lidOpenSec);
  const received = shriekerHears(openActivate, []);
  // 第一个收到的叫；第二个收到时警告已在 10 秒冷却里，不叫
  const shriekI = received[0].i;
  const shrieking = geom.shriekers[shriekI];
  if (openActivate.some((t) => timeline.lidCloseSec < t + sensorBusySec)) throw new Error('7-2-2至3 关箱时有感测体还在激活或冷却里，第二遍咔嗒的写法不成立');
  const closeActivate = wave(timeline.lidCloseSec);
  shriekerHears(closeActivate, [shriekI]);
  // 振动还在路上的感测体也不收新的（VibrationSystem.Listener：已有 currentVibration 就不收）
  if (timeline.useStartSec < timeline.lidCloseSec || closeActivate.some((t) => timeline.useStartSec >= t + sensorBusySec)) throw new Error('7-2-2至3 按住传送石时有感测体不在激活里，会再收一次 item_interact_start');
  return { vibrations: vibrations, activateSecs: openActivate, reactivateSecs: closeActivate, shriek: { 块: shrieking, p: geom.方块底心(shrieking), t: received[0].t } };
})();
export const 振动们 = 声音链.vibrations;
export const 激活秒 = 声音链.activateSecs; // 开箱那一遍各感测体激活的场内秒（≈ 开盖 + 1、4、6 刻）
export const 再激活秒 = 声音链.reactivateSecs; // 关箱那一遍
// 第 i 个感测体在 sec 时最近一次激活的场内秒（还没激活过就取开箱那一遍，给负的「激活后秒数」）
export const 最近激活秒 = (i: number, sec: number) => (sec >= 再激活秒[i] ? 再激活秒[i] : 激活秒[i]);
export const 尖啸 = 声音链.shriek; // 开盖后约 8 刻：(−956, −47, 229) 4 刻激活 → (−955, −50, 226) 再 4 刻
export const 回应秒 = 尖啸.t + timeline.shriekResponseSec; // 段3末之前不演回应
if (timeline.sceneFrames - 1 >= 回应秒 * FPS) throw new Error('7-2-2至3 拍到了尖啸体的回应（黑暗、第二只监守者），要么缩短，要么把回应演出来');
// 感测体触须的钟（只管不激活时那 32 刻一圈的慢摆；整体加 32 秒免得出现负数）
export const 感测体钟 = (sf: number) => 秒(sf) + 32;

// ---------- 李樱 ----------
export type 李樱态 = { pose: FigurePose; 在: boolean; teleportStone: boolean };
const gazeYaw = nearYaw(geom.leapToChestYaw, geom.lookoutYaw); // 往左转 169°
const turnBackYaw = nearYaw(gazeYaw, geom.leapToChestYaw); // 再往右转回来
const openChestYaw = nearYaw(turnBackYaw, geom.openChestYaw);
// 头往下看远景的角度：眼睛（游戏 y −39.4）到 64 米外监守者胸口（y −49.4）约 −9°
const gazeHeadPitch = -9;

// 开箱、看箱子界面的姿势（站在箱前羊毛上、面朝西；箱子在脚边）：右手伸过去掀开箱盖，收回来；
// 开着界面时游戏里人不动，这里低头看着箱子、呼吸（站着别定格，用户 10-13）。古卷、护腿是在界面里移进物品栏的，不拿在手上（用户 10-19）。
const openChestPose = (sec: number): FigurePose => {
  const base = standAt(geom.chestFrontFeet, openChestYaw, 0, -20);
  const reach = ramp(sec, 落地 + timeline.landSquatSec * 0.6, timeline.lidOpenSec + 0.05) * (1 - ramp(sec, timeline.lidOpenSec + 0.1, timeline.lidOpenSec + 0.45));
  const bend = ramp(sec, 落地 + timeline.landSquatSec * 0.5, timeline.lidOpenSec) * (1 - ramp(sec, timeline.lidOpenSec + 0.1, timeline.lidOpenSec + 0.5));
  const breathIn = ramp(sec, timeline.lidOpenSec + 0.3, timeline.lidOpenSec + 0.6);
  const breath = (Math.sin(sec * 4.2) * 0.5 + 0.5) * breathIn;
  const breathLag = (Math.sin(sec * 4.2 - 0.7) * 0.5 + 0.5) * breathIn;
  // 说「开到了！」时头抬一点
  const lift = ramp(sec, timeline.gotItLineT - 0.1, timeline.gotItLineT + 0.2) * (1 - ramp(sec, timeline.gotItLineT + timeline.gotItLineDur, timeline.gotItLineT + timeline.gotItLineDur + 0.4));
  return {
    ...base,
    squash: 1 - 0.012 * breath,
    pitch: -14 * bend - 1.5 * breath,
    headPitch: -20 - 20 * bend - 12 * breathIn + 8 * lift - 1.5 * breathLag,
    armR: lerp(8, 55, reach) + 2 * breathLag,
    elbowR: lerp(10, 15, reach),
    armL: -10 + 2 * breathLag,
  };
};
// 关箱以后到传走：警惕地张望（用户 10-19：等传送别站桩，要防着被打断）。尖啸体刚叫过，他怕监守者被召来、传送被打断：
// 关箱那一遍感测体咔嗒（反应 0.12 秒）就转头看过去、稍压低重心；按住传送石时看一眼叫过的尖啸体，再侧头往左肩后（监守者那边）瞄一眼，最后看回前面。
// 幅度收着（用户 10-20：「画面紧张 有点太夸张了 不用这么夸张」）：只稍压低，头转得不急，往后瞄只侧过头和半个肩、不整个扭回去，往下看不超过 `MAX_LOOK_DOWN`。
// 转头都是头先、肩随后、身子再随后，身子转得多时脚挪步（同 6-4-2 尖啸后定住）。右手拉弓式举着传送石（原版 UseAnim.BOW 的右臂，见 传送石.tsx 的 拉弓手臂），
// 一直按住、跟着身子转；左手不举，按在鞘口上随时准备拔（用户 10-19 定，不照 BOW 的双手）。
const DEG = 180 / Math.PI;
const eye: V3 = [geom.chestFrontFeet[0], geom.chestFrontFeet[1], geom.chestFrontFeet[2] + 1.62];
// 看某个方块中心：相对开箱朝向（西）的 yaw、俯仰
const gazeAt = (p: V3) => ({
  yaw: nearYaw(0, yawTo(p[0] - eye[0], p[1] - eye[1]) - geom.openChestYaw),
  pitch: Math.atan2(p[2] - eye[2], Math.hypot(p[0] - eye[0], p[1] - eye[1])) * DEG,
});
const firstClickI = 再激活秒.indexOf(Math.min(...再激活秒));
export const 警觉秒 = 再激活秒[firstClickI] + 0.12;
const MAX_LOOK_DOWN = -18;
const glance = (g: { yaw: number; pitch: number }) => ({ yaw: g.yaw, pitch: Math.max(MAX_LOOK_DOWN, g.pitch) });
// 往后瞄监守者那边（东，在他正身后）从左肩转：脸转向机位（南）这边，只转到侧后方
const LOOK_BACK_YAW = 100;
const gazeKeys: { t: number; yaw: number; pitch: number }[] = [
  { t: -Infinity, yaw: 0, pitch: -40 }, // 开箱时低头看箱子
  { t: 警觉秒, ...glance(gazeAt(geom.方块中心(geom.sensors[firstClickI]))) },
  { t: timeline.lidCloseSec + 0.65, ...glance(gazeAt(geom.方块中心(尖啸.块))) },
  { t: timeline.lidCloseSec + 1.15, yaw: LOOK_BACK_YAW, pitch: 0 },
  { t: timeline.lidCloseSec + 1.55, yaw: 10, pitch: 0 },
];
// 各部位跟到第 i 个注视点：lag 秒后开始、dur 秒转完
const follow = (sec: number, pick: (k: (typeof gazeKeys)[number]) => number, lag: number, dur: number) =>
  gazeKeys.slice(1).reduce((v, k, i) => v + (pick(k) - pick(gazeKeys[i])) * ramp(sec, k.t + lag, k.t + lag + dur), pick(gazeKeys[0]));
const HEAD_DUR = 0.3;
const BODY_SHARE = 0.25;
const BODY_LAG = 0.15;
const BODY_DUR = 0.5;
const alertPose = (sec: number): FigurePose => {
  const crouch = ramp(sec, 警觉秒, 警觉秒 + 0.4);
  const body = BODY_SHARE * follow(sec, (k) => k.yaw, BODY_LAG, BODY_DUR);
  const twist = 0.15 * follow(sec, (k) => k.yaw, 0.08, 0.35);
  const headYaw = Math.max(-75, Math.min(75, follow(sec, (k) => k.yaw, 0, HEAD_DUR) - body - twist));
  const breath = Math.sin(sec * 4.2) * 0.5 + 0.5;
  const k = ramp(sec, timeline.useStartSec, timeline.useStartSec + 0.15);
  const takeOut = ramp(sec, timeline.stoneOutSec - 0.05, timeline.useStartSec); // 拿出来、端到身前
  const pose: FigurePose = {
    ...standAt(geom.chestFrontFeet, openChestYaw + body, headYaw, follow(sec, (g) => g.pitch, 0, HEAD_DUR)),
    twist,
    pitch: -3 * crouch - breath,
    squash: 1 - 0.015 * crouch,
    legR: 8 * crouch,
    legL: 5 * crouch,
    kneeR: 14 * crouch,
    kneeL: 10 * crouch,
    armR: lerp(lerp(8, 35, takeOut), 90 + 3 * crouch, k),
    armRRoll: lerp(4, 0, k),
    armRYaw: 0.1 * DEG * k,
    elbowR: lerp(lerp(10, 30, takeOut), 0, k),
  };
  // 身子转得多的那几下，转的同时脚挪一步
  const turning = gazeKeys.slice(1).map((g, i) => ({ g, d: BODY_SHARE * (g.yaw - gazeKeys[i].yaw) })).find(({ g, d }) => Math.abs(d) > 10 && sec >= g.t + BODY_LAG && sec < g.t + BODY_LAG + BODY_DUR);
  return turning ? { ...pivotStep(pose, (sec - turning.g.t - BODY_LAG) / BODY_DUR, turning.d > 0), squash: pose.squash } : pose;
};

export const 李樱 = (sf: number): 李樱态 => {
  const sec = 秒(sf);
  // 开场就朝着远景站着看，不演转过去（用户 10-19：「没有必要加一个多余的转身」）；头跟着远处的打斗微微左右动
  if (sec < timeline.turnBackStart) {
    // 站着别定格（用户 10-13）：呼吸，身子一起一伏、手慢半拍；转回身之前收掉，和转身、蹲的姿势接得上
    const breathFade = 1 - ramp(sec, timeline.turnBackStart - 0.3, timeline.turnBackStart);
    const base = standAt(geom.roofFeet, gazeYaw, 5 * Math.sin(sec * 1.1 + 0.4) * breathFade, gazeHeadPitch);
    const breath = (Math.sin(sec * 4.2) * 0.5 + 0.5) * breathFade;
    const breathLag = (Math.sin(sec * 4.2 - 0.7) * 0.5 + 0.5) * breathFade;
    const pose: FigurePose = {
      ...base,
      squash: 1 - 0.012 * breath,
      pitch: -1.5 * breath,
      headPitch: (base.headPitch ?? 0) - 1.5 * breathLag,
      armR: (base.armR ?? 0) + 2 * breathLag,
      armL: (base.armL ?? 0) + 2 * breathLag,
    };
    return { pose, 在: true, teleportStone: false };
  }
  // 转回东南、蹲、跳
  const frame = sf;
  if (frame < 跳.f0) {
    const yaw = lerp(gazeYaw, turnBackYaw, ramp(sec, timeline.turnBackStart, timeline.turnBackEnd));
    if (sec < timeline.crouchStart) return { pose: standAt(geom.roofFeet, yaw, 0, lerp(gazeHeadPitch, -14, ramp(sec, timeline.turnBackStart, timeline.turnBackEnd))), 在: true, teleportStone: false };
    const crouchProgress = (sec - timeline.crouchStart) / (timeline.takeoffSec - timeline.crouchStart);
    return { pose: takeoffPose(geom.roofFeet, yaw, crouchProgress), 在: true, teleportStone: false };
  }
  if (frame < 跳.f1) return { pose: { ...airPose(跳, frame), yaw: turnBackYaw }, 在: true, teleportStone: false };
  const sinceLand = sec - 落地;
  if (sinceLand < timeline.landSquatSec) {
    const yaw = lerp(turnBackYaw, openChestYaw, ramp(sinceLand, 0, timeline.landSquatSec));
    return { pose: landPose(geom.chestFrontFeet, yaw, sinceLand * FPS, timeline.landSquatSec * FPS), 在: true, teleportStone: false };
  }
  if (sec < timeline.teleportSec) {
    // 落地蹲完接开箱姿势：头 0.15 秒从蹲的姿势混过去；感测体再咔嗒一响就混进警觉的姿势（0.25 秒）
    const openPose = openChestPose(Math.min(sec, 警觉秒));
    const blend = ramp(sinceLand, timeline.landSquatSec, timeline.landSquatSec + 0.15);
    const settled = blend < 1 ? mixPose(landPose(geom.chestFrontFeet, openChestYaw, timeline.landSquatSec * FPS, timeline.landSquatSec * FPS), openPose, blend) : openPose;
    const w = ramp(sec, 警觉秒, 警觉秒 + 0.25);
    const alert = alertPose(sec);
    const pose = w > 0 ? { ...mixPose(settled, alert, w), squash: lerp(settled.squash, alert.squash, w), armRYaw: (alert.armRYaw ?? 0) * w } : settled;
    return { pose: { ...pose, loc: geom.chestFrontFeet }, 在: true, teleportStone: sec >= timeline.stoneOutSec };
  }
  return { pose: standAt(geom.chestFrontFeet, openChestYaw), 在: false, teleportStone: false };
};

// ---------- 传送石的粒子（刻 = 场内秒 × 20） ----------
export const 使用粒子: ParticleSpawn[] = warpStoneUseParticles(() => geom.chestFrontFeet, [1, 0, 0], timeline.useStartSec * 20, 7203);
export const 传走粒子: ParticleSpawn[] = teleportParticles(geom.chestFrontFeet, timeline.teleportSec * 20, 7213);

// 远景：李樱看到的是第 1 场同一剧情时刻（用户 10-19 定：同一条时间线上的观察），t = 远景t起 + 场内秒，人、怪、护盾、箭、马都由 ../7-1/画面.tsx 的 `SceneActors` 照 t 画。
// 对齐：从 V 上（李樱眼睛）望过去，监守者只有刘心忠闪避、甩护盾到马跃上墙头前那 3 秒多露出来（腰以上；别的时候整个藏在高台、深板岩砖后面，工具/机位核对 查过），
//   所以镜 Jade 正好卡这段：Jade 里是护盾挡它拍、黄叛两支风矢钉上它（血跟着掉）。
// 两场共用古城4x 原点，坐标不用换算。
export const 远景t起 = T71.shieldT - 0.55;
export const 远景t = (sf: number) => 远景t起 + 秒(sf);
if (远景t((timeline.jadeShotEndSec) * FPS) > K71.sceneEndT) throw new Error('7-2-1 镜 Jade 拍到了第 1 场之后（第 3 场）的时刻，SceneActors 只管第 1 场');
