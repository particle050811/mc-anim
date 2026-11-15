// 第 9–11 句（门这个机位的夜里，暑假最后一晚，三句一个镜头不切）：站位、夜空、三发烟花、镜头怎么走、闪光亮档、照片和图标版式、声音增益。除了注明的都是 Agent 暂定（用户没看过）。
// 纯数据（段.ts、测试都读；不 import 带贴图的 .tsx）。时刻全从 分镜 的正片事件推，这里只写相对事件的秒数。
// 坐标照 地点/门口小木屋.tsx（Z 朝上：x 东 = 画面右、y 北、z 上，单位格；人站在 y = 0.5）。yaw 同 FigurePose：90 面朝西（画面左）、−90 朝东、180 朝镜头。
import type { PageRect } from '@engine/三渲二/整片后期.tsx';
import { rocketPos, burstSec, burstPoint, type Firework, type FireworkDye } from '@库/特效/烟花.ts';
import { fps, oneFrameSec, legacyFrameSec } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第9至11句.ts';
import { signWords, cellPx, orthoTop } from './参数.ts';
import { line8Shot, line8ShotCount } from './第8句.ts';
import { lerp, clamp01, smootherstep01 } from '@engine/core/数学.ts';

type MainCutEventName = keyof typeof mainCutEvents;

/** 地点/门口小木屋.tsx 的 门口（人站的那排、站位、告示牌底面）和 地点/告示牌.tsx 的字面中心、牌面宽高：那两个文件带贴图，纯模块不引，照抄在这里 */
const entrance = {
  standRowY: 0.5,
  standPos: { entrance: 0, signTreeGap: -4 },
  signboardPos: [-3, 1.5, 0],
  saplingPos: [-5, 1.5, 0],
  signFaceCenter: [0, -1 / 24 - 1 / 512, 20 / 24],
  signBoard: { 宽: 1, 高: 0.5 },
} as const;
const standRowY = entrance.standRowY;
const eventSec = (k: MainCutEventName) => mainCutEvents[k].秒;
/** 事件落在的那一帧的秒（画面上的事按帧发生：歌上 29.509 秒的事件落在第 1771 帧，第 1771 帧 = 29.517 秒就要看得到） */
const eventFrameSec = (k: MainCutEventName) => mainCutEvents[k].帧 / fps;
// ---------- 站位 ----------
/** 你：三句一直站在牌子和门中间、开着的门板前面（x −1.5，比 门口小木屋.tsx 的 站位.牌门之间 往门挪半格），面朝西：种树苗（离你 3.5 格）、
 *  写字、放烟花都不用走。挪半格是为了推到牌子上那一镜（一屏 1.9 格宽）你的肩膀不露在画面右边 */
export const youStand = -1.5;
/** 她：一直站在门洞正中，同第 8 句末态的位置，门框框住她（魔法酒狐没有走路动画，不挪） */
export const herStand = entrance.standPos.entrance;
/** 烟花火箭放在哪：第 10 句两发放在树苗和牌子中间那格的地上（站位.牌树之间），离你两格半；
 *  最后一发放在牌子和你正中间（x −2.25，离你 0.75 格）：炸开那一朵就在你和她头顶，存档图标裁的正方形里人和烟花挨在一起（核查 10-24 嫌图标里只读出一朵烟花；Agent 暂定） */
const fireworkX = entrance.standPos.signTreeGap;
const finalLaunchX = -2.25;
/** 树苗那一格（原版够得着） */
export const saplingX = entrance.saplingPos[0];
export { standRowY };

// ---------- 夜 ----------
/** 游戏刻：匹配剪进来那一刻是午夜（18000，第 0 天满月在正上方），之后跟着歌走（到第 12 句满月往西挪不到 0.3 格） */
export const nightTick = (s: number) => 18000 + (s - eventSec('nightfall')) * 20;
/** 匹配剪进来那一刻满月在画面上的位置（离画面中心 [横, 竖] 格，按开场的天取景，N 16）：左上、屋檐左边、第 10、11 句顶上那一行左下（第 9 句在底部），
 *  定格那一刻整个在存档图标裁的正方形左边（Agent 暂定；第 8 句已经不画太阳，原来照它的太阳位置取的数留着没动） */
export const moonInPicture = [-3.25, 2.25] as const;
/** 月亮走的弧：午夜（弧顶）正好在 满月在画面；半径只管它往西挪多快。天横着不跟镜头挪（见 天视差），月亮一直在画面左上 */
export const nightSkyArc = { 心: [line8Shot.framing.中心[0] + moonInPicture[0], line8Shot.framing.中心[1] + moonInPicture[1] - 6] as const, radius: 6 };
/** 开光影时交给光影的事实（三渲二画布的 光影场）：月光从镜头背后偏左、仰角 50° 照过来（场景坐标，Z 朝上，镜头朝北 +y），和天上的月亮同一边。
 *  原来用夜的默认方位，光从右边来，牌子右边站着的你把一块方方的硬影子投在牌子右上角（用户 11-03「这边告示牌右上角为什么会有一块区域颜色不一样？」）。
 *  仰角、离镜头的角度和默认一样，只换到左边 */
export const nightShadingScene = { sun: [-0.4132, -0.4924, 0.766] } as const;
/** 天（渐变、月亮、星星）跟镜头走的比例（按开场那一镜的天取景算）：横着不挪（镜头平移，天在无穷远，月亮在画面上不动）。
 *  竖着分两头：镜头比开场低（推到牌子上）只挪 0.15，月亮不出画面上沿；比开场高（跟火箭上天）挪 0.5，星星、月亮往下走一点，像天比地远。
 *  屋后远景不跟这个走：它的地平线跟着正交那一层（地点/屋后远景.tsx），跟火箭上天时连林子一起沉出画面下边，烟花炸在干净的天上
 *  （核查 10-24：烟花背后要天干净，靠取景和雾让，不压平地）。两头在开场那一高度用 软大 圆过去（宽 软宽 格），速度不突变（Agent 暂定） */
const skyParallax = { horizontal: 0, vertLower: 0.15, vertUpper: 0.5, softWidth: 0.5 } as const;
/** 星星（原版夜里天上的小白方块）：铺在一张 2560×1440 的循环图上跟着天挪，躲开月亮那一块；个数、大小、亮度 */
export const stars = { starCount: 150, starSize: [4, 6] as const, brightRange: [0.35, 0.7] as const, 种子: 9 };

// ---------- 时刻（从分镜推） ----------
/** 树苗落地那一帧（原版右键放方块：挥手的同一刻方块就在了）。匹配剪进来以后你一直拿着树苗、低头看着那一格 */
export const plantSec = eventFrameSec('plantSapling');
/** 按词写：第 r 行第 k 个词写上的秒（词在 参数.ts 的 告示牌词们，一行两个词；分镜里写字事件和它一一对上） */
export const writeSecs: readonly (readonly number[])[] = [
  [eventFrameSec('writeLine1Word1'), eventFrameSec('writeLine1Word2')],
  [eventFrameSec('writeLine2Word1'), eventFrameSec('writeLine2Word2')],
];
/** 这一刻牌上四行写到哪（告示牌词们 写在四行里的中间两行，同 参数.ts 的 告示牌行们；原版每行居中，词写上去整行重新居中）。牌子从匹配剪进来就立着，没写字之前空白 */
export const signLinesAt = (s: number): string[] => ['', ...signWords.map((line, r) => line.filter((_, k) => s >= writeSecs[r]![k]!).join('')), ''];
/** 你手里换上烟花火箭的那一刻（镜头已经拉开，你整个人在画里） */
export const swapRocketSec = eventFrameSec('switchToRockets');
/** 牌上的字：白色染料 + 发光墨囊（原版 DyeColor.WHITE 的字色 #F9FFFE，满亮度画）。夜里压暗的橡木牌上黑字认不清；
 *  原来用黑字发光（描边 #F0EBCC），汉字笔画细，描边把笔画缝填满，用户 10-24 嫌脏。白字发光、镜头在 16 格外不画描边（原版 isOutlineVisible），字干净 */
export const signTextStyle = { 色: '#f9fffe', glow: true, outline: false } as const;

// ---------- 烟花 ----------
const makeFirework = (name: string, launchEvent: MainCutEventName, blastEvent: MainCutEventName, x: number, ballSize: Firework['ballSize'], fireworkColors: FireworkDye[], seed: number, extras?: { trail?: boolean; twinkle?: boolean }): Firework => {
  const flightTick = Math.round((eventSec(blastEvent) - eventSec(launchEvent)) * 20);
  return { 名: name, launchSec: eventSec(launchEvent), flightTick, 位: [x, standRowY], ballSize, fireworkColors, 种子: seed, ...extras };
};
/** 三发：第 10 句两发小型球状（粉；黄橙带闪烁），落在「即」「花」上，镜头跟着火箭上去、炸在画面中间（第二发偏西半格，两朵不叠在同一个点上）；
 *  第 11 句最后一发是最大的大型球状（粉白带拖尾），镜头落回门口以后放在你跟前、炸在「绽」上。
 *  第 10 句原来有三发，用户 10-24 定画面转太快就删，拿掉中间那发。颜色、种子 Agent 暂定（种子挑的是炸开那几帧球形匀、不缺角的） */
export const fireworks: readonly Firework[] = [
  makeFirework('一', 'firework1Launch', 'firework1Burst', fireworkX, '小球', ['粉'], 11),
  makeFirework('三', 'firework3Launch', 'firework3Burst', fireworkX - 0.5, '小球', ['黄', '橙'], 37, { twinkle: true }),
  makeFirework('末', 'finalFireworkLaunch', 'bigFireworkBurst', finalLaunchX, '大球', ['粉', '白'], 53, { trail: true }),
];

// ---------- 闪光亮档 ----------
/** 原版没有动态光，烟花照亮牌子、树苗是演绎：平涂只有三档（0 夜里、1、2），炸开后 2 档亮一下再落到 1 档、再回 0，不做平滑的光。
 *  最大那发 2 档留得久，定格那一帧正亮着 */
export const brightTierDur = { 小球: { 二: 0.1, 一: 0.45 }, 大球: { 二: 0.25, 一: 0.7 } } as const;
/** 各组在 1、2 档往烟花色（掺 45% 白）走多少：离炸点近的（树苗、牌子、你）亮得多，门里的她次之，房子、地面、屋后远景只亮一点 */
export const brightTierRatio = { near: [0, 0.35, 0.65], liYingBright: [0, 0.2, 0.4], far: [0, 0.1, 0.18] } as const;
export const fireworkLightWhiteMix = 0.45;

/** 这一刻的亮档和照亮它的那发（同时有两发亮着取后炸的） */
export const brightTier = (s: number): { 档: 0 | 1 | 2; 发: Firework | null } => {
  let r: { 档: 0 | 1 | 2; 发: Firework | null } = { 档: 0, 发: null };
  for (const firework of fireworks) {
    const sinceBurst = s - burstSec(firework);
    if (sinceBurst < 0) continue;
    const tierDurations = brightTierDur[firework.ballSize];
    const tier = sinceBurst < tierDurations.二 ? 2 : sinceBurst < tierDurations.一 ? 1 : 0;
    if (tier > 0) r = { 档: tier, 发: firework };
  }
  return r;
};

// ---------- 镜头 ----------
// 一个镜头不切（用户 10-24：镜头少而连贯）：第 8 句同一机位匹配剪进来 → 停一下、往左让出树苗、种下 → 推到牌子上看写字 → 拉开、换上火箭放出去，
// 跟着火箭往上、烟花炸在画面中间 → 在天上轻轻挪到第二发 → 落回门口，最后一发炸开定格。俯角一直是 顶面 2（画风.ts 的 正交顶面）：
// 推拉时顶面的像素高不变，往里的东西跟着变，像视差。
/** 推拉 = N 在变（带小数）；动着 = 和上一帧比挪了或推拉了，中心不吸 */
export type DoorNightShot = { N: number; topDepth: number; 中心: readonly [number, number]; dolly?: true; moving?: true };
/** 镜头一路上的状态：N 用小数，最后取偶数；中心是剖面（y = 0）上的 [x, z] */
type ContinuousShot = { N: number; 中心: readonly [number, number] };

/** 牌上两行字的中心（地点/告示牌.tsx：牌底面 + 字面中心；两行在四行的中间，字面中心就是两行的中心） */
export const signFace = { x: entrance.signboardPos[0], y: entrance.signboardPos[1] + entrance.signFaceCenter[1], z: entrance.signFaceCenter[2] } as const;
/** 场景点在 N 这一档镜头里落在剖面上的哪（斜投影：往里每格上升 顶面 ÷ N） */
const upSection = (N: number, p: { x: number; y: number; z: number }) => [p.x, p.z + (orthoTop / N) * p.y] as const;

/** 开场：和第 8 句（2-收集快乐）同一个镜头（N 16、地面线、中心），匹配剪只把白天换成夜里 */
export const openingSceneShot: ContinuousShot = { N: line8ShotCount, 中心: line8Shot.framing.中心 };
/** 让：种树苗前镜头在 N 16 往左平移多少格。开场那一镜树苗那格（x −5.5～−4.5）有一半在画框外（核查 10-24 嫌树苗在画框边上），
 *  让 1.5 格以后树苗离画框左边 1 格（Agent 暂定） */
const yieldCells = 1.5;
/** 牌子特写：N 84（12 的倍数：牌上 unihex 一个点 7 个成片像素，见 地点/告示牌字.tsx），一屏 1.9 × 1.07 格，一个字 112 像素高（手机 390 宽上 17 像素） */
export const signNearCount = 84;
/** 跟火箭、看烟花、落回门口都是 N 12：一屏 13.3 × 7.5 格，一朵小球烟花（半径 1.7～2.5 格）放得下，顶上歌词那条让开 */
export const farCount = 12;
/** 定格那一镜：你、她、牌子、树苗、照片墙、最大那朵都在画里，地面离画面底边 0.75 格（同第 8 句）。存档图标裁画面正中的正方形（一屏 7.5 格见方，x 中心 ± 3.75）：
 *  中心往左 0.55 格，正方形是 x −4.3～3.2：她（门洞正中 x 0，帽檐半宽 0.56）、后墙的照片墙（x 0.5～2.5）、你、牌子、最大那朵整个在里面；
 *  左沿让开树苗（x −5.5～−4.5），右沿让开屋里 x 3.5 起的摆设，正方形的边不切开哪一样东西。她的帽檐和照片墙在 x 上叠着（她站在照片墙前面），
 *  分不开，只能连照片墙一起框进来（核查 10-24：原来右沿 0.75 正好切过照片墙；Agent 暂定） */
const freezeCenter = [-0.55, 3] as const;

/** 各段起止（秒） */
export const shotSegment = {
  /** 匹配剪进来原样停 0.17 秒（24 fps 时四帧），再往左让 */
  yieldStart: eventSec('nightfall') + 0.17,
  /** 让完、开始往牌子推；N 16 一直停到这里（0.67 秒） */
  pushStart: eventSec('pushToSign'),
  /** 推到牌子上的那一刻：第一行写上之前 0.06 秒停稳 */
  pushEndSec: eventSec('writeLine1Word1') - 0.06,
  /** 两行字留够，镜头从牌子上拉开 */
  followStart: eventSec('pullBackFromSign'),
  /** 第一发炸开时正好停在炸点上 */
  followUntilSec: eventSec('firework1Burst'),
  /** 第二发炸开以后 0.35 秒停在它的炸点上，接着落回门口（往下落时这一朵从画面上边出去，还看得到一会儿） */
  dropStart: eventSec('firework3Burst') + 0.35,
  /** 最后一发放出前 0.1 秒落稳 */
  fallEnd: eventSec('finalFireworkLaunch') - 0.1,
} as const;
/** 推近牌子时，牌子在推的前多少就挪到画面正中（之后只往里推，Agent 暂定） */
const signCenterFirst = 0.55;
/** 跟火箭时 N 从 84 拉到 12 用掉这一段的前多少：先拉开看清是谁、拿着什么、火箭在哪，再跟着往上。
 *  0.65：拉开 0.85 秒（核查 10-24：0.6 时拉开那一下只有半秒，你的头一扫而过），换火箭那一刻已经拉到 N 35 以内（Agent 暂定） */
const pullOpenFrac = 0.65;

/** 中心吸到偶数像素：(0.5 + x)·16N（方块边）、z·16N 都是偶数，贴图像素的边落在整像素上 */
const snap = (N: number, x: number, z: number): [number, number] => {
  const k = cellPx(N);
  return [(2 * Math.round(((0.5 + x) * k) / 2)) / k - 0.5, (2 * Math.round((z * k) / 2)) / k];
};
const toEvenAtLeastTwo = (N: number) => Math.max(2, 2 * Math.round(N / 2));
const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

/** 火箭（没放时是放的地方，炸了是炸点）落在剖面上的哪 */
const rocketPoint = (firework: Firework, s: number, N: number) => {
  const p = rocketPos(firework, s) ?? (s < firework.launchSec ? [firework.位[0], firework.位[1], 0.15] : burstPoint(firework));
  return upSection(N, { x: p[0], y: p[1], z: p[2] });
};
/** N 这一档地面离画面底边 0.75 格（同开场、定格）时的中心高 */
const groundLineCenterZ = (N: number) => 720 / cellPx(N) - 0.75;
/** 软的 max（两个差得远就是大的那个，接近时圆过去，速度不打折）：拉开时镜头不往地下看，又不在火箭追上来那一下顿一下 */
const softMax = (a: number, b: number, k = 0.5) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2;

/** 歌上这一刻的连续镜头（还没取整） */
const continuousShot = (s: number): ContinuousShot => {
  const seg = shotSegment;
  const [firstFirework, thirdFirework] = [fireworks[0]!, fireworks[1]!];
  if (s <= seg.yieldStart) return openingSceneShot;
  const shiftedShot: ContinuousShot = { N: openingSceneShot.N, 中心: [openingSceneShot.中心[0] - yieldCells, openingSceneShot.中心[1]] };
  if (s < seg.pushStart) {
    const e = smootherstep01((s - seg.yieldStart) / (seg.pushStart - seg.yieldStart));
    return { N: openingSceneShot.N, 中心: [lerp(openingSceneShot.中心[0], shiftedShot.中心[0], e), openingSceneShot.中心[1]] };
  }
  if (s < seg.pushEndSec) {
    // 推：N 按对数插；牌字面在画面上离中心的偏移（成片像素）先缩到 0（推到 牌先居中 时牌子已经在画面中心），再只往里推，
    // 你站在牌子右边两格，牌子先居中你就早早从右边出画、不在放大到半屏高时从画面上扫过去（核查 10-24）
    const v = (s - seg.pushStart) / (seg.pushEndSec - seg.pushStart);
    const u = smootherstep01(v);
    const centerProgress = smootherstep01(Math.min(1, v / signCenterFirst));
    const N = logLerp(shiftedShot.N, signNearCount, u);
    const [x0, z0] = upSection(shiftedShot.N, signFace);
    const offset = [(x0 - shiftedShot.中心[0]) * shiftedShot.N * (1 - centerProgress), (z0 - shiftedShot.中心[1]) * shiftedShot.N * (1 - centerProgress)];
    const [x, z] = upSection(N, signFace);
    return { N, 中心: [x - offset[0]! / N, z - offset[1]! / N] };
  }
  if (s < seg.followStart) return { N: signNearCount, 中心: upSection(signNearCount, signFace) };
  if (s < seg.followUntilSec) {
    // 跟：先拉开，中心从牌子往火箭挪，炸开那一刻正好在炸点上。
    // 竖着：拉开时跟拉开同一个进度从牌子抬到 地线中心z（拉到 N 12 时地面停在画面底边上面 0.75 格，不露出一大片地底下的剖面），
    // 拉开以后从那里平平地升到炸点：火箭从画面下半升上来、炸在画面中间（不死跟火箭，它越飞越快，死跟最后几帧镜头一下蹿上去）
    const t = (s - seg.followStart) / (seg.followUntilSec - seg.followStart);
    const dolly = smootherstep01(t / pullOpenFrac);
    const N = logLerp(signNearCount, farCount, dolly);
    const sign = upSection(N, signFace);
    const x = lerp(sign[0], rocketPoint(firstFirework, s, N)[0], smootherstep01(t));
    const lowAt = (sec: number, n: number) => softMax(rocketPoint(firstFirework, sec, n)[1], groundLineCenterZ(n));
    const pullEnd = seg.followStart + pullOpenFrac * (seg.followUntilSec - seg.followStart);
    const z = t < pullOpenFrac ? lerp(sign[1], lowAt(s, N), dolly) : lerp(lowAt(pullEnd, farCount), rocketPoint(firstFirework, seg.followUntilSec, farCount)[1], smootherstep01((t - pullOpenFrac) / (1 - pullOpenFrac)));
    return { N, 中心: [x, z] };
  }
  const firstBurst = rocketPoint(firstFirework, seg.followUntilSec, farCount);
  const thirdBurst = rocketPoint(thirdFirework, burstSec(thirdFirework), farCount);
  if (s < seg.dropStart) {
    // 在天上：从第一发的炸点慢慢挪到第二发的炸点
    const e = smootherstep01((s - seg.followUntilSec) / (seg.dropStart - seg.followUntilSec));
    return { N: farCount, 中心: [lerp(firstBurst[0], thirdBurst[0], e), lerp(firstBurst[1], thirdBurst[1], e)] };
  }
  const e = smootherstep01((s - seg.dropStart) / (seg.fallEnd - seg.dropStart));
  return { N: farCount, 中心: [lerp(thirdBurst[0], freezeCenter[0], e), lerp(thirdBurst[1], freezeCenter[1], e)] };
};

/** 歌上这一刻（秒）是不是在推近牌子、从牌子拉开的那一截：N 在变 */
export const pushPullMid = (s: number) =>
  (s > shotSegment.pushStart && s < shotSegment.pushEndSec) || (s > shotSegment.followStart && s < shotSegment.followStart + pullOpenFrac * (shotSegment.followUntilSec - shotSegment.followStart));
/** 歌上这一刻的镜头：N 取偶数，中心吸到偶数像素。
 *  推拉中 例外，N 和中心都用小数：N 16→18 一跳放大 12%，60 fps 时隔三四帧才跳一下、中间只平移，看着是一顿一顿地抖
 *  （用户 11-03「这边镜头怎么剧烈抖动？」说的是推近；拉开同一个毛病，看了对比说「改成这样可以」）。
 *  N 不变、中心在挪的帧（让开、跟火箭、在天上、落回门口）中心也不吸：慢移时一帧挪 2 像素、一帧不挪，一顿一顿（用户 11-03「统统改成 60 帧」）。
 *  动着的时候贴图像素宽窄差 1 像素，看不出来；停住的帧（N 16、84、12）照样吸 */
export const shotAt = (songFrame: number): DoorNightShot => {
  const s = songFrame / fps;
  const c = continuousShot(s);
  if (pushPullMid(s)) return { N: c.N, topDepth: orthoTop, 中心: c.中心, dolly: true, moving: true };
  const N = toEvenAtLeastTwo(c.N);
  const prev = continuousShot((songFrame - 1) / fps).中心;
  if (prev[0] !== c.中心[0] || prev[1] !== c.中心[1]) return { N, topDepth: orthoTop, 中心: c.中心, moving: true };
  return { N, topDepth: orthoTop, 中心: snap(N, c.中心[0], c.中心[1]) };
};
/** 镜头给 三渲二画布 / 侧投影 / 屋后远景 用的取景 */
export const shotFraming = (j: DoorNightShot) => ({ 中心: j.中心, pxPerCell: cellPx(j.N), ...(j.dolly ? { dolly: true } : {}) });
/** 天（渐变、月亮、星星）的取景：一直按开场的 N 16 画（推近牌子时天不跟着放大，像推轨不像变焦），
 *  中心从开场那一镜按 天视差 跟镜头挪，镜头停住时吸到 N 16 的偶数像素（动着不吸，同 镜头） */
export const skyFraming = (j: DoorNightShot) => {
  const [x0, z0] = openingSceneShot.中心;
  const heightDiff = j.中心[1] - z0;
  const { vertLower, vertUpper, softWidth } = skyParallax;
  const z = z0 + vertLower * heightDiff + (vertUpper - vertLower) * (softMax(heightDiff, 0, softWidth) - softWidth / 2);
  const x = lerp(x0, j.中心[0], skyParallax.horizontal);
  return { 中心: j.moving ? ([x, z] as const) : snap(openingSceneShot.N, x, z), pxPerCell: cellPx(openingSceneShot.N) };
};

/** 牌面（整块木板）在页面上的矩形（宽×高 的页面像素）：整片后期的颗粒让开这块（用户 10-24「整片后期的颗粒别压在字上」） */
export const signFaceRects = (songFrame: number, width = 1280, height = 720): PageRect[] => {
  const j = shotAt(songFrame);
  const perPage = (16 * j.N) / (2560 / width);
  const [x, z] = upSection(j.N, signFace);
  const left = width / 2 + (x - entrance.signBoard.宽 / 2 - j.中心[0]) * perPage;
  const top = height / 2 - (z + entrance.signBoard.高 / 2 - j.中心[1]) * perPage;
  return [{ left: Math.floor(left), 上: Math.floor(top), 宽: Math.ceil(entrance.signBoard.宽 * perPage) + 1, 高: Math.ceil(entrance.signBoard.高 * perPage) + 1 }];
};

// ---------- 照片（第 11 句「绽」定格） ----------
/** 定格成拍立得的版式（成片像素比例）。相纸照 核对-拍立得 / 验证片 的拍立得（相纸 #fbfaf6、上左右边 1/32、下边 1/8 照片宽），
 *  画面缩到 0.62、斜 −3°，卡片中心在画面 0.558 高；闪白 5/24 秒（照 验证片，24 fps 时 5 帧），缩进来 0.5 秒（24 fps 时 12 帧） */
export const photoLayout = { photoPaper: '#fbfaf6', borderWidth: 2 / 64, bottomEdge: 8 / 64, 缩放: 0.62, tiltDeg: -3, centerHeight: 0.558, whiteFlashSec: legacyFrameSec(5), shrinkInSec: 0.5, baseDim: 0.55 } as const;
/** 碎裂：照片后面的世界碎成 40 像素（成片）的方块往下掉，下面的先掉、越往上越晚（最多晚 最晚秒，带一点乱序），
 *  重力 17280 像素/秒²（24 fps 时 30 像素/帧²）：最上一排 0.42 秒（24 fps 时 10 帧）掉出画面，同一拍缩起的图标缩好（下线图标.缩秒）时底差不多黑了 */
export const shatter = { 块: 40, latestSec: legacyFrameSec(4), 重力: 30 * 24 * 24 } as const;
/** 咔哒、闪白、大炸声的那一帧（歌曲帧）：36.33「绽」 */
export const freezeFrame = mainCutEvents.screenshotFreeze.帧;
/** 照片里定住的世界比定格帧晚多久：最大那发刚炸那一刻火花全挤在炸点上，拍下来只是个亮点；晚 5/24 秒（24 fps 时 5 帧，约 4 刻）开到半径 1.8 格，
 *  原版 FLASH（4 刻）也刚好没了。定格帧那一下整屏闪白（照片版式 的闪白第一帧不透明度 1），这一截看不出来（演绎） */
export const photoLateSec = legacyFrameSec(5);
/** 照片那一帧（歌曲帧，60 fps 时带小数：定格帧 + 12.5，照片里的世界和 24 fps 时同一刻）：F2 截下的、照片里定住的就是这一刻的世界（核对-门口之夜照片 导出它）。
 *  F2 截图拿来当存档图标是演绎：原版存档图标是第一次进这个世界时自动截的（GameRenderer.takeAutoScreenshot，icon.png 已经有了就不再截），和 F2 无关 */
export const photoFrame = freezeFrame + photoLateSec * fps;
/** 下线：照片缩成存档图标。原版 1.20.1 存档图标（GameRenderer.takeAutoScreenshot）取画面正中的正方形、缩成 64×64（NativeImage.resizeSubRectTo，一步缩到位），
 *  选择世界列表里画成没有边的方块；这里照它裁正中的正方形，落定时 64×64 一个点 8 个成片像素（边 512），中心在画面 0.47 高（底边让开聊天栏暗底）。
 *  演绎：缩的过程（分辨率跟着往 64 降、对数插；门口之夜照片.tsx 每次最多缩一半、几步缩到位，免得一步缩太多出摩尔纹）、相纸边收没、
 *  饱和降到 0.25、蒙一层灰（三稿「褪色、蒙灰的方形图标」= 第 0 镜「选择世界」里那个存档的图标）都是原版没有的 */
export const logoutIcon = { pointCount: 64, side: 512, centerHeight: 0.47, shrinkSec: legacyFrameSec(8), saturation: 0.25, 灰: 'rgba(150, 150, 150, 0.35)' } as const;
/** 定格以后这一帧拍立得卡片的几何（W×H 画布像素，按比例算，画布多大都行）：入 = 缩进来的进度、下 = 缩成图标的进度（下线那一帧已经走了 1/24 秒）、s = 照片缩放，
 *  w、h 照片（不含相纸边）的宽高，边、下边 相纸边宽，cx、cy 照片中心，角 斜度（弧度），源 = 从定住的整幅世界里取哪块 [x, y, 宽, 高]（下线时收成正中的正方形），
 *  点 = 照片这一刻降到几个点见方（不降时 0） */
export const photoCard = (frame: number, W: number, H: number) => {
  const layout = photoLayout;
  const enterProgress = 1 - (1 - clamp01((frame - freezeFrame) / fps / layout.shrinkInSec)) ** 3;
  const logOffFrame = mainCutEvents.logOff.帧;
  const dropT = frame >= logOffFrame ? smootherstep01(((frame - logOffFrame) / fps + oneFrameSec) / logoutIcon.shrinkSec) : 0;
  const s = lerp(1, layout.缩放, enterProgress);
  const u = W / 2560;
  const iconSize = logoutIcon.side * u;
  const w = frame >= logOffFrame ? lerp(W * layout.缩放, iconSize, dropT) : W * s;
  const h = frame >= logOffFrame ? lerp(H * layout.缩放, iconSize, dropT) : H * s;
  const borderWidth = layout.borderWidth * W * s * (1 - dropT);
  const bottomEdge = layout.bottomEdge * W * s * (1 - dropT);
  const cardCenterY = layout.centerHeight * H - (layout.bottomEdge - layout.borderWidth) * W * layout.缩放 * 0.5;
  // 图标中心对到偶数个成片像素，64 个点的边都落在整像素上
  const markCenterY = 2 * Math.round((logoutIcon.centerHeight * 1440) / 2) * u;
  const cx = W / 2;
  const cy = lerp(lerp(H / 2, cardCenterY, enterProgress), markCenterY, dropT);
  const angle = (lerp(layout.tiltDeg * enterProgress, 0, dropT) * Math.PI) / 180;
  const srcRect = [lerp(0, (W - H) / 2, dropT), 0, lerp(W, H, dropT), H] as const;
  const dotCount = dropT > 0 ? Math.round(logLerp(H, logoutIcon.pointCount, dropT)) : 0;
  return { 入: enterProgress, 下: dropT, s, w, h, borderWidth, bottomEdge, cx, cy, 角: angle, 源: srcRect, 点: dotCount };
};

/** 聊天栏缩放（黄字）：一个界面像素 = 10 个成片像素。第 15 句「Steve加入了游戏」用的 6 在手机 390 宽上字只有 7 像素高、读不出来，
 *  这一句下线是这镜要交代的事，只在这里放大到 12 像素高（第 15 句没动；两处要不要统一等用户定）。
 *  这一行的暗底（聊天宽同第 15 句 110）占成片 x 0～1220、y 950～1040 */
export const chatScale = 10;

// ---------- 声音 ----------
/** 增益（压在歌下面）：火箭发射、炸开、大炸、噼啪、种树苗、相机咔哒（同 场/1-隐世之境一楼/参数.ts 的 咔哒增益 0.7） */
export const soundGain = { 发射: 0.35, 炸: 0.3, 大炸: 0.4, 噼啪: 0.2, 种树苗: 0.7, 咔哒: 0.7 } as const;
