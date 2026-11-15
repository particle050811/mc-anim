// 符文拼字（用户 10-24：「每个字由几枚附魔台符文从旁边飞过来，拼出这个字的笔画，落定时闪一下」，不是原地把符文换成汉字）。纯模块。
// 一个汉字的点按位置分成两三块（k 均值，块数看字的繁简），一块笔画由一枚符文送来：符文从字的右边飞过来，落到这一块的中心，落定那一帧换成这块笔画。
// 飞的路线照原版附魔台的飞字粒子 EnchantmentTableParticle.tick（1.20.1 client jar）：p = 年龄 ÷ 寿命，
//   位置 = 终点 + 起点偏移 ·(1 − p)，竖直再加 1.2 格 ·(1 − p⁴)：前面一路平着滑过来，最后一小段才往下落进去。
// 符文是这个字拼音的银河字母（块比字母多就从头再轮），沿用 10-22 的「读音落成字」。
import { fps, legacyFrameSec } from '../分镜/时间.ts';
import { scatter, type DotMatrix } from './符文排版.ts';

export type Vec2 = readonly [number, number];

/** 一块笔画：块里的点（字格里的坐标）和中心 */
export type RuneBlock = { 点: readonly Vec2[]; 心: Vec2 };

/** 一个字分几块：点少于 60 的 2 块，其余 3 块（一块 20～37 个点，手机上看得出是一大块笔画落上来；核查 10-24：原来 2～5 块、一块只有十几个点，看着像碎屑）。Agent 定 */
export const tileCount = (pointCount: number) => (pointCount < 60 ? 2 : 3);

/** 符文画多大：一个银河字母像素画成 符文倍 × 符文倍 个点（5×7 的字母画成 10×14 点，和一个字差不多大，手机 390 宽上约 10×15 像素）；
 *  落定前最后 收拢 那一截缩回 1 倍，像落进字里。Agent 定（核查 10-24：1 倍在手机上只是一串紫点） */
export const runeScale = 2;
export const gatherFactor = 0.8;

const splitCache = new Map<string, RuneBlock[]>();

/**
 * 把一个字的点分成 块数 块：最远点法定初值（从最左上的点起，确定、不用随机），k 均值迭代 12 次；
 * 块按书写顺序排（中心 先上后下、先左后右，y 占两份），落定也按这个顺序
 */
export const splitBlocks = (char: string, glyph: DotMatrix): RuneBlock[] => {
  const cachedChunk = splitCache.get(char);
  if (cachedChunk) return cachedChunk;
  const points = glyph.点;
  const k = Math.min(tileCount(points.length), points.length);
  const d2 = (a: Vec2, b: Vec2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let centers: [number, number][] = [];
  const topLeftPoint = points.reduce((a, p) => (p[0] + p[1] < a[0] + a[1] ? p : a));
  centers.push([topLeftPoint[0], topLeftPoint[1]]);
  while (centers.length < k) {
    let farPoint = points[0]!;
    let maxDist = -1;
    for (const p of points) {
      const d = Math.min(...centers.map((c) => d2(p, c)));
      if (d > maxDist) {
        maxDist = d;
        farPoint = p;
      }
    }
    centers.push([farPoint[0], farPoint[1]]);
  }
  let merged: number[] = [];
  for (let it = 0; it < 12; it++) {
    merged = points.map((p) => {
      let best = 0;
      centers.forEach((c, i) => {
        if (d2(p, c) < d2(p, centers[best]!)) best = i;
      });
      return best;
    });
    centers = centers.map((c, i) => {
      const cluster = points.filter((_, j) => merged[j] === i);
      return cluster.length ? [cluster.reduce((a, p) => a + p[0], 0) / cluster.length, cluster.reduce((a, p) => a + p[1], 0) / cluster.length] : c;
    });
  }
  const out = centers
    .map((c, i) => ({ 点: points.filter((_, j) => merged[j] === i), 心: [c[0], c[1]] as Vec2 }))
    .filter((b) => b.点.length > 0)
    .sort((a, b) => a.心[1] * 2 + a.心[0] - (b.心[1] * 2 + b.心[0]));
  splitCache.set(char, out);
  return out;
};

/** 一枚符文怎么飞：起 = 起飞帧，落 = 落定帧（段内帧，带小数）；dx、dy = 起点离落点几点（往右、往下为正，不含竖直那一落）；抬 = 原版那 1.2 格的落差（点）；亮 = 明暗（0.8～1：原版粒子 0.4～1 有深有浅，太暗的在夜里看不见） */
export type FlyPiece = { letter: string; 起: number; landTime: number; dx: number; dy: number; lift: number; brightness: number };

/**
 * 飞的参数（Agent 定）：从字的右边 20～34 点（一到两个字宽）飞来，起点上下差 −3～3 点，最后落差 4～7 点；符文（按 符文倍 画）顶不高过字格顶 顶空 点
 * （顶上那行的边距 11 点，符文不出画面），底不低过字格底 下伸 点（不压下面的画面）。最短秒 = 24 fps 时 2 帧。
 * 都从右边来：字从左往右拼出，右边是还空着的地方，符文从那里流过来不压已经拼好的字
 */
export const flyParams = { lateral: [20, 34], 竖: [-3, 3], lift: [4, 7], topGap: 10, extendDown: 6, minFlySec: legacyFrameSec(2) } as const;

/** 飞着的符文半高（点） */
const halfHeight = 3.5 * runeScale;

const 取 = (r: number, [a, b]: readonly [number, number]) => a + (b - a) * r;

/**
 * 一个字每块的符文：第 k 块在 起～完 之间按顺序落定（第一块 起、最后一块 完），起飞 = 落定 − 飞秒，但不早于这个字进场（入）；
 * 起晚了的飞得近（路程按飞的时长缩，速度不变），不到 飞法.最短秒 的不飞（直接落定、照样闪）。种 = 这个字在全片里的定死编号
 */
export const flyBlocks = (chunks: readonly RuneBlock[], pinyin: string, timeSpan: { 起: number; end: number; 入: number }, flySec: number, seed: number): FlyPiece[] =>
  chunks.map((runeBlock, k) => {
    const n = chunks.length;
    const landTime = n === 1 ? timeSpan.end : timeSpan.起 + ((timeSpan.end - timeSpan.起) * k) / (n - 1);
    const startFrame = Math.max(landTime - flySec * fps, timeSpan.入);
    const flies = (landTime - startFrame) / fps >= flyParams.minFlySec;
    const flyRatio = flies ? (landTime - startFrame) / (flySec * fps) : 0;
    // 竖直偏移 = dy·(1−p) − 抬·(1−p⁴)，在 min(dy, 0) − 抬 和 max(dy, 0) 之间：两头夹在 顶空、下伸 里
    const dy = Math.min(Math.round(取(scatter(seed, k, 12), flyParams.竖) * flyRatio), Math.floor(16 + flyParams.extendDown - halfHeight - runeBlock.心[1]));
    const lift = Math.round(取(scatter(seed, k, 13), flyParams.lift) * flyRatio);
    return {
      letter: pinyin[k % pinyin.length]!,
      起: flies ? startFrame : landTime,
      landTime,
      dx: Math.round(取(scatter(seed, k, 11), flyParams.lateral) * flyRatio),
      dy,
      lift: Math.max(0, Math.min(lift, Math.floor(runeBlock.心[1] + Math.min(dy, 0) - halfHeight + flyParams.topGap))),
      brightness: 0.8 + 0.2 * scatter(seed, k, 14),
    };
  });

/** 第 f 帧这枚符文中心离落点的偏移（点，没取整）；还没起飞或已经落定给 null。原版那条线：横竖都按 p 线性收拢，竖直再加 抬·(1 − p⁴) */
export const flyPos = (flight: FlyPiece, f: number): Vec2 | null => {
  if (f < flight.起 || f >= flight.landTime) return null;
  const p = (f - flight.起) / (flight.landTime - flight.起);
  return [flight.dx * (1 - p), flight.dy * (1 - p) - flight.lift * (1 - p ** 4)];
};

/** 一个字的定死编号：句号 × 64 + 第几个字（换段、换窗口都一样） */
export const glyphSeed = (lineIndex: number, j: number) => lineIndex * 64 + j;

