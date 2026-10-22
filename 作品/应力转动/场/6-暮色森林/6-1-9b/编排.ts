// 6-1-9b 落地后（编排，纯函数）：第 1 场最后一段。6-1-9 一镜到底快到城堡时硬切过来，两人从天上落到终焉城堡主楼的屋顶平台上（落地编排.ts），
// 城堡里空无一物，九胡东张西望，李樱垮了下来。
//
// 段内第 0 帧 = 一镜到底全局帧 `F0`（一镜到底时间轴的末帧，两人在这一帧站定），之后按全局帧接着往下画（物理时间原速走，九胡的尾巴照一镜到底的相位接着摆），
// 机位和两人的动作由这里给。6-1-9 切在 F0 前一小节再早 `ONER_TRIM` 帧，中间的画面不演（见 落地编排.ts），配乐不跳、接着放。
// 场景、光照、地形全是一镜到底那一套（终焉高原城堡网格、暮色光照、云海），不另搭。
//
// 声音（声音.tsx）：配乐前一半接着 6-1-9 一路放下来（[29, 1] 进 breakdown、[31, 1] 渐弱到无声）、两人的落地声，九胡在镜头切到她那一拍后 0.5 秒开口，李樱在她说完 0.4 秒后开口。
//
// 戏（段内秒数 t，见 `cues`；两人面朝正北，李樱在前、九胡在他右后方）：
//   镜头 A（一镜到底末帧的机位：二人右前方低处）：两人从画面左边的垛口低低地滑进来落地、起身站定。李樱左右看了看找 boss；九胡东张西望。
//     镜头接着升高，从二人右边绕到身后上方、越过头顶往北看：屋顶平台上除了正中那块紫色力场方块什么都没有；镜头升到顶在 [28, 1] 重拍上切到九胡，下一小节她说着话时进 breakdown、低频抽走。
// 口型（src/lib/口型.ts）：九胡说话按配音张嘴（落地后.tsx）；李樱的脸没有表情骨骼，「表情垮掉」靠低头、塌身。
import { track } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { posToSec as 歌秒 } from '@engine/audio/曲目.ts';
import { ch6FlightMusic } from '../../../配乐/第六章飞行.ts';
import { lineTable } from '../../../配音/台词轨.tsx';
import * as P613 from '../6-1-3/编排.ts';
import * as choreo619 from '../6-1-9/编排.ts';
import { cameraAt as 一镜镜头, type Cam } from '../一镜到底/镜头.ts';
import * as route from '../一镜到底/路线.ts';

export const FPS = 24;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------- 接一镜到底 ----------
export const F0 = route.总帧数 - 1;
export const toGlobalFrame = (f: number) => F0 + f;
// 两人站的地方：脱手以后两人一起走的那个坐标系（路线.ts 的 `扫帚`，落地以后停住）落在屋顶上的那一点。朝向 0 = 两人面朝正北（+Y），
// 所以下面的「场」坐标就是世界坐标平移过来：x 东、y 北、z 上，原点在两人中间的屋顶面上（李樱在 y +0.35、九胡在 −0.35，骑扫帚.tsx 的座次）。
// 屋顶平台（6-1-9/编排.ts）在场坐标里约 x −23～+24、y −7～+40，紫色力场方块 x −10～+11、y +6～+27、高 11 格：机位都放在力场外面（进了力场整个画面蒙一层紫）
const B0 = route.扫帚(F0).位置;
const roofZ = choreo619.castleOrigin[2] + choreo619.ROOF_Z;
export const sceneOrigin: V3 = [B0[0], B0[1], roofZ];
export const fromScene = (p: number[]): V3 => [sceneOrigin[0] + p[0], sceneOrigin[1] + p[1], sceneOrigin[2] + p[2]];
const toScene = (p: number[]): V3 => [p[0] - sceneOrigin[0], p[1] - sceneOrigin[1], p[2] - sceneOrigin[2]];

// ---------- 配乐和台词 ----------
const song = ch6FlightMusic.song;
// 6-1-9 和本段之间剪掉的画面：F0 前一小节（用户 10-18 嫌落地后空镜头太多），再早 `ONER_TRIM` 帧（用户 10-20：「这边画面可以再减掉一点」，剪掉俯冲扎向城垛的那截）。
// 落地编排.ts 的 `F_CUT` = F0 − 这两截
export const BAR_CUT_FRAMES = Math.round(song.分析.网格.每小节拍数 * song.分析.网格.拍长 * FPS);
export const ONER_TRIM = 16;
// 只剪画面不剪配乐，配乐接着 6-1-9 一路放（用户 10-20：「这个音乐不要截一部分拼起来 你直接一次性放完不行吗？ 你不要硬凑时长一致好吧」）：
// 本段第 f 帧 = 一镜到底在 `F_CUT` + f 那一刻的配乐（同 一镜到底/画面.tsx：6-1-3 编排的 `songSec`(6-1-3 帧数 − 1 + 全局帧)）
export const musicStartSec = P613.songSec(P613.FRAMES - 1 + F0 - BAR_CUT_FRAMES - ONER_TRIM);
// 镜头升到顶、硬切到九胡的那一拍（段内秒数）：[28, 1] 重拍；[29, 1] 的 breakdown 在九胡说话时进来
export const cutBeatSec = 歌秒(song, [28, 1]) - musicStartSec;
// 台词落点（段内秒数；开口 = 第一个有声的时刻，同 台词轨）。九胡在切到她那一拍后 0.5 秒开口，李樱在她说完 0.4 秒后开口。字幕从这里取每句话的时间。
const jiuhuLineId = '6-1-9-九胡-什么也没有';
const liyingLineId = '6-1-9-李樱-没有最终boss';
const jiuhuLineStart = cutBeatSec + 0.5;
const liyingLineStart = jiuhuLineStart + lineTable[jiuhuLineId].有声长 + 0.4;
export const lineTimes = {
  jiuhu: { id: jiuhuLineId, lineStart: jiuhuLineStart, lineEnd: jiuhuLineStart + lineTable[jiuhuLineId].有声长 },
  liYing: { id: liyingLineId, lineStart: liyingLineStart, lineEnd: liyingLineStart + lineTable[liyingLineId].有声长 },
} as const;
// 台词轨要的（段内帧）
export const lineCues = [lineTimes.jiuhu, lineTimes.liYing].map((s) => ({ id: s.id, 帧: s.lineStart * FPS }));

// ---------- 时刻（段内秒数） ----------
export const landFrame = 4; // 李樱着地（段内帧）：切过来两人已经在画面左边往下滑（用户 10-18 要短）
const cutB = cutBeatSec + 0.16; // 硬切到九胡：重拍后 4 帧，镜头升到顶
export const cues = {
  // 镜头 A：先停在一镜到底末帧的机位看两人落地站起，再升到二人身后上方往北看，升到顶正好硬切
  rise: [1.4, cutB] as const,
  cutB,
  cutC: lineTimes.liYing.lineStart - 0.25, // 硬切到李樱：他开口前一点
  pullBack: [lineTimes.liYing.lineEnd - 1.0, lineTimes.liYing.lineEnd + 1.5] as const, // 说完前一秒起往后上方拉开
  // 九胡：东张西望；开口前转向李樱、探身凑到他肩旁
  turnToHim: [lineTimes.jiuhu.lineStart - 0.35, lineTimes.jiuhu.lineStart + 0.35] as const,
  // 李樱：开口「都穿越到mc了，」（1.2 秒上下）以后是后半句「没想到暮色森林还是没有最终boss！」
  secondHalf: lineTimes.liYing.lineStart + 1.35,
};
export const segSec = cues.pullBack[1] + 0.4;
export const frameCount = Math.round(segSec * FPS) + 1;

// ---------- 机位 ----------
// 场坐标里写，见 场。A0 = 一镜到底时间轴末帧（F0）的机位（原样取 镜头.ts）
const C0: Cam = 一镜镜头(F0);
type SceneCam = { pos: number[]; tgt: number[]; lens: number };
const camToScene = (c: Cam): SceneCam => ({ pos: toScene(c.pos), tgt: toScene(c.tgt), lens: c.lens });
const camFromScene = (c: SceneCam): Cam => ({ pos: fromScene(c.pos), tgt: fromScene(c.tgt), lens: c.lens });
export const camPoses = {
  A0: camToScene(C0), // 二人右前方（东北偏东）6.6 米、离屋顶 1.7 米，26mm
  // 升到顶：二人身后（南偏西）上方二十来米，越过他们头顶往北看：屋顶平台、力场方块、平台四周的城垛和角上的塔楼，再往外是城堡别处的塔楼
  A1: { pos: [-2, -18, 22], tgt: [0.5, 14, 0], lens: 20 },
  // 九胡中近景：她正前方，和她眼睛差不多高（她转向左前方的李樱，镜头里是她的四分之三侧脸）；李樱的右半身在画面右边、离镜头近一点。
  // 试过从她右前方拍（她转过去对着李樱，镜头里只剩侧脸和头发）、从她左前方拍（李樱整个挡在她前面）
  B0: { pos: [1.0, 2.85, 1.42], tgt: [0.55, 0.15, 1.3], lens: 32 },
  B1: { pos: [0.95, 2.55, 1.4], tgt: [0.55, 0.15, 1.32], lens: 32 },
  // 李樱近景：左前方，九胡在他右肩后面
  C0: { pos: [-1.15, 2.3, 1.62], tgt: [-0.05, 0.35, 1.55], lens: 38 },
  C1: { pos: [-1.0, 2.05, 1.58], tgt: [-0.05, 0.35, 1.5], lens: 38 },
  // 拉开：二人左前方高处（力场方块西边），空荡荡的屋顶平台、城垛
  C2: { pos: [-13, 5, 9], tgt: [0.5, -0.5, 0.4], lens: 22 },
};

const orbitLerp = (from: SceneCam, to: SceneCam, pivot: number[], k: number, ka = k): SceneCam => {
  const toSpherical = (cam: SceneCam) => {
    const offset = cam.pos.map((v, i) => v - pivot[i]);
    const dist = Math.hypot(offset[0], offset[1], offset[2]);
    const look = cam.tgt.map((v, i) => v - cam.pos[i]);
    const lookLen = Math.hypot(look[0], look[1], look[2]);
    return { d: dist, el: Math.asin(offset[2] / dist), az: Math.atan2(offset[1], offset[0]), aim: cam.pos.map((v, i) => v + (look[i] / lookLen) * dist) };
  };
  const sphA = toSpherical(from);
  const sphB = toSpherical(to);
  let da = sphB.az - sphA.az;
  da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
  const dist = Math.exp(lerp(Math.log(sphA.d), Math.log(sphB.d), k));
  const el = lerp(sphA.el, sphB.el, k);
  const az = sphA.az + da * ka;
  const pos = [Math.cos(el) * Math.cos(az) * dist + pivot[0], Math.cos(el) * Math.sin(az) * dist + pivot[1], Math.sin(el) * dist + pivot[2]];
  const aim = sphA.aim.map((v, i) => lerp(v, sphB.aim[i], k));
  return { pos, tgt: aim, lens: Math.exp(lerp(Math.log(from.lens), Math.log(to.lens), k)) };
};
const pairCenter = [0, 0, 1.2];
export const camPose = (frame: number): Cam => {
  const t = frame / FPS;
  const poses = camPoses;
  if (t <= cues.rise[0]) return C0; // 原样用一镜到底末帧的机位
  if (t < cues.cutB) {
    // 升：方位走得快一些（前四分之三就绕到二人身后），距离、仰角整段慢慢升上去：免得升到高处往下看时还在转方位，整个画面跟着打转（6-3-1/编排.ts 机位那一节的教训）
    const progress = (t - cues.rise[0]) / (cues.rise[1] - cues.rise[0]);
    return camFromScene(orbitLerp(poses.A0, poses.A1, pairCenter, ss(progress), ss(progress / 0.75)));
  }
  if (t < cues.cutC) return camFromScene(orbitLerp(poses.B0, poses.B1, [0.55, 0.15, 1.3], ss((t - cues.cutB) / (cues.cutC - cues.cutB))));
  if (t < cues.pullBack[0]) return camFromScene(orbitLerp(poses.C0, poses.C1, [0, 0.35, 1.5], ss((t - cues.cutC) / (cues.pullBack[0] - cues.cutC))));
  const progress = (t - cues.pullBack[0]) / (cues.pullBack[1] - cues.pullBack[0]);
  return camFromScene(orbitLerp(poses.C1, poses.C2, pairCenter, ss(progress), ss(progress)));
};

const LY_YAW: [number, number][] = [
  [0, 0], [1.3, 0], [1.8, 30], [2.2, 30], [2.9, -28], [3.3, -28], [3.9, 0], // 站起来以后左右看看找 boss
  [cues.turnToHim[0] + 0.3, 0], [cues.turnToHim[1] + 0.5, -24], [lineTimes.jiuhu.lineEnd - 0.2, -24], // 九胡叫他，转头看她（她在右后方）
  [cues.cutC - 0.05, -3], // 切到他之前转回前面
];
const LY_PITCH: [number, number][] = [
  [0, 0], [3.9, 0], [4.4, 7], [cues.turnToHim[0] + 0.3, 7], [cues.turnToHim[1] + 0.5, -5], [lineTimes.jiuhu.lineEnd - 0.2, -5], // 盯着前面的力场方块；九胡叫他时低头看她
  [cues.cutC - 0.05, 4], [lineTimes.liYing.lineStart + 0.55, 15], [cues.secondHalf, 12], // 「都穿越到mc了，」仰头看天
  [cues.secondHalf + 1.0, -14], [lineTimes.liYing.lineEnd, -24], [cues.pullBack[1], -26], // 后半句头一点点垂下去
];
const headShake = (t: number) => {
  const progress = (t - (cues.secondHalf + 0.9)) / 1.0;
  if (progress <= 0 || progress >= 1) return 0;
  return 9 * Math.sin(progress * 4 * Math.PI) * Math.sin(progress * Math.PI);
};
// 塌：身子往前一塌、两臂往前垂、往里收，后半句里慢慢塌下去（骨架没有脊柱，只能整个人往前倾一点）
const slump = (t: number) => ss((t - cues.secondHalf) / 1.6);
export const liyingTweak = (t: number) => ({
  headYaw: track(LY_YAW, t) + headShake(t),
  headPitch: track(LY_PITCH, t),
  pitch: -6 * slump(t),
  arm: 10 * slump(t),
  armRoll: 6 * slump(t),
});

// ---------- 九胡（骨骼增量，基岩动画约定：rot.x 正 = 低头 / 往前弯，rot.y 正 = 往右转；rot.z 正 = 上身往左歪，见 骑扫帚.tsx 裙片的 z） ----------
// 站位：九胡在李樱右后方（相对后座），两人的胳膊不打架（李樱连胳膊宽约 0.94 格、九胡约 0.7 格）。落地编排.ts 让她落在这里，下面 `jiuhuTweak` 只加凑过去那一点
export const jiuhuStepTo: V3 = [0.85, 0.3, 0];
const JH_HEAD_YAW: [number, number][] = [
  [0, 0], [1.5, 0], [1.9, 40], [2.4, 40], [2.95, -36], [3.5, -36], [4.1, 12], [4.6, 12], // 站起来以后东张西望：先往右（东）看，再往左（西）看，再看前面
  [cues.turnToHim[0], 12], [cues.turnToHim[1], -14], // 转向李樱（他在她左前方）
  [lineTimes.jiuhu.lineStart + 1.9, -14], [lineTimes.jiuhu.lineStart + 2.4, 30], [lineTimes.jiuhu.lineStart + 3.0, 30], [lineTimes.jiuhu.lineEnd + 0.2, -12], // 「为什么这里什么也没有啊」往右边看了看
  [cues.cutC + 1.5, -16],
];
const JH_HEAD_PITCH: [number, number][] = [
  [0, 0], [1.5, 0], [1.9, -8], [2.95, -6], [4.1, -10], // 往远处、往塔楼上看，头微微抬
  [cues.turnToHim[1], -16], [lineTimes.jiuhu.lineStart + 1.9, -16], [lineTimes.jiuhu.lineStart + 2.4, -6], [lineTimes.jiuhu.lineEnd + 0.2, -14], // 仰头看他（他比她高一截）
];
const JH_HEAD_ROLL: [number, number][] = [[0, 0], [lineTimes.jiuhu.lineStart + 2.9, 0], [lineTimes.jiuhu.lineEnd - 0.2, 14], [lineTimes.jiuhu.lineEnd + 1.2, 14], [cues.cutC + 2.5, 5]];
const JH_BODY_YAW: [number, number][] = [[0, 0], [cues.turnToHim[0], 0], [cues.turnToHim[1], -20]];
const JH_LEAN: [number, number][] = [[0, 0], [cues.turnToHim[0], 0], [cues.turnToHim[1], 12], [lineTimes.jiuhu.lineEnd + 0.4, 12], [lineTimes.jiuhu.lineEnd + 1.2, 4]];
// 凑过去：转向他的同时往前挪小半步，到他肩膀旁边（往他那边只挪一点，挪多了从前面拍会被他挡住），说完退回一点
const leanInOffset: V3 = [-0.08, 0.15, 0];
const JH_NEAR: [number, number][] = [[0, 0], [cues.turnToHim[0], 0], [cues.turnToHim[1], 1], [lineTimes.jiuhu.lineEnd + 0.4, 1], [lineTimes.jiuhu.lineEnd + 1.2, 0.5]];
const earFlickTimes = [1.9, 2.95, cues.turnToHim[1] - 0.1, lineTimes.jiuhu.lineEnd - 0.2];
export const jiuhuTweak = (t: number) => {
  const flick = earFlickTimes.reduce((s, a) => s + Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - a) / 0.25)) * Math.PI)), 0);
  return {
    offset: [leanInOffset[0] * track(JH_NEAR, t), leanInOffset[1] * track(JH_NEAR, t), 0] as V3,
    head: [track(JH_HEAD_PITCH, t), track(JH_HEAD_YAW, t), track(JH_HEAD_ROLL, t)],
    bodyYaw: track(JH_BODY_YAW, t),
    lean: track(JH_LEAN, t),
    earFlick: 12 * flick,
    // 东张西望时尾巴困惑地甩得快一点（相位速度的倍数，1 = 一镜到底原来的摆法）
    tailSpeed: 1 + 0.8 * ss((t - 1.5) / 0.6) * (1 - ss((t - cues.cutC) / 1.5)),
  };
};
