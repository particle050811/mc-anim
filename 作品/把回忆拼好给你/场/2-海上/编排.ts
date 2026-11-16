// 第 4 句（段 2-日落划船）谁在哪、镜头在哪：都按歌曲帧算，段和核对段共用。纯模块（不 import react、three）。
// 两个镜头：她右眼的特写（就是第 3 句祭坛那一镜，接着往里推，场/2-祭坛/末态.ts）→「眼化日」到「海平线」叠化，眼珠叠成海平线上的太阳 → 日落的海，
// 船往南偏西（太阳那边）划，镜头跟着船走、拉远一次 →「浪起」一道浪从下沿涌上来，到第 5 句起盖满。时刻在 分镜，数值在 参数.ts。
import type { V3 } from '@engine/model/parts.tsx';
import { boatParams, rowingStroke, boatToWorld, boatSeat } from '@库/物品/船原版.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第4句.ts';
import { skySphereAngle } from '../../地点/天体.ts';
import { endRig, finalDist, finalSpeed, eyeBall } from '../2-祭坛/末态.ts';
import { herLook, herFacesLeft, rowStartLeadTicks, seaCamera, boatYaw, sunHeight } from './参数.ts';
import { clamp, clamp01, lerp } from '@engine/core/数学.ts';

export const segKey = '2-日落划船';
export const segWindow = segmentWindow(segKey);
export const events = mainCutEvents;
/** 页面尺寸（成片的一半） */
export const pageSize: { readonly width: number; readonly height: number } = aspect;
/** 两头速度为 0 的平滑（smoothstep，最快处是平均速度的 1.5 倍） */
const smoothStep = (t: number) => t * t * (3 - 2 * t);
const radPerDeg = Math.PI / 180;

/** 段内帧 → 歌曲帧 */
export const toSongFrame = (f: number) => segWindow.起帧 + f;
/** 歌曲帧 → 歌上的秒 */
export const toSec = (g: number) => g / fps;

// ---------- 镜头切换 ----------
/** 匹配剪辑的叠化进度：「眼化日」前 0（只有眼睛），「海平线」起 1（只有海），中间按帧匀着走（海上.tsx 按 Bayer 阵一格一格换） */
export const crossfade = (g: number) => clamp01((g - events.eyeToSun.frame) / (events.horizon.frame - events.eyeToSun.frame));
/** 浪的进度：「浪起」0，到段尾（第 5 句起那一帧）1 = 盖满；段的最后一帧差一点盖满，第 5 句接着从 1 往 2 走（浪退出画面） */
export const surgeIn = (g: number) => clamp01((g - events.waveRises.frame) / (segWindow.止帧 - events.waveRises.frame));

// ---------- 太阳 ----------
/** 太阳中心的仰角（度）：原版天球角 0 在头顶、0.25 在西边地平线 */
export const sunElevation = (tick: number) => 90 - skySphereAngle(tick) * 360;
/** 「海平线」那一刻的游戏时间：太阳中心正好高 参数.太阳高 度（傍晚这一段天球角单调，二分） */
export const sunsetTick = (() => {
  let [a, b] = [11000, 13500];
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (sunElevation(m) > sunHeight) a = m;
    else b = m;
  }
  return (a + b) / 2;
})();
/** 歌曲帧 → 游戏刻（20 刻一秒，太阳照原版速度往下落） */
export const gameTick = (g: number) => sunsetTick + ((g - events.horizon.frame) / fps) * 20;
/** 太阳方向（单位向量）：东升西落，转轴南北 */
export const sunDirection = (tick: number): V3 => {
  const a = skySphereAngle(tick) * 2 * Math.PI;
  return [-Math.sin(a), 0, Math.cos(a)];
};
/** 原版太阳本体：离镜头 100 格、半边 7.5 格（贴图 32 格里正中 8 格，整张半边 30） */
export const sunBody = { dist: 100, halfSide: 7.5 } as const;

// ---------- 船 ----------
/** 你们开始划（按着前进）的秒数：第二桨的水声落在「桨入水」 */
export const rowStartSec = events.oarDips.sec - rowStartLeadTicks / 20;
const ticksSinceRowStart = (g: number) => (toSec(g) - rowStartSec) * 20;
/** 船头方向（单位向量，场景 x 东、y 北）：yaw 同 FigurePose，0 朝北、90 朝西 */
const boatDir: [number, number] = [-Math.sin(boatYaw * radPerDeg), Math.cos(boatYaw * radPerDeg)];
/** 「海平线」那一刻船在原点 */
const boatStartPath = rowingStroke(ticksSinceRowStart(events.horizon.frame)).lane;

export type BoatState = { loc: V3; yaw: number; oar: number | null; speed: number };
export const BoatState = (g: number): BoatState => {
  const tick = ticksSinceRowStart(g);
  const { lane: travelled, speed: speed } = rowingStroke(tick);
  const d = travelled - boatStartPath;
  return { loc: [boatDir[0] * d, boatDir[1] * d, -boatParams.hullDraft], yaw: boatYaw, oar: tick > 0 ? tick * boatParams.oarRadPerTick : null, speed: speed };
};

/** 一桨的水声：原版桨位跨过 π/4 的那一刻（开划后第 2、18、34… 刻），两支桨同一刻各一声。只要海上镜头里的（「海平线」到「浪起」） */
export const oarSoundSecs = (): number[] => {
  const r: number[] = [];
  for (let k = 2; rowStartSec + k / 20 <= events.waveRises.sec; k += 16) if (rowStartSec + k / 20 >= events.horizon.sec) r.push(rowStartSec + k / 20);
  return r;
};

/** 你：驾船的（第一个上船），坐前面、身子朝船头 */
export const youPos = (g: number) => {
  const b = BoatState(g);
  const seat = boatSeat(0, { passengerCount: 2, isPlayer: true });
  return { loc: boatToWorld(b.loc, b.yaw, seat.位), yaw: b.yaw + seat.转 };
};
/** 她：第二个上船，女仆是动物，侧坐；头往船头那边转一点 */
export const herPos = (g: number) => {
  const b = BoatState(g);
  const seat = boatSeat(1, { passengerCount: 2, isAnimal: true, animalFacesLeft: herFacesLeft });
  return { loc: boatToWorld(b.loc, b.yaw, seat.位), yaw: b.yaw + seat.转, 看: [herLook.pitch, herLook.yaw] as [number, number] };
};

// ---------- 海上的镜头 ----------
export type Perspective = { 眼: V3; 看: V3; fov: number };

/** 拉远的进度：「海平线」起、「拉远到位」止，两头慢 */
export const pullBack = (g: number) => smoothStep(clamp01((g - events.horizon.frame) / (events.pullBackDone.frame - events.horizon.frame)));

/** 海上的镜头：跟着船走，从 海镜.匹配 拉到 海镜.到位 */
export const seaCameraRig = (g: number): Perspective => {
  const b = BoatState(g);
  const k = pullBack(g);
  const { match: a, arrive: z } = seaCamera;
  const eye: V3 = [b.loc[0] + lerp(a.east, z.east, k), b.loc[1] - lerp(a.south, z.south, k), lerp(a.height, z.height, k)];
  const yawOffset = lerp(a.yawOffset, z.yawOffset, k) * radPerDeg;
  const pitchRad = lerp(a.pitchDeg, z.pitchDeg, k) * radPerDeg;
  // 正西是 −x，往北偏 = 往 +y 转
  const viewDir: V3 = [-Math.cos(pitchRad) * Math.cos(yawOffset), Math.cos(pitchRad) * Math.sin(yawOffset), -Math.sin(pitchRad)];
  return { 眼: eye, 看: [eye[0] + viewDir[0], eye[1] + viewDir[1], eye[2] + viewDir[2]], fov: lerp(a.fov, z.fov, k) };
};

// ---------- 投影（和 three 的 PerspectiveCamera.lookAt 一样：竖直视角、up 朝 +Z、不滚转） ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** 镜头的基：前、右、上 */
export const shotBasis = (rig: Perspective) => {
  const forward = normalize(sub(rig.看, rig.眼));
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  return { 前: forward, right, 上: up };
};

/** 从眼出发的方向 d 落在页面上哪里（页面像素，左上角原点）；在镜头后面返回 null */
export const projectDir = (rig: Perspective, d: V3, width = pageSize.width, height = pageSize.height): [number, number] | null => {
  const { 前: forward, right, 上: up } = shotBasis(rig);
  const z = dot(d, forward);
  if (z <= 0) return null;
  const t = Math.tan((rig.fov * radPerDeg) / 2);
  const nx = dot(d, right) / z / (t * (width / height));
  const ny = dot(d, up) / z / t;
  return [((nx + 1) / 2) * width, ((1 - ny) / 2) * height];
};
export const projectPoint = (rig: Perspective, p: V3, width = pageSize.width, height = pageSize.height) => projectDir(rig, sub(p, rig.眼), width, height);

/** 页面上 (x, y) 那一点的视线方向（单位向量），投影方向 的反函数 */
export const sightDir = (rig: Perspective, x: number, y: number, width = pageSize.width, height = pageSize.height): V3 => {
  const { 前: forward, right, 上: up } = shotBasis(rig);
  const t = Math.tan((rig.fov * radPerDeg) / 2);
  const nx = ((x / width) * 2 - 1) * t * (width / height);
  const ny = (1 - (y / height) * 2) * t;
  return normalize([forward[0] + right[0] * nx + up[0] * ny, forward[1] + right[1] * nx + up[1] * ny, forward[2] + right[2] * nx + up[2] * ny]);
};

/** 视线的仰角和离太阳的方位差（度）：太阳在正西（天球的转轴是南北，太阳的方位永远是正东或正西） */
export const elevationAzimuthDiff = (d: V3): { elevation: number; 差: number } => {
  const elevation = Math.asin(clamp(d[2], -1, 1)) / radPerDeg;
  const azimuthDiff = Math.atan2(d[1], d[0]) / radPerDeg - 180;
  return { elevation, 差: ((((azimuthDiff + 180) % 360) + 360) % 360) - 180 };
};

/** 太阳本体在页面上的中心和边长（页面像素） */
export const sunScreen = (rig: Perspective, tick: number, width = pageSize.width, height = pageSize.height) => {
  const d = sunDirection(tick);
  const c = projectDir(rig, d, width, height);
  if (!c) return null;
  // 本体的上下沿：沿太阳在天球上走的方向（和南北轴垂直）各偏 半边
  const sideDir: V3 = cross([0, 1, 0], d);
  const sunEdgeOffset = (s: number): V3 => [d[0] * sunBody.dist + s * sideDir[0] * sunBody.halfSide, 0, d[2] * sunBody.dist + s * sideDir[2] * sunBody.halfSide];
  const upperEdge = projectDir(rig, sunEdgeOffset(1), width, height);
  const lowerEdge = projectDir(rig, sunEdgeOffset(-1), width, height);
  const side = upperEdge && lowerEdge ? Math.hypot(upperEdge[0] - lowerEdge[0], upperEdge[1] - lowerEdge[1]) : 0;
  return { x: c[0], y: c[1], side };
};

/** 正对着镜头朝向的海平线在页面上的高度（页面像素） */
export const seaHorizonY = (rig: Perspective, height = pageSize.height) => {
  const { 前: forward } = shotBasis(rig);
  const p = projectDir(rig, normalize([forward[0], forward[1], 0]), pageSize.width, height);
  return p ? p[1] : height;
};

/** p 处一格有多少页面像素（沿镜头的上方向） */
export const pixelsPerCellAt = (rig: Perspective, p: V3, height = pageSize.height) => {
  const z = dot(sub(p, rig.眼), shotBasis(rig).前);
  return height / (2 * z * Math.tan((rig.fov * radPerDeg) / 2));
};

// ---------- 眼睛特写 ----------
/** 第 3 句最后一帧（末态.ts 的 末机）的歌曲帧：眼睛特写从这里接着推 */
export const joinFrame = segWindow.起帧 - 1;

/** 三次埃尔米特：p0、p1 两头的值，m0、m1 两头每秒的变化率，h 这一段几秒，s 0～1 */
const hermite = (p0: number, p1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
};

/** 眼睛特写的镜头：第 3 句祭坛那一镜（同一个场景，段把 场/2-祭坛 的画面接过来画），从 末机 接着往她右眼里推，到「眼化日」停稳：
 *  右眼眼珠落在 海镜.匹配 里太阳的位置、和太阳本体一样高。离眼珠的距离取对数用三次插值，起点的速度是 末速（接缝上推镜不停、不跳）；
 *  视角不变，镜头一直朝北（正对她），左右上下平移把眼珠从画面正中慢慢送到太阳的位置 */
export const eyeCameraRig = (g: number): Perspective => {
  const sun = sunScreen(seaCameraRig(events.eyeToSun.frame), gameTick(events.eyeToSun.frame))!;
  const t = Math.tan((endRig.fov * radPerDeg) / 2);
  const aspectRatio = pageSize.width / pageSize.height;
  const endDist = (eyeBall.height * pageSize.height) / (2 * t * sun.side);
  const s = clamp01((g - joinFrame) / (events.eyeToSun.frame - joinFrame));
  const distance = Math.exp(hermite(Math.log(finalDist), Math.log(endDist), finalSpeed, 0, toSec(events.eyeToSun.frame) - toSec(joinFrame), s));
  const k = smoothStep(s);
  const nx = (sun.x / pageSize.width) * 2 - 1;
  const ny = 1 - (sun.y / pageSize.height) * 2;
  const eye: V3 = [eyeBall.rightEye[0] - k * nx * t * aspectRatio * distance, eyeBall.rightEye[1] - distance, eyeBall.rightEye[2] - k * ny * t * distance];
  return { 眼: eye, 看: [eye[0], eye[1] + 1, eye[2]], fov: endRig.fov };
};

/** 照片帧（第 8 句第二张照片取这一帧）：歌曲帧 */
export const photoFrame = events.photoSunsetRowing.frame;
