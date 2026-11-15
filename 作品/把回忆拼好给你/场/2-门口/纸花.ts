// 第 14 句飘的碎纸和樱花瓣。用户 10-25 定：「撕的不够碎啊 并且应该横向飘过去 以便转场 飘过去的时候 颜色和形状都渐渐变成樱花的样子」，
//   又「落路线怎么是直着向左的 至少应该是斜着向左吧」（在 46.5 秒的截图上画了一道弧：从右屏上沿外往下陡陡地落，越往下越被吹向左、弧越来越平，
//   画面 40% 高处过分屏线，进左屏缓缓往下到她那座屋子的屋檐）。
//   纸飘下 那一拍起风：右屏教学楼窗里一把把扔出、楼上落下来的碎纸（小块、毛边、印着一两道字行）先往下落，再被风越吹越往左，斜着往左下飘过分屏线到她那边；
//   一边飘一边一档一档变（每一片自己的时刻，不是整片一起）：颜色从白到粉、形状按像素格从碎纸变成原版樱花瓣，越往左越像樱花，合屏起 那一刻飘着的已经全是樱花瓣，
//   顺着风飘进 2-摇铃，风在你转向铃以前停（摇铃再起樱花风）。左屏樱花林掉的花瓣吃同一阵风（用户 10-25「两边一个方向」）。
//   她按框、取合照、传送走那几拍，她和照片墙那块不让东西挡（让开框）。
// 坐标是整页的页面像素（1280×720，原点左上），都钉在画面上（合屏时底下的画面挪，它们不跟着挪）。时间按歌上的秒：2-归隐、2-摇铃 按同一个秒画出来一样，接缝接得上。
// 纯模块（测试也读），画法在 纸花层.tsx。2D 自画的效果归进 规矩.toml 可用2D自创效果 的「花瓣飘落」。参数没写出处的都是 Agent 暂定。
import { filmScale } from '@engine/三渲二/像素.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLines13To14Events } from '../../分镜/正片第13至14句.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { sideProjection } from '../../地点/侧剖面.tsx';
import { photoWallCellPos, photoWallFaceY } from '../../地点/照片墙格.ts';
import { paperWindows, downstairsTopFace } from '../../现实/楼下布局.ts';
import { fullScreenShot, orthoTop } from './参数.ts';
import { splitLineX, photoStandPos, mergedScreenOffset, retreatLayout, downstairsFraming } from './归隐参数.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLines13To14Events, ...mainCutLine15Events };

const events = mainCutEvents;

export type PieceKind = '纸' | '瓣';
/** 一片：生 = 出发那一刻（歌上的秒）；x0、y0 出发点（页面像素，左上角）；vx、vy 没风时飘的速度（页面像素/秒）；u、w 出发时的初速（纸从窗里扔出来，其余同 vx、vy）；
 *  吃风 = 风速乘多少；迟、升 = 出发（起风前就在飘的从起风算）后先落 迟 秒、再用 升 秒一点点被风带起来（见 风）；摆、频、相 = 晃的幅度（页面像素）、每秒几下、相位；翻频 = 翻面每秒几圈；轴 = 碎纸翻的轴（横 = 上下翻，矮下去；竖 = 左右翻，窄下去）；
 *  图 = 碎纸用 碎图们 的哪张（瓣：樱花贴图 0～11）；瓣 = 变成哪张樱花贴图（瓣：同 图）；转、翻 = 起始转几个 90°（碎纸只正着、倒着放，字行总是横的）、左右翻不翻；
 *  档 = 一个贴图像素几个成片像素；变 = 碎纸往下一档变的时刻（变档数 个，歌上的秒；瓣：空）；格们 = 碎纸第 0、1、2 档的样子（碎纸 → 两档中间形状；瓣：空） */
export type PaperPiece = {
  种: PieceKind;
  生: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  u: number;
  w: number;
  windTake: number;
  delay: number;
  rise: number;
  swing: number;
  freq: number;
  phase: number;
  flipFreq: number;
  axis: '横' | '竖';
  图: number;
  petal: number;
  转: number;
  flip: boolean;
  档: number;
  tierSecs: readonly number[];
  cells: readonly (readonly string[])[];
};

/** 碎纸的样子（正面朝上；W 纸、L 印的字行、R 红笔、. 撕掉的空），一格一个贴图像素。认得出是撕碎的纸靠：方的纸边、横的字行、一道撕开的锯齿边或斜茬
 *  （圆乎乎的一团看着像雪、像云，不像纸）。用户 10-25 定「撕的不够碎啊」：比原来整页（6×8）小一圈，3～5 格 */
export const shardImages = [
  ['WWWWW', 'LLLLW', 'WWWWW', 'W.W.W'],
  ['WWWWW', 'LLLW.', 'WWW..', 'LW...'],
  ['WWW.', 'LLLW', 'WWW.', 'LLLW', 'WWW.'],
  ['WWWWW', 'LLLLL', '.W.WW'],
  ['WRRWW', 'WWWWW', 'LLLW.', 'WWW.W'],
  ['.WWWW', 'WLLLL', 'WWWWW', 'WLL.W'],
  ['WWWW', 'LLLW', 'WWWW', 'W.WW', '..W.'],
  ['WWWWW', 'WWLLL', 'WWWWW', '.W..W'],
] as const;

/** 原版樱花瓣（cherry_0～11，各 3×3）的形状：0～5 缺左上、右下两角，6～11 缺右上、左下两角（贴图按 资产锁 量的；颜色在 纸花层.tsx 读贴图） */
export const petalShape = (k: number): readonly string[] => (k < 6 ? ['.XX', 'XXX', 'XX.'] : ['XX.', 'XXX', '.XX']);

/** 碎纸变几档：0 碎纸 → 1、2 中间形状（多出来的格一步步掉、缺的格补上，颜色一档比一档粉）→ 3 樱花瓣的形状（还偏白）→ 4 原版樱花瓣 */
export const tierCount = 4;

export const paperParams = {
  种子: 1424,
  /** 一个贴图像素几个成片像素：花瓣、近处的碎纸 20（同 特效/樱花风参数.ts 风流 的 2N 那档），远处的碎纸 10（同门口的方块贴图，一样的碎纸小一半，漫天里分出远近）。
   *  近处一片碎纸 3～5 格 = 30～50 页面像素，变成的樱花瓣 30 页面像素，同左屏的花瓣 */
  petalTier: 20,
  nearTier: 20,
  farTiers: 10,
  /** 没风时飘的速度（页面像素/秒）：往下 220～270、往左 50～80（碎纸、花瓣同一套） */
  vy: [220, 270] as const,
  vx: [-80, -50] as const,
  swingRange: [4, 14] as const,
  freq: [0.5, 1.1] as const,
  flipFreq: [0.7, 1.3] as const,
  /** 花瓣一秒生几片（整页宽上，从画面上沿外面飘进来；原版樱花树叶一直零零星星掉花瓣） */
  petalDensity: 4,
  /** 碎纸从窗里扔出来时的初速（页面像素/秒）：往左右 u、往下 w（负 = 往上抛）；拽成飘的速度的时间常数（秒） */
  throwU: [-320, 160] as const,
  throwW: [-260, 40] as const,
  tugSec: 0.35,
} as const;

/** 风（用户 10-25「应该横向飘过去 以便转场」「至少应该是斜着向左吧」）：纸飘下 前后 起 秒里刮起来（两头慢），一直刮到你转向铃，摇铃那一拍停住
 *  （摇铃从铃那里再起樱花风，两阵风不打架）：合屏时满屏的樱花瓣顺风往左下飘出去。
 *  不是一起风就整片横着走：每一片被风裹走有个先后（揽）——出发以后（起风前就在飘的花瓣从起风算）先照常往下落 迟 秒，再在 升 秒里一点点被风带起来，
 *  所以每片走的是一道弧：先陡（主要往下），越往下越被吹向左，弧越来越平。迟、升 每片随机，同一刻有的还在落、有的已经吹开，不排成一列。
 *  带满时的风速（页面像素/秒）：往左 600、往上托 40，加上没风时的往下 220～270、往左 50～80，斜着往左下走（往左 500～830、往下 170～240，往下斜 12°～26°，
 *  居中的一片 17°）；每一片吃风 吃 倍，快慢、斜度错开。
 *  迟、升、速 是照用户画的那道弧拟的（居中的一片从上沿外 x 1000 落下来，同那道弧平均差 8 页面像素）：先落一百二十页面像素才往左挪三十，
 *  1.1 秒过分屏线、过线时在画面 39% 高，到屋檐那么左（x 333）时在 52% 高——比那道弧末尾低 35 页面像素：进左屏斜 17°，那道弧末尾快拉平了（8°），
 *  斜一点才读得出「斜着往左下」，左屏的花瓣也是这个斜度（Agent 暂定） */
export const windParams = {
  起: [-0.15, 0.25] as const,
  速: [-600, -40] as const,
  windRange: [0.75, 1.25] as const,
  delay: [0.2, 0.4] as const,
  rise: [0.5, 0.75] as const,
} as const;

/** 碎纸从哪来（都从 纸飘下 那一拍起算，秒）。用户 10-25「撕的不够碎啊」，数量照样多（漫天）：
 *  窗把们：一楼、二楼的窗里一把一把往外扔（撒纸窗们 的第 窗 扇；迟 秒扔 张 片，一把里一片隔 把内隔 秒），窗远 = 其中远处那档的占比；
 *  窗里扔出来的先在楼的背风里：抛的劲过去才落、才被风带（迟 再多 抛后 秒），也是先往下落再吹走；
 *  外来：更高的楼层、楼的另一头撕的（[起, 满) 越来越密、[满, 止) 每秒 密 片，远处那档占 远）：顶占 那么多从右屏上沿外（x 在 顶x 里）往下掉进来、带着往下的初速 落w
 *  （从高处落下来，比飘的快），是用户画的那道弧的起头；其余从右屏右沿外飘进来（出发高在 [上, 下) 页面像素：再低的落一段就进了她和照片墙那块）；
 *  扔、刮都在 0.7 秒里收住：最晚的一片也要来得及当一会儿碎纸、再一档档变完（变完秒） */
export const scatterPaper = {
  windowBunches: [
    { 窗: 1, delay: 0, sheetCount: 5 },
    { 窗: 0, delay: 0.04, sheetCount: 5 },
    { 窗: 3, delay: 0.08, sheetCount: 5 },
    { 窗: 2, delay: 0.12, sheetCount: 5 },
    { 窗: 1, delay: 0.16, sheetCount: 5 },
    { 窗: 0, delay: 0.2, sheetCount: 5 },
    { 窗: 3, delay: 0.24, sheetCount: 5 },
    { 窗: 2, delay: 0.28, sheetCount: 5 },
    { 窗: 1, delay: 0.32, sheetCount: 5 },
    { 窗: 0, delay: 0.36, sheetCount: 5 },
    { 窗: 3, delay: 0.4, sheetCount: 5 },
    { 窗: 2, delay: 0.44, sheetCount: 5 },
    { 窗: 1, delay: 0.48, sheetCount: 4 },
    { 窗: 0, delay: 0.52, sheetCount: 4 },
    { 窗: 3, delay: 0.56, sheetCount: 4 },
    { 窗: 2, delay: 0.6, sheetCount: 4 },
  ],
  batchGap: 0.03,
  throwLag: 0.15,
  farChance: 0.35,
  inbound: { 起: 0.03, full: 0.15, 止: 0.6, spawnRate: 80, farShare: 0.55, topChance: 0.75, topX: [640, 1240] as const, fallW: [330, 450] as const, 上: -30, 下: 250 },
} as const;

/** 碎纸怎么变（用户 10-25「飘过去的时候 颜色和形状都渐渐变成樱花的样子」；主会话转述：一张一张看得出在变、按像素格一步步来）：
 *  每一片中心飘过 起x（页面 x，分屏线前后，每片随机）或者飘了 纸龄 秒（每片随机），哪个先到就开始变，一档停 档秒（24 fps 时 4～5 帧）；
 *  每片出发、过线的时刻都错开，变的时刻跟着错开，不是整片一起变。扔出来以后至少当 纸秒 秒碎纸（先看清是撕碎的纸）；
 *  来不及在 变完秒 以前变完的提前起，各自的期限再往前错开 0～期错 秒（不在 变完秒 那一帧齐刷刷换最后一档） */
export const paperVariation = { startX: [600, 760] as const, paperAge: [0.45, 0.8] as const, tierSec: [0.15, 0.21] as const, paperSec: 0.3, endJitter: 0.25 } as const;

/** 碎纸得在哪一刻以前全变成樱花瓣：合屏起（主会话转述用户 10-25 的意思：合成一整屏的时候飘着的已经都是樱花瓣），留 1/48 秒（24 fps 时半帧） */
export const changeDoneSec = events.mergeScreenStart.秒 - 1 / 48;

/** 分屏的中线（页面 x）：合屏前，花瓣只在左边 */
export const centerLine = retreatLayout.leftWidth;

/** 合屏起：分屏线开始往右推，现实那半后面的花瓣跟着露出来 */
export const mixStart = events.mergeScreenStart.秒;

/** 让开框：她按框、打框、取下合照、传送走那几拍（手按合照 前 0.1 秒到 合屏起），她和照片墙那一块（页面像素，合屏前的左屏）不让碎纸、花瓣挡着。
 *  框 = 照片墙（夏天四格加合照格）和取照时的她（站位左右各 0.6 格、2.2 格高，帽子、传送粒子都在里面），再往外放 留 页面像素 */
export const stepAside = (() => {
  const project = sideProjection({ 中心: [mergedScreenOffset, fullScreenShot.framing.中心[1]], pxPerCell: fullScreenShot.framing.pxPerCell }, 1280, 720, orthoTop);
  const cells = [...photoWallCellPos.summer, photoWallCellPos.groupPhoto];
  const points = [
    ...cells.flatMap(([i, k]) => [project(i - 0.5, k, photoWallFaceY), project(i + 0.5, k + 1, photoWallFaceY)]),
    project(photoStandPos - 0.6, 0, 0.5),
    project(photoStandPos + 0.6, 2.2, 0.5),
  ];
  const margin = 12;
  return {
    left: Math.min(...points.map((p) => p.x)) - margin,
    right: Math.max(...points.map((p) => p.x)) + margin,
    上: Math.min(...points.map((p) => p.y)) - margin,
    下: Math.max(...points.map((p) => p.y)) + margin,
    起: events.handOnPhoto.秒 - 0.1,
    止: events.mergeScreenStart.秒,
  };
})();

/** 花瓣从哪一刻起生（2-归隐 第一帧画面里已经飘满）到哪一刻（2-摇铃 转场）；生在画面上沿外 出发高 页面像素，右边多生一截（往左飘着进画） */
const bornStart = events.splitSceneChange.秒 - 6;
const bornEnd = events.windClears.秒;
const startHeight = 48;
const leftMargin = 40;
const rightMargin = 400;

/** 同 engine/model/parts.tsx 的 rng（mulberry32；纯模块不引 tsx） */
const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleRange = (a: readonly [number, number], r: () => number) => a[0] + r() * (a[1] - a[0]);
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

// ---------- 风 ----------
const windRange = [events.paperDrifts.秒 + windParams.起[0], events.paperDrifts.秒 + windParams.起[1]] as const;
const windFallRange = [events.turnToBell.秒, events.ringBell.秒] as const;

/** 这一刻风刮得多大（0～1） */
export const windForce = (t: number) => smoothstep(clamp01((t - windRange[0]) / (windRange[1] - windRange[0]))) * (1 - smoothstep(clamp01((t - windFallRange[0]) / (windFallRange[1] - windFallRange[0]))));

/** 这一片从哪一刻起被风带（出发、起风哪个晚从哪个算，再落 迟 秒） */
const gatherStart = (q: PaperPiece) => Math.max(q.生, events.paperDrifts.秒) + q.delay;

/** 这一刻这一片被风带得多紧（0～1）：揽起 以前 0，升 秒里缓到 1 */
const gatherProgress = (q: PaperPiece, t: number) => smoothstep(clamp01((t - gatherStart(q)) / q.rise));

/** 五点高斯—勒让德求积的节点、权重（[−1, 1] 上） */
const gaussian = [
  [0, 0.5688888888888889],
  [-0.5384693101056831, 0.4786286704993665],
  [0.5384693101056831, 0.4786286704993665],
  [-0.906179845938664, 0.2369268850561891],
  [0.906179845938664, 0.2369268850561891],
] as const;

/** 这一片出发到 t 被风吹的量（秒，∫ 风力 × 揽）：被积的是三道 smoothstep 坡相乘，两个坡的端点之间是九次以内的多项式，五点高斯分段积出来是准的 */
const windAmount = (q: PaperPiece, t: number) => {
  const startSec = Math.max(q.生, gatherStart(q));
  if (t <= startSec) return 0;
  const breaks = [startSec, ...[windRange[0], windRange[1], gatherStart(q) + q.rise, windFallRange[0], windFallRange[1]].filter((s) => s > startSec && s < t), t].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < breaks.length; i++) {
    const halfSpan = (breaks[i]! - breaks[i - 1]!) / 2;
    const center = (breaks[i]! + breaks[i - 1]!) / 2;
    for (const [z, w] of gaussian) sum += w * halfSpan * windForce(center + halfSpan * z) * gatherProgress(q, center + halfSpan * z);
  }
  return sum;
};

// ---------- 一片走到哪 ----------
/** 出发后 τ 秒走了多远（一个方向）：初速 v0 按 拽秒 指数地拽成 v */
const travel = (v0: number, v: number, τ: number) => v * τ + (v0 - v) * paperParams.tugSec * (1 - Math.exp(-τ / paperParams.tugSec));

/** 第几档（0 碎纸 … 变档数 樱花瓣）；花瓣一直是 变档数 */
export const tierIndex = (q: PaperPiece, t: number) => (q.种 === '瓣' ? tierCount : q.tierSecs.filter((s) => s <= t).length);

/** 碎纸的外框（页面像素，宽、高）；花瓣 3×3 */
export const pieceFrame = (q: PaperPiece): { 宽: number; 高: number } => {
  const cellSize = q.档 / filmScale;
  if (q.种 === '瓣') return { 宽: 3 * cellSize, 高: 3 * cellSize };
  const imgRows = shardImages[q.图]!;
  return { 宽: imgRows[0]!.length * cellSize, 高: imgRows.length * cellSize };
};

/** 一片在 t 时的外框左上角（页面像素，没吸整）；翻 = 翻面的余弦（碎纸：1 正面朝前、0 侧成一条线、负 背面朝前）；转 = 转几个 90°（樱花瓣一圈转四下，碎纸不转）；档 = 档位。
 *  碎纸变成樱花瓣的形状（第 3 档）以后，瓣画在外框正中 */
export const paperAt = (q: PaperPiece, t: number): { x: number; y: number; flipCos: number; 转: number; 档: number } => {
  const τ = t - q.生;
  const turns = q.flipFreq * τ + q.phase;
  const blow = windAmount(q, t);
  const swayPhase = 2 * Math.PI * (q.freq * τ + q.phase);
  const tier = tierIndex(q, t);
  return {
    x: q.x0 + travel(q.u, q.vx, τ) + q.windTake * windParams.速[0] * blow + q.swing * Math.sin(swayPhase),
    y: q.y0 + travel(q.w, q.vy, τ) + q.windTake * windParams.速[1] * blow + q.swing * windForce(t) * Math.cos(swayPhase),
    flipCos: Math.cos(2 * Math.PI * turns),
    转: q.种 === '纸' && tier < tierCount - 1 ? q.转 : (q.转 + Math.floor(turns * 4)) % 4,
    档: tier,
  };
};

/** 这一刻看不看得见：碎纸出发以后一直看得见（窗里扔出来、或者从画面外刮进来，过分屏线就画在她那边）；
 *  花瓣在她那边，分屏线左边才看得见（合屏时分屏线推过去，现实那半后面的花瓣跟着露出来） */
export const isVisible = (q: PaperPiece, t: number): boolean => {
  if (t < q.生) return false;
  return q.种 === '纸' || paperAt(q, t).x < splitLineX(t);
};

/** 外框这一刻压不压着让开框 */
const pressedAside = (q: PaperPiece, t: number) => {
  const { x, y } = paperAt(q, t);
  const k = pieceFrame(q);
  return x + k.宽 > stepAside.left && x < stepAside.right && y + k.高 > stepAside.上 && y < stepAside.下;
};

/** 让开框那几拍有没有挡着她（每 1/48 秒查一次，24 fps 时半帧） */
export const blocksLiYing = (q: PaperPiece): boolean => {
  for (let t = Math.max(stepAside.起, q.生); t < stepAside.止; t += 1 / 48) if (isVisible(q, t) && pressedAside(q, t)) return true;
  return false;
};

/** 花瓣合屏起以前在画面里从分屏线后面钻出来（现实那半后面的花瓣被风吹过线）：会看着像碎纸一下子变了花瓣，不要 */
const popsOutBehindLine = (q: PaperPiece): boolean => {
  let behindLine = false;
  let beforeLine = false;
  for (let t = q.生; t < mixStart; t += 1 / 48) {
    const { x, y } = paperAt(q, t);
    if (y + pieceFrame(q).高 <= 0 || y >= 720) continue;
    if (x + pieceFrame(q).宽 > centerLine) behindLine = true;
    if (x < centerLine) beforeLine = true;
  }
  return behindLine && beforeLine;
};

// ---------- 造 ----------
/** 碎纸第 1、2 档的形状：瓣形摆在外框正中，碎纸多出来的格离瓣心远的先掉（同远近随机），第 1 档掉三分之一、第 2 档掉三分之二，瓣形里缺的格第 2 档补上（补的格是纸白） */
const midShapes = (imgRows: readonly string[], petal: number, r: () => number): string[][] => {
  const [W, H] = [imgRows[0]!.length, imgRows.length];
  const ox = Math.floor((W - 3) / 2);
  const oy = Math.floor((H - 3) / 2);
  const shape = petalShape(petal);
  const inPetal = (i: number, j: number) => shape[j - oy]?.[i - ox] === 'X';
  const extraCells: { i: number; j: number; farDist: number }[] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (imgRows[j]![i] !== '.' && !inPetal(i, j)) extraCells.push({ i, j, farDist: Math.hypot(i - ox - 1, j - oy - 1) + r() * 0.5 });
  extraCells.sort((a, b) => b.farDist - a.farDist);
  const makeTier = (dropCount: number, fill: boolean) => {
    const dropped = new Set(extraCells.slice(0, dropCount).map((c) => c.j * W + c.i));
    return imgRows.map((row, j) =>
      [...row].map((c, i) => (dropped.has(j * W + i) ? '.' : c === '.' && fill && inPetal(i, j) ? 'W' : c)).join(''),
    );
  };
  return [[...imgRows], makeTier(Math.ceil(extraCells.length / 3), false), makeTier(Math.ceil((extraCells.length * 2) / 3), true)];
};

/** r揽：迟、升 从哪个随机数里取（花瓣另用一串，起风前的花瓣还是原来那些） */
const makePiece = (
  pieceKind: PieceKind,
  birthSec: number,
  x0: number,
  y0: number,
  tier: number,
  r: () => number,
  throwVel?: readonly [number, number],
  gatherRng: () => number = r,
): PaperPiece => {
  const p = paperParams;
  const vx = sampleRange(p.vx, r);
  const vy = sampleRange(p.vy, r);
  const imgIdx = Math.floor(r() * (pieceKind === '纸' ? shardImages.length : 12));
  const petal = pieceKind === '纸' ? Math.floor(r() * 12) : imgIdx;
  return {
    种: pieceKind,
    生: birthSec,
    x0,
    y0,
    vx,
    vy,
    u: throwVel ? throwVel[0] : vx,
    w: throwVel ? throwVel[1] : vy,
    windTake: sampleRange(windParams.windRange, r),
    delay: sampleRange(windParams.delay, gatherRng),
    rise: sampleRange(windParams.rise, gatherRng),
    swing: sampleRange(p.swingRange, r),
    freq: sampleRange(p.freq, r),
    phase: r(),
    flipFreq: sampleRange(p.flipFreq, r),
    axis: r() < 0.5 ? '横' : '竖',
    图: imgIdx,
    petal,
    转: pieceKind === '纸' ? 2 * Math.floor(r() * 2) : Math.floor(r() * 4),
    flip: r() < 0.5,
    档: tier,
    tierSecs: [],
    cells: pieceKind === '纸' ? midShapes(shardImages[imgIdx]!, petal, r) : [],
  };
};

/** 碎纸一档档变的时刻：中心飘过 起x 或者飘了 纸龄 秒（先到的那个）起，一档 档秒；来不及就提前起、再不够就把一档压短（扔出来以后至少 纸秒 秒是碎纸） */
const varyPaper = (q: PaperPiece, r: () => number): PaperPiece => {
  const startX = sampleRange(paperVariation.startX, r);
  const age = sampleRange(paperVariation.paperAge, r);
  let d = sampleRange(paperVariation.tierSec, r);
  const halfWidth = pieceFrame(q).宽 / 2;
  let passedAt = Infinity;
  for (let t = q.生; t < changeDoneSec; t += 1 / 96)
    if (paperAt(q, t).x + halfWidth <= startX) {
      passedAt = t;
      break;
    }
  const n = tierCount - 1;
  const targetEnd = changeDoneSec - r() * paperVariation.endJitter;
  let s = Math.max(q.生 + paperVariation.paperSec, Math.min(passedAt, q.生 + age, targetEnd - n * d));
  if (s + n * d > changeDoneSec) d = (changeDoneSec - s) / n;
  s = Math.min(s, changeDoneSec - n * d);
  return { ...q, tierSecs: Array.from({ length: tierCount }, (_, k) => s + k * d) };
};

/** 合屏前的整页上，楼下取景里的点（格）在哪（页面像素）：右屏左沿在 中线 */
const projectDownstairs = (() => {
  const project = sideProjection(downstairsFraming, retreatLayout.rightWidth, 720, downstairsTopFace);
  return (x: number, z: number, y: number) => {
    const p = project(x, z, y);
    return { x: centerLine + p.x, y: p.y };
  };
})();

/** 造一片，挡她就重来（最多 试 次；都挡就不要这一片） */
const placeUnblocked = (make: () => PaperPiece, tries = 12): PaperPiece | null => {
  for (let i = 0; i < tries; i++) {
    const q = make();
    if (!blocksLiYing(q)) return q;
  }
  return null;
};

/** 窗里扔的：窗洞里随机一点出发（碎纸的中心），往外扔开，落一阵再被风越吹越往左 */
const thrownFromWindow = (r: () => number): PaperPiece[] =>
  scatterPaper.windowBunches.flatMap((handful) => {
    const windowItem = paperWindows[handful.窗]!;
    const a = projectDownstairs(windowItem.x[0], windowItem.z[1], windowItem.y);
    const b = projectDownstairs(windowItem.x[1], windowItem.z[0], windowItem.y);
    return Array.from({ length: handful.sheetCount }, (_, i) =>
      placeUnblocked(() => {
        const tier = r() < scatterPaper.farChance ? paperParams.farTiers : paperParams.nearTier;
        const halfSize = (4.5 * tier) / filmScale / 2;
        const cx = a.x + r() * (b.x - a.x);
        const cy = a.y + r() * (b.y - a.y);
        const q = makePiece('纸', events.paperDrifts.秒 + handful.delay + i * scatterPaper.batchGap, cx - halfSize, cy - halfSize, tier, r, [sampleRange(paperParams.throwU, r), sampleRange(paperParams.throwW, r)]);
        return { ...q, delay: q.delay + scatterPaper.throwLag };
      }),
    ).filter((q) => q !== null);
  });

/** 外来的：从右屏上沿外掉进来、右沿外飘进来 */
const inboundPieces = (r: () => number): PaperPiece[] => {
  const s = scatterPaper.inbound;
  const out: PaperPiece[] = [];
  const dt = 1 / 240;
  let spawnAccum = 0;
  let threshold = r();
  for (let τ = s.起; τ < s.止; τ += dt) {
    spawnAccum += s.spawnRate * Math.min(1, (τ - s.起) / (s.full - s.起)) * dt;
    while (spawnAccum >= threshold) {
      spawnAccum -= threshold;
      threshold = 0.5 + r();
      const q = placeUnblocked(() => {
        const tier = r() < s.farShare ? paperParams.farTiers : paperParams.nearTier;
        if (r() < s.topChance) {
          const height = (5 * tier) / filmScale;
          return makePiece('纸', events.paperDrifts.秒 + τ, sampleRange(s.topX, r), -height - 4, tier, r, [sampleRange(paperParams.vx, r), sampleRange(s.fallW, r)]);
        }
        return makePiece('纸', events.paperDrifts.秒 + τ, 1280 + 4, sampleRange([s.上, s.下], r), tier, r);
      });
      if (q) out.push(q);
    }
  }
  return out;
};

/** 花瓣一路生：每 1/240 秒累计一次，攒满一片生一片（每片的门槛随机，不排成一排）；挡她、从分屏线后面钻出来的不要 */
const petalsFromSeed = (seed: number): PaperPiece[] => {
  const r = rng(seed);
  const gatherRng = rng(seed + 100);
  const out: PaperPiece[] = [];
  const dt = 1 / 240;
  let spawnAccum = 0;
  let threshold = r();
  for (let t = bornStart; t < bornEnd; t += dt) {
    spawnAccum += paperParams.petalDensity * dt;
    while (spawnAccum >= threshold) {
      spawnAccum -= threshold;
      threshold = 0.5 + r();
      const q = makePiece('瓣', t, -leftMargin + r() * (1280 + leftMargin + rightMargin), -startHeight - r() * 24, paperParams.petalTier, r, undefined, gatherRng);
      if (!blocksLiYing(q) && !popsOutBehindLine(q)) out.push(q);
    }
  }
  return out;
};

let paperFlowerCache: PaperPiece[] | null = null;
/** 全部的碎纸和花瓣（定死的种子，算一次）。碎纸先画远的、再画近的（近的压在远的上面），花瓣最后 */
export const paperFlowers = (): readonly PaperPiece[] =>
  (paperFlowerCache ??= (() => {
    const r = rng(paperParams.种子 + 2);
    const papers = [...thrownFromWindow(r), ...inboundPieces(r)].map((q) => varyPaper(q, r)).sort((a, b) => a.档 - b.档);
    return [...papers, ...petalsFromSeed(paperParams.种子 + 1)];
  })());
