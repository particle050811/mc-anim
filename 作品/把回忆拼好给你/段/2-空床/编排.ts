// 2-空床 每一帧她在哪、什么姿势，窗光哪一档、调子、天色，镜头挪到哪。按段内帧算，时刻取 分镜 的正片事件，分寸取 场/2-卧室/参数.ts。纯模块（测试也引）。
// 她：38.46 弯腰抚平你那张床的被子（每拍抹一下），39.31 前直起身、转过来、退半步坐在床沿，之后一动不动（不眨眼、不呼吸、尾巴不摆），
//   40.59 不到十分之一秒里猛地抬头转向门口（上身一挺，过头一下再回来），表情换成惊讶。
// 窗光：每拍跳一档，档和档之间不插值（平涂、一档一档挪）。镜头：横移起 到段尾往右横移出屋，先慢后快，最后一帧还在动；
//   横移时屋外是早上的天和林子，整片后期跟着横移往 2-时差 开头服务器那半的调子走（接缝不跳亮度）。
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import type { ShadingSceneParams } from '@engine/三渲二/光影/预设.ts';
import { lerpTone, type Tone } from '@engine/三渲二/调子.ts';
import type { MagicalWineFoxAllExpression } from '@库/角色/魔法酒狐新动作.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { fps, oneFrameSec, segmentFrames } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine12Events, segmentWindow } from '../../分镜/正片第12句.ts';
import { events as mainCutLines13To14Events } from '../../分镜/正片第13至14句.ts';
import type { SideFraming } from '../../地点/侧剖面.tsx';
import { midGrove } from '../../地点/樱花林.ts';
import type { BedroomOutside } from '../../场/2-卧室/卧室.tsx';
import { splitScreenCount, SplitState, splitLayout, formShift, shapeOffsetAt, serverFraming, serverToneAt } from '../../场/2-门口/分屏参数.ts';
import { skyColors, dayTick, biome } from '../../场/2-门口/参数.ts';
import { beatGrid } from '../../配乐/网格.ts';
import { palette } from '../../色板.ts';
import * as params from '../../场/2-卧室/参数.ts';
import { sitBedEdgeSkeleton, smoothSkeleton } from '../../场/2-卧室/姿势.ts';
import { bedSurfaceHeight } from '../../物品/床尺寸.ts';
import { mixColor } from '../../现实/像素图.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLine12Events, ...mainCutLines13To14Events };
const segMainCutEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, mainCutEvents);

export const segKey = '2-空床';
export const events = segMainCutEventFrames(segKey);
const thisWindow = segmentWindow(segKey);
export const frameCount = thisWindow.帧数;
/** 段内帧 → 歌曲帧（颗粒的种子、歌词用它） */
export const toSongFrame = (f: number) => thisWindow.起帧 + f;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const beatFrames = beatGrid.拍长 * fps;

type BoneTable = Record<string, BonePose>;
/** 两张骨骼表逐字段插值（转角、位移、缩放；一边没有的当 0° / 0 / 1） */
const lerpBonePose = (a: BoneTable, b: BoneTable, t: number): BoneTable => {
  const r: BoneTable = {};
  const toVec3 = (x: number | number[] | undefined, missingVal: number) => (x === undefined ? [missingVal, missingVal, missingVal] : typeof x === 'number' ? [x, x, x] : x);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [p, q] = [a[k] ?? {}, b[k] ?? {}];
    const lerpVec3 = (u: number[], v: number[]) => u.map((x, i) => lerp(x, v[i]!, t));
    r[k] = { rot: lerpVec3(toVec3(p.rot, 0), toVec3(q.rot, 0)), pos: lerpVec3(toVec3(p.pos, 0), toVec3(q.pos, 0)), scale: lerpVec3(toVec3(p.scale, 1), toVec3(q.scale, 1)) };
  }
  return r;
};

// ---------- 她 ----------
export type LiYingState = {
  loc: V3;
  /** 度，0 朝北（背对镜头）、90 朝西（门）、180 朝镜头、−90 朝东（床） */
  yaw: number;
  expression: MagicalWineFoxAllExpression;
  看: [number, number];
  skeleton: BoneTable;
};

/** 转身起、坐下起（段内帧，可以带小数）：倒推到 坐床沿 那一帧正好坐稳。
 *  这两段都是「起那一帧已经走了一帧」：插值从起前一帧（转身、坐下的 k = 0，和上一段末了一样）开始算，到这一刻换段，连着不跳。
 *  原来走了 1/24 秒，60 fps 下起那一帧先跳 2.5 帧的量（用户 11-03「统统改成 60 帧」） */
export const sitDownStart = events.坐床沿 - params.sitDownSec * fps;
export const turnStart = sitDownStart - params.turnSec * fps;

/** 抚平：每拍抹一下，七成拍长往床沿抹回来（缓进缓出）、三成拍长伸回床里侧 */
export const wipe = (f: number) => {
  if (f < events.抚平被子) return 0;
  const p = (((f - events.抚平被子) / beatFrames) % 1 + 1) % 1;
  if (p < 0.7) return smoothstep(p / 0.7);
  return 1 - (p - 0.7) / 0.3;
};

/** 抚平那几帧的骨骼：手的远近、弯腰深浅都跟着 抹 走；手顺着她的朝向伸出去 */
export const smoothPose = (f: number) => {
  const m = wipe(f);
  const { far, near, farBend, nearBend, headLift } = params.smoothHand;
  return smoothSkeleton(lerp(far, near, m), bedSurfaceHeight, lerp(farBend[0], nearBend[0], m), lerp(farBend[1], nearBend[1], m), headLift, params.smoothTailPress);
};

/** 坐着时的朝向写成从抚平的朝向往镜头那边转过去的连续角度：抚平朝向 → −180（朝镜头）→ 坐朝向 − 360 */
const sitYaw = params.seatYaw - 360;

/** 坐床沿骨骼上叠天亮那一挺（UpperBody 往后仰） */
const straighten = (x: number): BoneTable => ({ ...sitBedEdgeSkeleton, UpperBody: { rot: [x, 0, 2] } });

export const LiYingState = (f: number): LiYingState => {
  const standPos: V3 = [...params.smoothStandPos];
  const sitPos: V3 = [...params.bedEdgeSeat];
  const smoothHead: [number, number] = [params.smoothHand.headLift, 0];
  if (f < turnStart - 1) return { loc: standPos, yaw: params.smoothYaw, expression: '无', 看: smoothHead, skeleton: smoothPose(f) };
  if (f < sitDownStart - 1) {
    // 直起身、从朝镜头那边转过去（看得见一眼脸）：弯腰的骨骼、朝向、头一起插
    const k = smoothstep(((f - turnStart) / fps + oneFrameSec) / params.turnSec);
    return { loc: standPos, yaw: lerp(params.smoothYaw, sitYaw, k), expression: '无', 看: [lerp(smoothHead[0], -10, k), 0], skeleton: lerpBonePose(smoothPose(turnStart - 1), {}, k) };
  }
  if (f < events.坐床沿) {
    // 退半步、坐下：位置和骨骼一起从站着插到坐床沿
    const k = smoothstep(((f - sitDownStart) / fps + oneFrameSec) / (params.sitDownSec + oneFrameSec));
    const loc: V3 = [lerp(standPos[0], sitPos[0], k), lerp(standPos[1], sitPos[1], k), lerp(standPos[2], sitPos[2], k)];
    return { loc, yaw: sitYaw, expression: '无', 看: [lerp(-10, params.nightWatchLook[0], k), lerp(0, params.nightWatchLook[1], k)], skeleton: lerpBonePose({}, sitBedEdgeSkeleton, k) };
  }
  if (f < events.天亮转头) return { loc: sitPos, yaw: sitYaw, expression: '无', 看: params.nightWatchLook, skeleton: sitBedEdgeSkeleton };
  // 天亮：转头秒 的前一半转到过头（起那一帧已经走了一帧），后一半停在过头，到 转头秒 回到正对门口
  const i = (f - events.天亮转头) / fps;
  if (i < params.turnHeadSec - 1e-9) {
    const k = Math.min(1, (i + oneFrameSec) / (params.turnHeadSec / 2));
    const gaze: [number, number] = [lerp(params.nightWatchLook[0], params.lookDoorOver[0], k), lerp(params.nightWatchLook[1], params.lookDoorOver[1], k)];
    return { loc: sitPos, yaw: sitYaw, expression: '惊讶', 看: gaze, skeleton: straighten(lerp(0, params.turnTorsoOver, k)) };
  }
  return { loc: sitPos, yaw: sitYaw, expression: '惊讶', 看: params.lookAtDoor, skeleton: straighten(params.turnTorsoUpright) };
};

/** 她的平涂色调：屋里的色调往白里提 她提亮（夜里读成月光落在她身上） */
export const herTone = (hexColor: string) => {
  const c = /^#([0-9a-f]{6})$/i.exec(hexColor);
  if (!c) throw new Error(`色调要写成 #rrggbb：${hexColor}`);
  const v = parseInt(c[1]!, 16);
  return '#' + [16, 8, 0].map((s) => Math.round(lerp((v >> s) & 255, 255, params.liYingLift)).toString(16).padStart(2, '0')).join('');
};

// ---------- 窗光、调子 ----------
/** 这一帧窗光在第几档（参数.ts 的 窗光档们）：坐床沿 之前也是第一档 */
export const lightTier = (f: number) => [events.窗光二, events.窗光三, events.月落, events.天亮转头].filter((e) => f >= e).length;

/**
 * 屋里的调子、后窗的天、窗光、门外亮不亮。月落那一档（半拍）里天一点点亮起来：调子（晓）和后窗的天从月落那档往天亮那档线性走，
 * 天亮转头 那一帧到位；光斑、门外照旧在 天亮转头 那一帧一下换（太阳一露头就照进来，光斑是平涂的一块）。
 * 核查 10-24：原来夜里一帧跳成天亮，整屋一下亮一大截，像切了镜头
 */
export const lightState = (f: number) => {
  const i = lightTier(f);
  const k = i === 3 ? (f - events.月落) / (events.天亮转头 - events.月落) : 0;
  const t: Tone = lerpTone(palette.夜, palette.日落, lerp(params.dawnLevels[i]!, params.dawnLevels[4]!, k));
  return { 光: params.windowLightLevels[i]!, tone: t, 天: mixColor(params.skyColors[i]!, params.skyColors[4]!, k), outsideLit: i >= params.outsideLitLevel };
};

/** 过 p0～p3 的一段 Catmull-Rom（t 0～1 从 p1 走到 p2） */
const catmullRom = (p0: readonly number[], p1: readonly number[], p2: readonly number[], p3: readonly number[], t: number) =>
  p1.map((_, i) => {
    const [a, b, c, d] = [p0[i]!, p1[i]!, p2[i]!, p3[i]!];
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  });

/**
 * 开光影时交给光影的事实（三渲二画布的 光影场）：月亮、太阳在哪，照进来几成，哪套灯。
 * 月亮：坐床沿 起沿 参.月亮们 连着挪（Catmull-Rom），窗光三 和 月落 正中起光淡下去（第三档爬上后墙那一下看得见）、月落 没了；太阳：月落 到 天亮转头 从 日出.起 升到 日出.止、光淡进来，之后不动。
 * 时段：月落 起换 日落（日出的暖光）；那一刻光是 0，两套灯的影子一样（默认.ts 的 屋里月光），换了看不出来
 */
export const shadingSceneAt = (f: number): ShadingSceneParams => {
  if (f >= events.月落) {
    const k = smoothstep(clamp01((f - events.月落) / (events.天亮转头 - events.月落)));
    const sun = params.sunrise.起.map((v, i) => lerp(v, params.sunrise.止[i]!, k)) as [number, number, number];
    return { timeOfDay: '日落', sun, lightIntensity: k };
  }
  const moons = params.moonPositions;
  const s = (moons.length - 1) * clamp01((f - events.坐床沿) / (events.月落 - events.坐床沿)) ** params.moonPathPow;
  const i = Math.min(moons.length - 2, Math.floor(s));
  const pointAt = (j: number) => moons[Math.max(0, Math.min(moons.length - 1, j))]!;
  const sun = catmullRom(pointAt(i - 1), pointAt(i), pointAt(i + 1), pointAt(i + 2), s - i) as [number, number, number];
  const fadeStartFrame = (events.窗光三 + events.月落) / 2;
  return { timeOfDay: '夜', sun, lightIntensity: 1 - smoothstep(clamp01((f - fadeStartFrame) / (events.月落 - fadeStartFrame))) };
};

// ---------- 镜头 ----------
/** 横移走了几成（按秒）：横移起 那一帧已经走了一帧，段的最后一帧是 1（原来按 24 fps 走了 1/24 秒、段尾前 1/24 秒走完，用户 11-03「统统改成 60 帧」） */
const slideLinear = (f: number) => Math.max(0, ((f - events.横移起) / fps + oneFrameSec) / ((frameCount - events.横移起) / fps));

/** 横移进度：0 起，段的最后一帧走完 1（t^幂 加速），最后一帧还在最快 */
export const slideProgress = (f: number) => slideLinear(f) ** params.sideMove.exponent;

/** 取景中心挪到成片的偶数像素上（像素网格不闪） */
const snap = (cell: number, pxPerCell: number) => (Math.round((cell * pxPerCell) / 2) * 2) / pxPerCell;

/** 横移的时候中心不吸：吸到偶数像素时 60 fps 下起步那截一帧挪 2 像素、几帧不挪，一顿一顿（用户 11-03「统统改成 60 帧」）；不吸时贴图像素宽窄差 1 像素，动着看不出来 */
export const shotAt = (f: number): SideFraming => {
  const { 中心: center, pxPerCell } = params.bedroomFraming;
  const progress = slideProgress(f);
  const x = center[0] + params.sideMove.right * progress;
  return { 中心: [progress > 0 ? x : snap(x, pxPerCell), center[1]], pxPerCell };
};

/** 横移走完那一刻（横移进度 = 1）镜头的速度（格/秒、成片像素/格）：交给分屏那一路接（t^幂 的导数 幂·t^(幂−1)/横移秒数，t = 1） */
export const endVelocity = () => ({ rightSpeed: (params.sideMove.right * params.sideMove.exponent) / ((frameCount - events.横移起) / fps), pxPerCell: params.bedroomFraming.pxPerCell });

// ---------- 屋外、接缝 ----------
/** 2-时差 第一帧（分屏起）服务器那半的调子：横移时屋外的林子照它的色调画，整片后期往它走 */
const seamTone = serverToneAt(mainCutEvents.分屏起.帧);

/** 屋外林子的 林偏（场/2-门口/林间门口.tsx）：横移走完那一刻（段的最后一帧）再按 末速度 走一帧，中景正好落在 2-时差 第一帧服务器那半的中景上，
 *  切过去林子接着同一个速度滑（远景 N 是中景的一半，同一个林偏两层一起对上）。
 *  2-时差 第一帧服务器那块画布（场/2-门口/时差分屏.tsx 接入中）：宽 服务器宽 + 成形.横、左沿 成形偏于(分屏起) − 成形.横，近景中心往左挪 成形.横 的一半 */
export const outdoorForestOffset = (() => {
  const lastShot = shotAt(frameCount - 1);
  const pagePerCell = (pxPerCell: number) => pxPerCell / filmScale;
  const layerPerCell = 16 * midGrove.N;
  const parallaxWidth = splitLayout.serverWidth + formShift.horizontalPx;
  const parallaxLeft = shapeOffsetAt(mainCutEvents.分屏起.帧) - formShift.horizontalPx;
  const parallaxNearX = serverFraming.中心[0] - formShift.horizontalPx / pagePerCell(serverFraming.pxPerCell) / 2;
  const parallaxMid = (parallaxNearX * splitScreenCount) / midGrove.N;
  const speed = endVelocity();
  const frameStep = pagePerCell(speed.rightSpeed * oneFrameSec * speed.pxPerCell);
  // 走完那一刻：1280 宽、中景中心 c；中景 x 在页面 640 + (x − c)·层每格页，再左移 一帧 = 2-时差 第一帧的 时差左 + 时差宽/2 + (x − 时差中)·层每格页
  const c = parallaxMid + (640 - frameStep - parallaxLeft - parallaxWidth / 2) / pagePerCell(layerPerCell);
  return lastShot.中心[0] - (c * midGrove.N) / (lastShot.pxPerCell / 16);
})();

/** 这一帧的屋外：横移还没动以前不给（屋外不在画里，画法照旧）；亮 = 横移进度（后窗那块天亮的橙跟着淡成屋外的天），走完以后是 1 */
export const outdoorState = (f: number): BedroomOutside | undefined =>
  slideProgress(f) <= 0
    ? undefined
    : { bright: clamp01(slideProgress(f)), tint: seamTone.tint, skyColors, 刻: dayTick, 群系: biome, growth: SplitState(mainCutEvents.分屏起.帧).growth, forestOffset: outdoorForestOffset, skyPerCell: 16 * splitScreenCount };

/** 整片后期的调色：横移以前是这一档窗光的调子；横移时按 横移进度 往 接缝调子 插，走完以后和 2-时差 第一帧服务器那半一样 */
export const postGrade = (f: number) => {
  const t = lightState(f).tone;
  const k = clamp01(slideProgress(f));
  return k > 0 ? lerpTone(t, seamTone, k).grade : t.grade;
};
