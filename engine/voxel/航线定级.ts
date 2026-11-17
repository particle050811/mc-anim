// 航线定级：区段这一帧用哪一级，事先按航线定，不按当前镜头临时定。登记航线时给了定级参数的镜头用（世界.tsx 的 `RouteLod`），试看 `航线定级` 可逐项盖。
// 用户 11-17：「一个区块渲染的精度一开始就根据飞行路线决定好，而不是在飞行过程中临时决定，这样就不会出现飞行过程中区块跳变」。
// 往后看（lookSec）：门槛还没到的区段，只要往后 T 秒里哪一刻会按门槛细分，现在就细分（四叉树上各时刻「要细分的块」的并集）：变细提前到远处做，画面上小。
// 留细（hold）：细分过的区段只要一直在视野里就不变粗，出了视野才放回去。
// 是帧号的纯函数（出片多帧并行、乱序渲）：往后各时刻取在航线秒的固定格点上（每秒 gridHz 个，2 的幂，格点的秒数是精确的二进制小数），
// 格点上的机位由航线函数按绝对的航线秒算，所以「格点 m 要细分哪些块」和从哪一帧问起无关；这里只把算过的格点记下来（记忆化），不记帧与帧之间的状态。
// 留细要回看：从这一截的第一个格点起按格点递推 H(m) = 往后看的并集(m) ∪ { H(m−1) 里第 m 格还在视野里的 }，跳着渲时从截头补算，和连着渲同一个结果。
// 这一帧自己的镜头不在格点上：照常按门槛算，再并上格点的（`routeDecide`，可带下限）。纯模块（不引 three、react），世界.tsx 接。
import { coarsestLevel, pickSections, sectionCells, type PickSectionsParams, type SectionId } from './区段.ts';

/** 一个时刻的视野：镜头位置、每像素张角、区段的水平范围在不在视野里（同 pickSections 的同名参数） */
export type RouteView = Pick<PickSectionsParams, 'camPos' | 'pixelAngle' | 'inView'>;

export type RouteTableOptions = {
  /** 往后看几秒；Infinity = 看到这一截末尾 */
  lookSec: number;
  hold: boolean;
  /** 每秒几个格点，要是 2 的幂（格点的秒数才是精确的二进制小数） */
  gridHz: number;
  splitPixels: number;
  farM: number;
  featureTop: PickSectionsParams['featureTop'];
  /** 航线秒 → 那一刻的视野；航线算不出返回 null */
  viewAt: (sec: number) => RouteView | null;
};

// 区段 → 一个数（当 Map 的键比字符串快）：i、j 各留 21 位，级别 3 位，合起来不到 2^45
const keyOffset = 2 ** 20;
const keySpan = 2 ** 21;
export const nodeKey = (level: number, i: number, j: number) => ((i + keyOffset) * keySpan + (j + keyOffset)) * 8 + level;
const nodeOfKey = (key: number): SectionId => {
  const level = key % 8;
  const rest = (key - level) / 8;
  const j = rest % keySpan;
  return { L: level, i: (rest - j) / keySpan - keyOffset, j: j - keyOffset };
};

// 格点区间表：[起, 止, 起, 止, …]，升序、互不相邻。格点只会接在两头（每个格点只算一次）
const addToRuns = (runs: number[], m: number) => {
  const last = runs.length - 1;
  if (last < 0 || m > runs[last]! + 1) runs.push(m, m);
  else if (m === runs[last]! + 1) runs[last] = m;
  else if (m === runs[0]! - 1) runs[0] = m;
  else if (m < runs[0]! - 1) runs.unshift(m, m);
};
const runsOverlap = (runs: number[] | undefined, lo: number, hi: number) => {
  if (!runs || lo > hi) return false;
  for (let p = runs.length - 2; p >= 0; p -= 2) if (runs[p]! <= hi) return runs[p + 1]! >= lo;
  return false;
};

// 截头截尾往里收这么多秒再取格点：截的起止是「这一帧的航线秒 ± 离截头截尾几秒」，各帧算出来差在浮点末位，
// 不收的话正好落在截头截尾上的格点这一帧算、那一帧不算。0.0037 不是 1/64、1/60、毫秒的整数倍，收完的边界不会再贴着格点
const cutEdgeSec = 0.0037;

export class RouteTable {
  private readonly o: RouteTableOptions;
  private readonly lookCount: number; // 往后看几个格点
  private cutLo = 0;
  private cutHi = -1;
  private doneLo = 0; // 算过的格点 [doneLo, doneHi]，连续的一段
  private doneHi = -1;
  private readonly splitRuns = new Map<number, number[]>(); // 区段 → 按门槛要细分的格点
  private readonly splitsAt = new Map<number, number[]>(); // 留细用：格点 → 那一格细分的区段（递推用过就删）
  private readonly heldRuns = new Map<number, number[]>(); // 区段 → 留着细分的格点
  private readonly held = new Set<number>(); // H(heldAt)
  private heldAt: number | null = null;
  private readonly poses = new Map<number, number[]>(); // 格点 → 算它时的镜头位置和张角（核对航线是不是航线秒的函数）
  /** 算过几个格点（统计用） */
  sampleCount = 0;
  /** 算表花的毫秒：格点取样、留细递推、核对机位（统计用；每帧查表的那一份不在里面） */
  spentMs = 0;

  constructor(o: RouteTableOptions) {
    if (!(Number.isInteger(Math.log2(o.gridHz)) && o.gridHz >= 1)) throw new Error(`航线定级：每秒格点数要是 2 的幂，拿到 ${o.gridHz}`);
    this.o = o;
    this.lookCount = Number.isFinite(o.lookSec) ? Math.floor(o.lookSec * o.gridHz) : Infinity;
  }

  private reset(cutLo: number, cutHi: number) {
    this.cutLo = cutLo;
    this.cutHi = cutHi;
    this.doneLo = 0;
    this.doneHi = -1;
    this.splitRuns.clear();
    this.splitsAt.clear();
    this.heldRuns.clear();
    this.held.clear();
    this.heldAt = null;
    this.poses.clear();
  }

  private sample(m: number) {
    const view = this.o.viewAt(m / this.o.gridHz);
    const splits: number[] = [];
    if (view) {
      pickSections({
        camPos: view.camPos,
        pixelAngle: view.pixelAngle,
        splitPixels: this.o.splitPixels,
        farM: this.o.farM,
        inView: view.inView,
        featureTop: this.o.featureTop,
        decide: (level, i, j, wantsSplit) => {
          if (wantsSplit) splits.push(nodeKey(level, i, j));
          return wantsSplit;
        },
      });
      this.poses.set(m, [view.camPos[0]!, view.camPos[1]!, view.camPos[2]!, view.pixelAngle]);
    }
    for (const key of splits) {
      let runs = this.splitRuns.get(key);
      if (!runs) this.splitRuns.set(key, (runs = []));
      addToRuns(runs, m);
    }
    if (this.o.hold) this.splitsAt.set(m, splits);
    this.sampleCount++;
  }

  private ensure(lo: number, hi: number) {
    if (lo > hi) return;
    if (this.doneHi < this.doneLo) {
      for (let m = lo; m <= hi; m++) this.sample(m);
      this.doneLo = lo;
      this.doneHi = hi;
      return;
    }
    // 和算过的那一段中间隔着的也补上（留着一整段连续的，区间表才只在两头接）
    for (let m = this.doneHi + 1; m <= hi; m++) this.sample(m);
    this.doneHi = Math.max(this.doneHi, hi);
    for (let m = this.doneLo - 1; m >= lo; m--) this.sample(m);
    this.doneLo = Math.min(this.doneLo, lo);
  }

  private nodeInView(key: number, view: RouteView) {
    const q = nodeOfKey(key);
    const sizeM = sectionCells * 2 ** q.L;
    const x0 = q.i * sizeM;
    const y0 = q.j * sizeM;
    if (!view.inView(x0, y0, x0 + sizeM, y0 + sizeM)) return false;
    const [cx, cy] = view.camPos as [number, number];
    return Math.hypot(Math.max(x0 - cx, 0, cx - x0 - sizeM), Math.max(y0 - cy, 0, cy - y0 - sizeM)) <= this.o.farM;
  }

  // 留细递推到第 to 格（to ≥ cutLo）；之前的格点查 heldRuns
  private advanceHeld(to: number) {
    const windowTop = (m: number) => Math.min(m + this.lookCount, this.cutHi);
    const record = (m: number) => {
      for (const key of this.held) {
        let runs = this.heldRuns.get(key);
        if (!runs) this.heldRuns.set(key, (runs = []));
        addToRuns(runs, m);
      }
    };
    if (this.heldAt === null) {
      const m = this.cutLo;
      for (let k = m; k <= windowTop(m); k++) {
        for (const key of this.splitsAt.get(k)!) this.held.add(key);
        this.splitsAt.delete(k);
      }
      record(m);
      this.heldAt = m;
    }
    for (let m = this.heldAt + 1; m <= to; m++) {
      const top = windowTop(m);
      const view = this.o.viewAt(m / this.o.gridHz);
      for (const key of this.held) {
        if (runsOverlap(this.splitRuns.get(key), m, top)) continue;
        if (view && this.nodeInView(key, view)) continue;
        this.held.delete(key);
      }
      // 新进来的只可能是窗口远端新露出的那一格细分的（别的格点上一步就在窗口里）
      if (m + this.lookCount <= this.cutHi) {
        for (const key of this.splitsAt.get(m + this.lookCount)!) this.held.add(key);
        this.splitsAt.delete(m + this.lookCount);
      }
      record(m);
      this.heldAt = m;
    }
  }

  /**
   * 航线秒 sec 的那一帧：返回「这一块要不要提前细分」（门槛之外另加的；这一帧自己按门槛的那一份调用方照常算）。
   * cutStartSec、cutEndSec：这一截第一帧、最后一帧的航线秒（往后不看过截尾，留细从截头递推）
   */
  forFrame(sec: number, cutStartSec: number, cutEndSec: number): (level: number, i: number, j: number) => boolean {
    const startedAt = performance.now();
    const g = this.o.gridHz;
    const cutLo = Math.ceil((cutStartSec + cutEdgeSec) * g);
    const cutHi = Math.floor((cutEndSec - cutEdgeSec) * g);
    if (cutLo !== this.cutLo || cutHi !== this.cutHi) this.reset(cutLo, cutHi);
    const lo = Math.max(Math.floor(sec * g) + 1, cutLo);
    const hi = Math.min(Number.isFinite(this.o.lookSec) ? Math.floor((sec + this.o.lookSec) * g) : cutHi, cutHi);
    // 抽一个记过的格点重算机位：同一航线秒两次算出来不一样，说明航线函数还看了别的（这一帧的状态），表就不能跨帧用
    const probe = lo <= hi && lo >= this.doneLo && lo <= this.doneHi ? lo : null;
    if (probe !== null) {
      const was = this.poses.get(probe);
      const now = this.o.viewAt(probe / g);
      const same = was && now ? was[0] === now.camPos[0] && was[1] === now.camPos[1] && was[2] === now.camPos[2] && was[3] === now.pixelAngle : !was && !now;
      if (!same) throw new Error(`航线定级：航线秒 ${probe / g} 的机位两次算出来不一样，航线函数不是航线秒的纯函数`);
    }
    const heldAt = this.o.hold ? Math.min(Math.floor(sec * g), cutHi) : -Infinity;
    if (this.o.hold && cutLo <= cutHi) {
      this.ensure(cutLo, Math.max(hi, Math.min(Math.max(heldAt, cutLo) + this.lookCount, cutHi)));
      if (heldAt >= cutLo) this.advanceHeld(heldAt);
    } else this.ensure(lo, hi);
    this.spentMs += performance.now() - startedAt;
    const { splitRuns, heldRuns } = this;
    const useHeld = this.o.hold && heldAt >= cutLo;
    return (level, i, j) => {
      const key = nodeKey(level, i, j);
      return runsOverlap(splitRuns.get(key), lo, hi) || (useHeld && runsOverlap(heldRuns.get(key), heldAt, heldAt));
    };
  }
}

/**
 * 这一帧的细分决定（给 pickSections 的 decide）：照门槛，或者航线表说要提前细分、而且细出来的一格这一帧不小于 floorPixels（和 pixelAngle 同一种像素）。
 * 下限只看这一帧的镜头，还是帧号的纯函数。没有下限时往后看 T 秒会把最细一级沿航线铺出 速度 × T 那么远（一格不到一个像素），面数跟着 T 涨；
 * 有了下限，切级发生在「粗的一格 = 2 × 下限」像素上，面数封顶在「门槛 = 下限、只铺航线两侧会用到的那一条」
 */
export const routeDecide =
  (force: (level: number, i: number, j: number) => boolean, floorPixels: number): NonNullable<PickSectionsParams['decide']> =>
  (level, i, j, wantsSplit, finerPixels) =>
    wantsSplit || (finerPixels >= floorPixels && force(level, i, j));

/** 一处切级：coarse 是切级前后较粗的那一块（变细 = 它换成了更细的几块，变粗 = 更细的几块合成了它） */
export type LevelSwitch = { coarse: SectionId; kind: 'refine' | 'coarsen' };

/** 前后两帧挑出来的区段比一遍，同一块地换了级的列出来（新进视野、出视野的不算）。按较粗的那一块记，一块记一次 */
export const diffPicks = (prev: readonly SectionId[], cur: readonly SectionId[]): LevelSwitch[] => {
  const keyOf = (q: SectionId) => nodeKey(q.L, q.i, q.j);
  const prevKeys = new Set(prev.map(keyOf));
  const curKeys = new Set(cur.map(keyOf));
  const found = new Map<number, LevelSwitch>();
  const ancestorIn = (q: SectionId, keys: Set<number>): SectionId | null => {
    let { L, i, j } = q;
    while (L < coarsestLevel) {
      L++;
      i = Math.floor(i / 2);
      j = Math.floor(j / 2);
      if (keys.has(nodeKey(L, i, j))) return { L, i, j };
    }
    return null;
  };
  for (const q of cur) {
    if (prevKeys.has(keyOf(q))) continue;
    const a = ancestorIn(q, prevKeys);
    if (a) found.set(keyOf(a), { coarse: a, kind: 'refine' });
  }
  for (const q of prev) {
    if (curKeys.has(keyOf(q))) continue;
    const a = ancestorIn(q, curKeys);
    if (a) found.set(keyOf(a), { coarse: a, kind: 'coarsen' });
  }
  return [...found.values()];
};
