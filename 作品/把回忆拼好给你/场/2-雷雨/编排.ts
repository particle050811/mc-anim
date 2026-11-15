// 第 6、7 句这一个镜头（段 2-雷雨、2-拨开阴霾，照片「光柱破云」也取这里）每一帧的样子：镜头、她和你、闪电、魔法阵、光柱、云洞、天气颜色、阳光、雨、掉落物。
// 按歌曲帧算（两段是同一个镜头，照片按歌上的时刻取帧），时刻取 分镜/正片第6到7句.ts 的事件，分寸取 参数.ts。纯模块（测试也引）。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { lerpTone, type Tone } from '@engine/三渲二/调子.ts';
import type { ShadingSceneParams } from '@engine/三渲二/光影/预设.ts';
import { lerpBonePose, mergeSkeleton, type SkeletonTable } from '@库/角色/骨骼表.ts';
import { magicalWineFoxExMotion } from '@库/角色/魔法酒狐新动作.ts';
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第6到7句.ts';
import { palette } from '../../色板.ts';
import * as params from './参数.ts';
import { cloudCell, scatterRadius, type CloudCell } from './云.ts';
import { crater, cabin, blastResist, dropPos, southWall, chestDrops, type Drop } from './弹坑.ts';
import { SurroundBlocks } from './地形.ts';
import { rainAmount } from './声音.ts';
import { cloudColor, weatherSky, weatherFog, type RGB } from './天气.ts';
import type { RainStreak } from './雨.tsx';
import { clamp01, easeOutQuad, lerp, lerpV } from '@engine/core/数学.ts';

type EventName = keyof typeof mainCutEvents;
export const eventFrame = (eventName: EventName) => mainCutEvents[eventName].帧;
/** 这个镜头的头尾（歌曲帧，[起, 止)）：2-雷雨 的起到 2-拨开阴霾 的止 */
export const shotStartFrame = segmentWindow('2-雷雨').起帧;
export const shotEndFrame = segmentWindow('2-拨开阴霾').止帧;
/** 歌上的秒、游戏刻（雨、光柱、掉落物、云飘都按它走） */
export const songSec = (frame: number) => frame / fps;
export const frameToTick = (frame: number) => songSec(frame) * 20;
export const ease = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** 从 起 那一帧开始、秒 秒走完的进度：起那一帧已经走了一帧（原来走了 1/24 秒，用户 11-03「统统改成 60 帧」）；
 *  起 之前是 0（不提前动）。起 可以带小数（帧） */
const progress = (frame: number, startFrame: number, durSec: number) => (frame < startFrame ? 0 : clamp01(((frame - startFrame) / fps + oneFrameSec) / durSec));

// ---------- 镜头 ----------
export type CameraRig = { 种: '透视'; 眼: V3; 看: V3; fov: number; farPlane: number };
/** 第 6 句从 全 推到 近（缓起缓停，雷照缺口 那一帧推到，停到这句完），第 7 句从 近 退到 仰（退镜秒 里缓起缓停），之后停住 */
export const CameraRig = (frame: number): CameraRig => {
  const { 全: wide, 近: near, 仰: lowAngle } = params.cameraRigs;
  const standUp = eventFrame('liYingStandsUp');
  const [a, b, t] = frame < standUp ? [wide, near, ease((frame - shotStartFrame) / (eventFrame('lightningRevealsBreach') - shotStartFrame))] : [near, lowAngle, ease((frame - standUp) / (params.pullBackSec * fps))];
  return { 种: '透视', 眼: lerpV(a.眼, b.眼, t), 看: lerpV(a.看, b.看, t), fov: lerp(a.fov, b.fov, t), farPlane: 1200 };
};

// ---------- 闪电 ----------
/** 第 6 句的两道闪电：切点那一道、推到缺口那一道 */
export const lightningEvents = ['distantThunder', 'lightningRevealsBreach'] as const;
/** 这一帧在不在闪（每道闪电起的那两下）：按秒比，歌上同一时刻和 24 fps 时一样亮不亮 */
export const isFlashing = (frame: number) =>
  lightningEvents.some((lightningName) => {
    const sec = (frame - eventFrame(lightningName)) / fps;
    return params.flashRanges.some(([a, b]) => sec >= a && sec < b);
  });

// ---------- 她、你 ----------
export type LiYingState = { loc: V3; yaw: number; stancePose: '抱膝坐' | '站'; 看: [number, number]; expression: '难过' | '微笑'; casting: boolean; skeleton?: SkeletonTable };
/** 头转过去：起 那一帧起 转头秒 转到位 */
const turnHead = (frame: number, startFrame: number) => ease(progress(frame, startFrame, params.turnHeadSec));

/** 起身插值的两头：抱膝坐、站着举手的整张骨骼（不带头：头由 看 管）；只留两头不一样的骨骼，其余照组件自己算 */
const standUpPoses = (() => {
  const sitBones = magicalWineFoxExMotion({ stancePose: '抱膝坐', blink: 0 }).skeleton;
  const standPose = mergeSkeleton(magicalWineFoxExMotion({ stancePose: '站', blink: 0 }).skeleton, { RightArm: { rot: params.castArm.rightArm }, LeftArm: { rot: params.castArm.leftArm } });
  const boneKeys = [...new Set([...Object.keys(sitBones), ...Object.keys(standPose)])].filter((k) => k !== 'Head' && JSON.stringify(sitBones[k]) !== JSON.stringify(standPose[k]));
  const pickBones = (t: SkeletonTable) => Object.fromEntries(boneKeys.map((k) => [k, t[k] ?? {}]));
  return { sit: pickBones(sitBones), standPose: pickBones(standPose) };
})();
/** 抱膝坐时头的俯仰折成「站」的 看：抱膝坐的头补偿多抬 6°（库/角色/魔法酒狐新动作.ts 的 头补偿），起身那一帧头不跳 */
const sitHeadCompDeg = 6;

export const LiYingState = (frame: number): LiYingState => {
  const loc = params.standPos.liYingPos;
  // 看你：你在她东边（右手边），头往右转（看 的左右正 = 往左）
  const youBearing = (Math.atan2(params.standPos.你[1] - loc[1], params.standPos.你[0] - loc[0]) * 180) / Math.PI - 90 - params.facing.liYingYaw;
  if (frame >= eventFrame('liYingStandsUp')) {
    const k = ease(progress(frame, eventFrame('liYingStandsUp'), params.standUpSec));
    if (k >= 1) return { loc, yaw: params.facing.liYingYaw, stancePose: '站', 看: [params.castLookUp, 0], expression: '微笑', casting: true };
    // 站起来：腿、上身、两只胳膊从抱膝坐一起插到站着举手，头从看你转到仰头
    const gaze: [number, number] = [lerp(-6 - sitHeadCompDeg, params.castLookUp, k), lerp(youBearing, 0, k)];
    return { loc, yaw: params.facing.liYingYaw, stancePose: '站', 看: gaze, expression: '微笑', casting: true, skeleton: lerpBonePose(standUpPoses.sit, standUpPoses.standPose, k) };
  }
  return { loc, yaw: params.facing.liYingYaw, stancePose: '抱膝坐', 看: [-6, lerp(0, youBearing, turnHead(frame, eventFrame('liYingLooksAtYou')))], expression: '难过', casting: false };
};

export type YouState = { loc: V3; yaw: number; headYaw: number; headPitch: number };
export const YouState = (frame: number): YouState => {
  const [x, y, z] = params.standPos.你;
  const loc: V3 = [x, y, z - params.youSit.sitDrop];
  const liYingBearing = (Math.atan2(params.standPos.liYingPos[1] - y, params.standPos.liYingPos[0] - x) * 180) / Math.PI - 90 - params.facing.你;
  if (frame >= eventFrame('liYingStandsUp')) {
    // 仰头看光柱（光柱在她头顶，偏左）
    const t = turnHead(frame, eventFrame('liYingStandsUp'));
    return { loc, yaw: params.facing.你, headYaw: lerp(liYingBearing, liYingBearing * 0.5, t), headPitch: lerp(0, params.youLookUp, t) };
  }
  const t = turnHead(frame, eventFrame('youLookAtLiYing'));
  return { loc, yaw: params.facing.你, headYaw: lerp(0, liYingBearing, t), headPitch: lerp(params.youHeadDownDeg, 0, t) };
};

// ---------- 魔法阵、光柱 ----------
/** 魔法阵展开到多大（0～1） */
export const circleSize = (frame: number) => (frame < eventFrame('magicCircleUp') ? 0 : easeOutQuad(progress(frame, eventFrame('magicCircleUp'), params.magicCircle.expandSec)));
/** 魔法阵转了几度 */
export const circleSpin = (frame: number) => songSec(frame) * params.magicCircle.turnsPerSec;
/** 光柱顶（z，格）：光柱起 起从底往上冲，越冲越快，零点几秒冲出画面顶，拨 那一帧冲到 顶高（60 fps 下 拨 前一两帧已经到），之后停在那里 */
export const beamTop = (frame: number, bottom: number) => {
  if (frame < eventFrame('beamRises')) return bottom;
  return lerp(bottom, params.lightPillar.topHeight, progress(frame, eventFrame('beamRises'), (eventFrame('beamHitsCloud') - eventFrame('beamRises')) / fps) ** params.lightPillar.surgeExp);
};
/** 光柱的不透明度：光柱退 起 退秒 里淡掉 */
export const beamOpacity = (frame: number) => 1 - ease(progress(frame, eventFrame('beamFades'), params.lightPillar.fadeSec));
/** 光柱撞云：撞的那一片云底往光柱色亮多少（0～1）：拨 起亮，破云 起 退秒 里退掉 */
export const impactBrightness = (frame: number) => (frame < eventFrame('beamHitsCloud') ? 0 : params.impactCloud.brightness * (1 - ease(progress(frame, eventFrame('cloudBreaks'), params.impactCloud.fadeSec))));

// ---------- 云 ----------
/** 云往东挪了多少（格）：原版每刻往西 0.03 格 */
export const cloudDrift = (frame: number) => -frameToTick(frame) * params.cloudDriftPerTick;
/** 云洞半径（格）：破云 起开，云洞开大 时到 r1（缓出），之后按比例长到 r2，越开越快。按秒算（破云 那一帧已经开了一帧）：
 *  镜头止前一帧（段的最后一帧）开到 r2 */
export const holeRadius = (frame: number) => {
  if (frame < eventFrame('cloudBreaks')) return 0;
  const { r1, r2 } = params.cloudHole;
  if (frame < eventFrame('cloudHoleWidens')) return r1 * easeOutQuad(((frame - eventFrame('cloudBreaks')) / fps + oneFrameSec) / ((eventFrame('cloudHoleWidens') - eventFrame('cloudBreaks')) / fps + oneFrameSec));
  return r1 * (r2 / r1) ** clamp01((frame - eventFrame('cloudHoleWidens')) / fps / ((shotEndFrame - eventFrame('cloudHoleWidens')) / fps - oneFrameSec));
};
/** 洞心：光柱（她站的地方） */
export const holeCenter = (): [number, number] => [params.standPos.liYingPos[0], params.standPos.liYingPos[1]];
/** 这一格云还剩多少（0～1）：洞半径走过它的 散起半径 那一刻起，散秒 里淡掉。
 *  那一刻从 破云 起一帧一帧往后找（原来按 1/24 秒一步，用户 11-03「统统改成 60 帧」），淡掉的进度按秒连续走 */
export const cloudRemain = (c: CloudCell, frame: number) => {
  if (frame < eventFrame('cloudBreaks')) return 1;
  const r0 = scatterRadius(c, holeCenter(), cloudDrift(frame));
  let cursorFrame = eventFrame('cloudBreaks');
  while (cursorFrame <= frame && holeRadius(cursorFrame) < r0) cursorFrame++;
  if (cursorFrame > frame) return 1;
  return 1 - progress(frame, cursorFrame, params.cloudHole.scatterSec);
};
/** 天从哪里透出晴天：视线在云底那一层落到的那一格（同云的格子，跟着云飘）散了多少，0 = 雷雨天、1 = 晴天；破云 前没有（null）。
 *  跟着云格一格一格变（核查 10-24：按正圆判断的话，云还没散、0.8 透明的云后面先透出一块正圆的蓝天）；clouds.png 上空着的格照同一个 散起半径 算 */
export const clearSkyAt = (frame: number): ((x: number, y: number) => number) | null => {
  if (frame < eventFrame('cloudBreaks')) return null;
  const drift = cloudDrift(frame);
  const valueMap = new Map<string, number>();
  return (x, y) => {
    const a = Math.floor((x - drift) / cloudCell), b = Math.floor(y / cloudCell);
    const k = `${a},${b}`;
    let v = valueMap.get(k);
    if (v === undefined) {
      v = 1 - cloudRemain({ a, b }, frame);
      valueMap.set(k, v);
    }
    return v;
  };
};

// ---------- 天气、调子 ----------
/** 雷暴等级跟着雨量收 */
const thunder = (frame: number) => params.thunderStrength * rainAmount(frame);
/** 这一帧的颜色：天、雾（洞外）、晴天、晴雾（洞里）、云（云顶色） */
export const weatherColors = (frame: number): { 天: RGB; fog: RGB; clearSky: RGB; clearFog: RGB; cloudColor: RGB } => {
  const rain = rainAmount(frame);
  const flashBrightness = isFlashing(frame);
  return { 天: weatherSky(rain, thunder(frame), flashBrightness), fog: weatherFog(rain, thunder(frame), flashBrightness), clearSky: weatherSky(0, 0), clearFog: weatherFog(0, 0), cloudColor: cloudColor(rain, thunder(frame)) };
};
/** 从雷雨往晴走了多少（0～1）：跟着雨量 */
export const clearing = (frame: number) => ease(1 - rainAmount(frame));
/** 这一帧的调子：整片后期、3D 受光面都从 雷雨 往 晴调子 走；闪的那两刻受光面满亮 */
export const frameGrade = (frame: number): { postTone: Tone; tint: string } => {
  const grade = lerpTone(palette.雷雨, palette[params.clearGrade], clearing(frame));
  return { postTone: grade, tint: isFlashing(frame) ? params.lightning.tint : grade.tint };
};

/** 光影场（三渲二画布）：太阳、Photon 雨云这一帧的洞、撞亮（拨 到 破云 越撞越亮，见 参.雨云.蓄）、曝光（光影选项没开云时光影层不看云这几项） */
export const shadingSceneAt = (frame: number): ShadingSceneParams => {
  const rainCloud = params.rainCloud;
  const center = holeCenter();
  const r = holeRadius(frame) * rainCloud.holeRatio;
  const cloudCharge = clamp01((frame - eventFrame('beamHitsCloud')) / (eventFrame('cloudBreaks') - eventFrame('beamHitsCloud'))) ** rainCloud.cloudCharge.exponent;
  const flicker = frame < eventFrame('cloudBreaks') ? 1 + rainCloud.cloudCharge.pulseAmp * Math.sin((2 * Math.PI * rainCloud.cloudCharge.跳 * (frame - eventFrame('beamHitsCloud'))) / fps) : 1;
  const flashBrightness = impactBrightness(frame) * lerp(rainCloud.cloudCharge.起, rainCloud.cloudCharge.到, cloudCharge) * flicker;
  return {
    sun: rainCloud.sun,
    海平面: rainCloud.海平面,
    cloudLayers: rainCloud.层,
    cloud: {
      ...(r > 0 ? { hole: [center[0], center[1], r, rainCloud.softEdge] as const } : {}),
      ...(flashBrightness > 0 ? { brightness: { 心: center, radius: params.impactCloud.radius * rainCloud.brightRatio * lerp(1, rainCloud.cloudCharge.radiusMul, cloudCharge), 强: flashBrightness * rainCloud.brightnessMult, 色: params.lightPillar.色 } } : {}),
      exposureMult: lerp(rainCloud.rainExposure, 1, clearing(frame)) * (isFlashing(frame) ? rainCloud.flashExposure : 1),
    },
  };
};

// ---------- 发光区：她被自己的阵照亮、阳光 ----------
/** 阳光照到多远（格，以洞心为心） */
export const sunRadius = (frame: number) => holeRadius(frame) * params.sunRays.比;
/** 平涂的发光区（场景坐标的盒子）：她那一块从 阵起 起；阳光那片用 条数 条横条拼成阶梯状的圆 */
export const glowRegionsAt = (frame: number): number[][] => {
  const out: number[][] = [];
  const [x, y, z] = params.standPos.liYingPos;
  if (frame >= eventFrame('magicCircleUp')) {
    const { 半宽: halfWidth, 高: height } = params.herBrightZone;
    out.push([x - halfWidth, y - halfWidth, z - 0.05, x + halfWidth, y + halfWidth, z + height]);
  }
  const r = sunRadius(frame);
  if (r > 0) {
    const n = params.sunRays.rayCount;
    for (let k = 0; k < n; k++) {
      const y0 = -r + (2 * r * k) / n, y1 = -r + (2 * r * (k + 1)) / n;
      const ym = Math.min(Math.abs(y0), Math.abs(y1));
      const halfChord = Math.sqrt(Math.max(0, r * r - ym * ym));
      out.push([x - halfChord, y + y0, -16, x + halfChord, y + y1, params.cloudBottomHeight - 1]);
    }
  }
  return out;
};
/** 屋子离洞心最远那个角（格）：阳光铺地 时阳光要铺过它 */
export const houseFarthest = () => {
  const [x, y] = holeCenter();
  const corners = [[cabin.westWall - 1.5, southWall], [cabin.eastWall + 1.5, southWall], [cabin.westWall - 1.5, cabin.backWall + 1], [cabin.eastWall + 1.5, cabin.backWall + 1]] as const;
  return Math.max(...corners.map(([a, b]) => Math.hypot(a - x, b - y)));
};

// ---------- 雨 ----------
let surfaceCache: Map<string, number> | undefined;
/** 每一列最高的挡雨方块顶面（花草、火把不挡） */
export const surface = () => {
  if (!surfaceCache) {
    const m = new Map<string, number>();
    const surroundings = SurroundBlocks();
    for (const b of [...crater().remainingBlocks, ...surroundings.plains, ...surroundings.cherryGrove] as PlacedBlock[]) {
      if ((blastResist[b.状态.replace(/\[.*$/, '')] ?? 0) === 0 && !/grass_block|dirt|stone|log|leaves/.test(b.状态)) continue;
      const k = `${b.位[0]},${b.位[1]}`;
      m.set(k, Math.max(m.get(k) ?? -Infinity, b.位[2] + 1));
    }
    surfaceCache = m;
  }
  return surfaceCache;
};

/** 透视镜头的雨：照原版，镜头所在那格周围 透视雨半径 以内每一列一张竖片，正对镜头（片的横向垂直于镜头到那一列的方向），
 *  底在那一列的地表，顶在镜头以上 半径 格；越远越淡（(1 − d²/r²)·0.5 + 0.5） */
export const perspectiveRainPlanes = (eye: V3): RainStreak[] => {
  const r = params.perspRainRadius;
  const groundMap = surface();
  const [ci, cj] = [Math.round(eye[0]), Math.floor(eye[1])];
  const out: RainStreak[] = [];
  for (let i = ci - r; i <= ci + r; i++)
    for (let j = cj - r; j <= cj + r; j++) {
      const [x, y] = [i, j + 0.5];
      const [dx, dy] = [x - eye[0], y - eye[1]];
      const d = Math.hypot(dx, dy);
      if (d > r || d < 0.01) continue;
      const bottom = Math.max(groundMap.get(`${i},${j}`) ?? -Infinity, eye[2] - r);
      if (!Number.isFinite(bottom)) continue;
      out.push({ i, j, 中心: [x, y], 半宽: [(-dy / d) * 0.5, (dx / d) * 0.5], bottom, topY: eye[2] + r, alpha: (1 - (d * d) / (r * r)) * 0.5 + 0.5 });
    }
  return out;
};

// ---------- 掉落物 ----------
/** 浮在坑里的掉落物（ItemEntity 的位置），照 弹坑.ts 原版算出来的：炸掉的方块掉的几堆、箱子里洒出来的东西 */
export const dropItems = (): { item: string; itemCount: number; 位: V3; floatOffset: number }[] => [
  ...crater().drops.map((d: Drop) => ({ item: d.item, itemCount: d.itemCount, 位: dropPos(crater().remainingBlocks, d), floatOffset: d.floatOffset })),
  ...chestDrops(crater().remainingBlocks),
];
/** 掉落物的 age（刻）：炸了一阵子了（演绎，任取一个数，只管浮动、转圈的相位） */
export const dropTick = (frame: number) => 1200 + frameToTick(frame - shotStartFrame);
