// 四种变换（任务见 docs/待办.md「世界」第一条），都在区段自己的 34×34 列窗口里做，状态号不透明性之外什么都不查。
// 「可动的列」默认只有 x、y ∈ [2, 31]：第 1、32 列是核心的边，网格给它们出裙边（网格.ts 的 isSkirt），连整格被埋的也出面；第 0、33 列是相邻区段的格，
// 在邻段里也是核心的边。所以这四圈一格不动，同一格在两个区段里的两份抄本也就始终一样。
import { 边, 列数, type 格子 } from './公共.ts';
const 窗边 = 边;

export type 范围 = { lo: number; hi: number }; // 可动的列：x、y ∈ [lo, hi]
export const 留裙边: 范围 = { lo: 2, hi: 边 - 3 };
/** 上界估计用：全窗口都动，窗口外的邻格当整格不透明。不保网格，只用来看放开裙边最多还能省多少 */
export const 全窗口: 范围 = { lo: 0, hi: 边 - 1 };

/** 变换 1：整格不透明、六个邻格也都整格不透明的格换石头。最下一格的下面按网格.ts 当石头，最上一格的上面是空气。返回换了几格 */
export const 埋格换石 = (g: 格子, 范: 范围 = 留裙边): number => {
  const { nz, cm, 满, 石 } = g, 边 = g.宽 ?? 窗边, 行 = 边 * nz;
  if (g.宽 && 范 === 留裙边) 范 = { lo: 2, hi: 边 - 3 };
  const 改: number[] = [];
  for (let y = 范.lo; y <= 范.hi; y++) for (let x = 范.lo; x <= 范.hi; x++) {
    const base = (y * 边 + x) * nz;
    for (let k = 0; k < nz - 1; k++) {
      const at = base + k, p = cm[at]!;
      if (p === 石 || !满[p] || !满[cm[at + 1]!] || (k > 0 && !满[cm[at - 1]!])) continue;
      if ((x > 0 && !满[cm[at - nz]!]) || (x < 边 - 1 && !满[cm[at + nz]!]) || (y > 0 && !满[cm[at - 行]!]) || (y < 边 - 1 && !满[cm[at + 行]!])) continue;
      改.push(at);
    }
  }
  for (const at of 改) cm[at] = 石; // 邻格都按没换之前判；换完仍是整格不透明，先后无关
  return 改.length;
};

/** 和露天连通的非整格（空气、水、叶子、玻璃、花草、半砖……）：六邻连通，不设最小口径。
 *  种子：最上一层的非整格（再往上是空气）；x 或 y 离窗口边不到 种子圈 列的非整格（窗口外不知道，当连通）。种子圈 0 = 只从顶上找（「确定露天」） */
export const 露天连通 = (g: 格子, 种子圈: number): Uint8Array => {
  const { nz, cm, 满 } = g, 边 = g.宽 ?? 窗边, 列数 = 边 * 边, 行 = 边 * nz, 开 = new Uint8Array(cm.length);
  const 栈 = new Int32Array(cm.length);
  let n = 0;
  const 进 = (at: number) => { if (!开[at] && !满[cm[at]!]) { 开[at] = 1; 栈[n++] = at; } };
  if (nz) for (let c = 0; c < 列数; c++) {
    const x = c % 边, y = (c - x) / 边;
    if (x < 种子圈 || y < 种子圈 || x >= 边 - 种子圈 || y >= 边 - 种子圈) for (let k = 0; k < nz; k++) 进(c * nz + k);
    else 进(c * nz + nz - 1);
  }
  while (n) {
    const at = 栈[--n]!, c = Math.floor(at / nz), k = at - c * nz, x = c % 边, y = (c - x) / 边;
    if (k > 0) 进(at - 1);
    if (k < nz - 1) 进(at + 1);
    if (x > 0) 进(at - nz);
    if (x < 边 - 1) 进(at + nz);
    if (y > 0) 进(at - 行);
    if (y < 边 - 1) 进(at + 行);
  }
  return 开;
};

/** 变换 3：不和露天连通的非整格填成石头。碰到核心的边（第 1、32 列）或相邻那圈就当连通，所以填的都在 [2, 31] 里。返回填掉的格（下标） */
export const 填封闭腔 = (g: 格子): Int32Array => {
  const { cm, 满, 石 } = g, 开 = 露天连通(g, 2), 填: number[] = [];
  for (let at = 0; at < cm.length; at++) if (!满[cm[at]!] && !开[at]) 填.push(at);
  for (const at of 填) cm[at] = 石;
  return Int32Array.from(填);
};

/** 每列的地表（格号，= 最高的整格不透明格 + 1；一列没有整格的是 0），再照 烘焙/地表.ts 的 浮空下地表 把横着连到露天的高空当拉到空当底。
 *  空当要多高：第 0 级 16 格（同烘焙）；粗级烘焙是在第 0 级算完取最小，这里只有本级格子，按 ⌈16 米 / 格长⌉ 近似 */
export const 列地表 = (g: 格子): Int16Array => {
  const { nz, cm, 满 } = g, 地表 = new Int16Array(列数);
  for (let c = 0; c < 列数; c++) { let k = nz - 1; while (k >= 0 && !满[cm[c * nz + k]!]) k--; 地表[c] = k + 1; }
  const 长空当 = Math.max(1, Math.ceil(16 / 2 ** g.id.L));
  const 当列: number[] = [], 当底: number[] = [], 当顶: number[] = [];
  const 按列 = new Map<number, number[]>();
  for (let c = 0; c < 列数; c++) {
    let 顶 = -1;
    for (let k = 地表[c]! - 2; k >= -1; k--) {
      const 实 = k < 0 || 满[cm[c * nz + k]!] === 1;
      if (!实 && 顶 < 0) 顶 = k;
      if (实 && 顶 >= 0) {
        if (顶 - k >= 长空当) { const a = 按列.get(c) ?? []; 按列.set(c, a); a.push(当列.length); 当列.push(c); 当底.push(k + 1); 当顶.push(顶); }
        顶 = -1;
      }
    }
  }
  if (!当列.length) return 地表;
  const 邻 = (c: number) => [c % 边 > 0 ? c - 1 : -1, c % 边 < 边 - 1 ? c + 1 : -1, c >= 边 ? c - 边 : -1, c < 列数 - 边 ? c + 边 : -1];
  const 通 = new Uint8Array(当列.length), 队: number[] = [];
  for (let i = 0; i < 当列.length; i++) if (邻(当列[i]!).some((n) => n >= 0 && 地表[n]! <= 当顶[i]!)) { 通[i] = 1; 队.push(i); }
  while (队.length) {
    const i = 队.pop()!;
    for (const n of 邻(当列[i]!)) for (const j of n >= 0 ? (按列.get(n) ?? []) : []) {
      if (通[j] || 当底[j]! > 当顶[i]! || 当底[i]! > 当顶[j]!) continue;
      通[j] = 1;
      队.push(j);
    }
  }
  const 出 = 地表.slice();
  for (let i = 0; i < 当列.length; i++) if (通[i]) 出[当列[i]!] = Math.min(出[当列[i]!]!, 当底[i]!);
  return 出;
};

/** 变换 2（照任务原样，会动看得见的格）：每列只保真到「自己和周围 8 列最低的地表 − 4 米」，再往下到 k底 全换石头（空气、水也换）。返回换了几格 */
export const 按列定底 = (g: 格子, 范: 范围 = 留裙边): number => {
  const { nz, cm, 石 } = g, 地表 = 列地表(g), 减 = Math.ceil(4 / 2 ** g.id.L);
  let n = 0;
  for (let y = Math.max(1, 范.lo); y <= Math.min(边 - 2, 范.hi); y++) for (let x = Math.max(1, 范.lo); x <= Math.min(边 - 2, 范.hi); x++) {
    let 低 = nz;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) 低 = Math.min(低, 地表[(y + dy) * 边 + x + dx]!);
    const base = (y * 边 + x) * nz;
    for (let k = Math.min(nz, 低 - 减) - 1; k >= 0; k--) if (cm[base + k] !== 石) { cm[base + k] = 石; n++; }
  }
  return n;
};
