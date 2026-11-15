// 多圈聚晶轮盘的分圈和开合：给 N 个法术算几圈、每圈几格，和每圈在打开后第几刻的半径、转角。纯模块。
// 多圈是本片原创（用户 11-09 定「原版玩家法术轮盘只有一圈，我想改成多圈以容纳所有法术」），原版和启示录都只有一圈。
// 最里一圈就是原版那一圈（内 30、外 60 GUI 像素，数见 库/界面/径向轮盘数.ts）；往外每圈再加一个环宽。
// 每圈格数的上限：图标沿图标圆的间距不小于原版一圈放 20 格时的间距（2π × 45 / 20 ≈ 14.1 GUI 像素；图标 16 像素，原版 20 格时相邻图标本来就叠 2 像素）。
import { radialWheelConst } from '@库/界面/径向轮盘数.ts';

export type SplitMode = '按周长' | '均分' | '填满内圈';

export type RingShape = {
  /** 最里一圈的内半径，默认原版的 30 */
  fullInnerRadius: number;
  /** 每圈的宽，默认原版的 30（外 60 − 内 30） */
  ringWidth: number;
  /** 间距基准：原版一圈放这么多格时的图标间距算最小间距，默认 20 */
  baseCellCount: number;
};

export const defaultRingShape: RingShape = { fullInnerRadius: radialWheelConst.fullInnerRadius, ringWidth: radialWheelConst.fullInnerRadius * (radialWheelConst.outerInnerRatio - 1), baseCellCount: 20 };

/** 第 k 圈（0 起）张开后的内、外半径和图标所在的半径 */
export const ringRadius = (k: number, ringShape: RingShape = defaultRingShape) => {
  const innerRadius = ringShape.fullInnerRadius + ringShape.ringWidth * k;
  return { 内: innerRadius, outerRadius: innerRadius + ringShape.ringWidth, iconRadius: innerRadius + ringShape.ringWidth / 2 };
};

/** 第 k 圈最多几格：格数 ÷ 图标半径 不超过原版基准（基准格数 ÷ 45） */
export const ringCapacity = (k: number, ringShape: RingShape = defaultRingShape) => Math.floor((ringShape.baseCellCount * ringRadius(k, ringShape).iconRadius) / ringRadius(0, ringShape).iconRadius + 1e-9);

/** 装得下 N 格的最少圈数 */
export const minRingCount = (N: number, ringShape: RingShape = defaultRingShape) => {
  let ringCount = 0;
  for (let remain = N; remain > 0; ringCount++) remain -= ringCapacity(ringCount, ringShape);
  return Math.max(1, ringCount);
};

/** 每圈格数（由里向外），加起来正好 N，每圈不超过容量。
 *  按周长：各圈按容量的比例分，图标间距各圈差不多；均分：各圈格数尽量一样，超过容量的往外挪；填满内圈：从里往外装满为止。
 *  圈数不给就取装得下的最少圈数；给的圈数装不下就报错 */
export const splitRings = (N: number, options: { ringCount?: number; splitMode?: SplitMode; ringShape?: RingShape } = {}): number[] => {
  const ringShape = options.ringShape ?? defaultRingShape;
  const ringCount = options.ringCount ?? minRingCount(N, ringShape);
  const ringCapacities = Array.from({ length: ringCount }, (_, k) => ringCapacity(k, ringShape));
  const totalCapacity = ringCapacities.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(N) || N < 0) throw new Error(`分圈：格数要是非负整数，给的是 ${N}`);
  if (N > totalCapacity) throw new Error(`分圈：${ringCount} 圈最多 ${totalCapacity} 格，装不下 ${N} 格`);
  const splitMode = options.splitMode ?? '按周长';
  if (splitMode === '填满内圈') {
    let remain = N;
    return ringCapacities.map((c) => {
      const n = Math.min(c, remain);
      remain -= n;
      return n;
    });
  }
  // 按权重分，超过容量的那圈定在容量上，剩下的在其余圈里重分；最后按小数部分从大到小补齐零头（并列时里圈优先）
  const weights = splitMode === '均分' ? ringCapacities.map(() => 1) : ringCapacities;
  const allocated = ringCapacities.map(() => -1);
  let remain = N;
  for (;;) {
    const freeSlots = allocated.flatMap((n, k) => (n < 0 ? [k] : []));
    const weightSum = freeSlots.reduce((a, k) => a + weights[k]!, 0);
    const saturated = freeSlots.filter((k) => (remain * weights[k]!) / weightSum > ringCapacities[k]!);
    if (saturated.length === 0) {
      const shares = freeSlots.map((k) => ({ k, 值: (remain * weights[k]!) / weightSum }));
      for (const { k, 值: value } of shares) allocated[k] = Math.floor(value + 1e-9);
      let remainder = remain - shares.reduce((a, { k }) => a + allocated[k]!, 0);
      const ranked = [...shares].sort((a, b) => b.值 - Math.floor(b.值 + 1e-9) - (a.值 - Math.floor(a.值 + 1e-9)) || a.k - b.k);
      for (let i = 0; remainder > 0; i = (i + 1) % ranked.length) {
        const k = ranked[i]!.k;
        if (allocated[k]! < ringCapacities[k]!) {
          allocated[k]!++;
          remainder--;
        }
      }
      return allocated;
    }
    for (const k of saturated) {
      allocated[k] = ringCapacities[k]!;
      remain -= ringCapacities[k]!;
    }
  }
};

/** 把排好序的 N 项按每圈格数切开：返回每项在第几圈第几格，不重不漏 */
export const placeCells = (cellsPerRing: readonly number[]): { ring: number; 格: number }[] => cellsPerRing.flatMap((n, ring) => Array.from({ length: n }, (_, ringCell) => ({ ring, 格: ringCell })));

export type OpenClose = {
  /** 每圈弹开用几刻，默认原版的 2.5 */
  ticksPerRing: number;
  /** 相邻两圈起弹相隔几刻，默认 2.5（里一圈弹完外一圈才起）；0 = 各圈一起弹 */
  ringGapTick: number;
  /** 每圈转多快（度每秒），0 = 不转；原版不转 */
  rotSpeed: number;
  /** 相邻圈反着转 */
  reverse: boolean;
  /** 转角从第几刻算起（加在 刻 上，只管转、不管弹开）；不给 = 0。第 2 幕重排后张盘时刻挪了，靠它让第 4、5 幕盘转到的角度和原来一样 */
  spinStartTick?: number;
};

export const defaultOpenClose: OpenClose = { ticksPerRing: radialWheelConst.openCloseTicks, ringGapTick: radialWheelConst.openCloseTicks, rotSpeed: 3, reverse: true };

/** 全部圈弹完要几刻 */
export const openDoneTick = (ringCount: number, ringOpen: OpenClose = defaultOpenClose) => (ringCount - 1) * ringOpen.ringGapTick + ringOpen.ticksPerRing;

export type RingState = {
  进度: number;
  /** 这一圈还在弹：只画带子，不画图标（照原版 isReady() 才画图标） */
  animating: boolean;
  内: number;
  outerRadius: number;
  iconRadius: number;
  /** 这一圈整体转了多少弧度（正 = 顺时针） */
  angleRad: number;
};

/** 第 k 圈在打开后第几刻的状态；还没轮到它返回 null。
 *  最里一圈照原版从圆心放大（内 = max(0.1, 内半径 × 进度)，外 = 内 × (内半径 + 环宽) ÷ 内半径，默认圈形下就是 GenericRadialMenu 的 radiusIn、radiusOut = radiusIn × 2）；
 *  外面的圈内沿不动、外沿从内沿长到位（内 = 张开后的内半径，外 = 内 + 环宽 × 进度），进度线性，同原版。 */
export const RingState = (k: number, tick: number, ringShape: RingShape = defaultRingShape, ringOpen: OpenClose = defaultOpenClose): RingState | null => {
  const ringTick = tick - k * ringOpen.ringGapTick;
  if (ringTick < 0) return null;
  const progress = Math.min(1, ringTick / ringOpen.ticksPerRing);
  const animating = progress < 1;
  const fullRing = ringRadius(k, ringShape);
  const innerRadius = k === 0 ? (animating ? Math.max(0.1, ringShape.fullInnerRadius * progress) : ringShape.fullInnerRadius) : fullRing.内;
  const outerRadius = k === 0 ? (innerRadius * (ringShape.fullInnerRadius + ringShape.ringWidth)) / ringShape.fullInnerRadius : innerRadius + ringShape.ringWidth * progress;
  return { 进度: progress, animating, 内: innerRadius, outerRadius, iconRadius: (innerRadius + outerRadius) / 2, angleRad: ringRotation(k, tick, ringOpen) };
};

/** 第 k 圈在打开后第几刻整体转了多少弧度（正 = 顺时针）；还没弹到这一圈也照算 */
export const ringRotation = (k: number, tick: number, ringOpen: OpenClose = defaultOpenClose) => ((ringOpen.reverse && k % 2 === 1 ? -1 : 1) * ringOpen.rotSpeed * Math.PI * (Math.max(0, tick) + (ringOpen.spinStartTick ?? 0))) / 20 / 180;

/** 盘心移出（原创，第 2 幕张盘；用户 11-11「现在是轮盘张开的时候 聚晶突然出现 / 应该是一开始都是从中心点蜷缩的 重叠的 移到正确的位置上」）：
 *  原版 GenericRadialMenu 弹开的 2.5 刻里只画带子，isReady() 了图标一下全冒出来（多圈轮盘 默认照这个）。
 *  移出：一开盘所有图标缩成一小团叠在圆心，各自沿半径往外走、边走边放大、带一点旋，那一圈弹完（第 k × 圈间隔刻 + 每圈刻 刻）正好落到格上、原大、旋转补完；
 *  走法缓起缓停（smoothstep），各圈同时起步、外圈走得久，三圈的图标差不多一个速度往外散。起缩放、卷是 Agent 取的，用户没看过 */
export type MoveOut = {
  /** 刚开盘时图标是原大的几倍 */
  startScale: number;
  /** 刚开盘时比落定的格多转几度（顺时针为正），走的路上转回去 */
  roll: number;
};

export const defaultMoveOut: MoveOut = { startScale: 0.25, roll: -60 };

/** 第 k 圈的图标在打开后第 刻 刻走到哪：比例 = 离圆心是落定半径的几成；缩放；卷 = 多转的弧度。那一圈弹完以后返回 null（照常画） */
export const moveOutState = (k: number, tick: number, ringOpen: OpenClose = defaultOpenClose, moveOut: MoveOut = defaultMoveOut): { ratio: number; 缩放: number; roll: number } | null => {
  const endTick = k * ringOpen.ringGapTick + ringOpen.ticksPerRing;
  if (tick >= endTick) return null;
  const p = Math.max(0, tick) / endTick;
  const e = p * p * (3 - 2 * p);
  return { ratio: e, 缩放: moveOut.startScale + (1 - moveOut.startScale) * e, roll: (moveOut.roll * (1 - e) * Math.PI) / 180 };
};

/** 收盘（原创，第 5 幕）：开始收后第 收刻 刻，照张开倒着走：最外圈先缩回、最里一圈最后缩回圆心（等效于张开到第「开完刻 − 收刻」刻）；
 *  转角照 刻 接着转，不跟着倒放（倒放的话各圈会一下转回张开时的角度）。收完返回 null */
export const retractRingState = (k: number, tick: number, closeTick: number, ringCount: number, ringShape: RingShape = defaultRingShape, ringOpen: OpenClose = defaultOpenClose): RingState | null => {
  const ringState = RingState(k, openDoneTick(ringCount, ringOpen) - Math.max(0, closeTick), ringShape, ringOpen);
  return ringState && { ...ringState, angleRad: RingState(k, tick, ringShape, ringOpen)?.angleRad ?? ringState.angleRad };
};

/** 外半径 R（GUI 像素）的轮盘放进高 H 的画面、上下各留 留边（画面像素），GUI 缩放最大取多少。
 *  步 是缩放的最小单位：取 1 ÷ 出片倍数（1280×720 出 4K 是 1/3），得出的缩放 × 出片倍数是整数，图标每个贴图像素一样大 */
export const fitScale = (R: number, H: number, margin: number, minStep: number, limit = Infinity) => Math.max(minStep, Math.min(limit, Math.floor((H / 2 - margin) / R / minStep + 1e-9) * minStep));
