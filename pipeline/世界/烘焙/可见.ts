// 地形包「只保真看得见的格子」的安全项（用户 11-14 定目标，11-15 定做进管线）：封腔填实、埋格换石、邻圈、第 0 级核心边。
// 网格不变，或只少掉封死的腔壁；核心边只换裙边的贴图。格式、解码不变，渲染那边不用知道。原型、抽样实测和取舍见 docs/决策/0011-地形压缩.md「只保真看得见的格子」。
// 烘焙和转码（转码.ts 的 转码目录）都走这里：训练用的样本、写进包的区段都是变换后的。
//
// 区段是 34×34 列的窗口（核心 32×32 加一圈相邻区段的格，即邻圈），cm[c·nz + k]，c = y·34 + x，k 从下往上。
// 「整格」只看是不是整格不透明（方块表的 full，网格.ts occlusionMask 第 0 位）；树叶、玻璃、水、花草、半砖都不算。
// 区段最上一层上面当空气，最下一层下面当实心，同 网格.ts。
import fs from 'node:fs';
import path from 'node:path';
import type { SectionData, 包信息 } from '../../../engine/voxel/区段包.ts';
import type { 体素库 } from '../体素库.ts';
import { 到列优先 } from './区段编码.ts';
import { 解区段 as 解格式2区段 } from './格式2解码.ts';
import { 块文件们, 块号, 块格式, 读包模型, 读块索引, 解格式1区段 } from './读区段.ts';

export const 窗边 = 34;

/** 保真范围：游戏 x0, z0, x1, z1（两端都含）。渲染时会挖开、整平导入地形的地方，碰到的区段整块原样保留（世界声明 [[烘焙.保真]]） */
export type 保真盒 = [number, number, number, number];
/** 世界声明给的变换设置；填充 是换进去的整格方块（默认 minecraft:stone，下界没有石头要另写） */
export type 可见设置 = { 填充: string; 保真: 保真盒[] };
/** 记进 包.json 的 可见：包按它做过变换。保真 排好序，名字不记（改名字不该变包版本） */
export type 可见记录 = { 填充: string; 保真: 保真盒[] };
export const 成记录 = (s: 可见设置): 可见记录 => ({ 填充: s.填充, 保真: [...s.保真].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]) });
/** 记录 a 是不是盖住了 b 的全部保真盒（同填充） */
export const 记录盖住 = (a: 可见记录, b: 可见记录) => a.填充 === b.填充 && b.保真.every((x) => a.保真.some((y) => y.join() === x.join()));

/** 可改的区段格子：色板可以加项；满[p] = 色板第 p 项是不是整格；石 = 填充方块的色板号。宽：窗口每边几列，不写是 34（原型拼大区段时用） */
export type 格子 = { id: { L: number; i: number; j: number }; kBottom: number; nz: number; cm: Uint16Array; 色板: number[]; 满: Uint8Array; 石: number; 宽?: number };

/** 状态号 → 整格（满）、挡面掩码（罩：1 整格、2 树叶、4 水这一层，网格.ts 只拿它剔核心边的面） */
export const 状态表 = (库: 体素库, info: Pick<包信息, '状态' | '群系'>) => {
  const 值 = 库.区段包.buildPackTables(info).值, { full, leaf, layer } = 库.方块表.blockProps;
  const 满 = Uint8Array.from(info.状态, (_, s) => full[值[s]!]!);
  const 罩 = Uint8Array.from(info.状态, (_, s) => { const v = 值[s]!; return full[v]! | (leaf[v]! << 1) | (layer[v] === 3 ? 4 : 0); });
  return { 满, 罩 };
};

export const 成格子 = (d: SectionData, 状态满: Uint8Array, 填充号: number): 格子 => {
  const 色板 = Array.from(d.palette);
  let 石 = -1;
  for (let p = 1; p < 色板.length / 2; p++) if (色板[2 * p] === 填充号 && 色板[2 * p + 1] === 65535) { 石 = p; break; }
  if (石 < 0) { 石 = 色板.length / 2; 色板.push(填充号, 65535); }
  const 满 = new Uint8Array(色板.length / 2);
  for (let p = 1; p < 满.length; p++) 满[p] = 状态满[色板[2 * p]!]!;
  return { id: { L: d.L, i: d.i, j: d.j }, kBottom: d.kBottom, nz: d.nz, cm: 到列优先(d), 色板, 满, 石 };
};
export const 抄 = (g: 格子): 格子 => ({ ...g, cm: g.cm.slice() });

/** 格子 → SectionData：色板照 写区段.ts 按出现先后重排（列从小到大、列内从上往下），没用到的丢掉，空气固定第 0 项。烘出来的区段本来就是这个顺序，所以没改的格子原样回来 */
export const 成区段 = (g: 格子): SectionData => {
  const { nz, cm } = g, 列数 = 窗边 * 窗边, 新号 = new Int32Array(g.色板.length / 2).fill(-1), 色板 = [g.色板[0]!, g.色板[1]!];
  新号[0] = 0;
  const runCounts = new Uint16Array(列数), 号: number[] = [], 长: number[] = [];
  for (let c = 0; c < 列数; c++) {
    const r0 = 号.length;
    for (let k = nz - 1; k >= 0; k--) {
      const p = cm[c * nz + k]!;
      let q = 新号[p]!;
      if (q < 0) { q = 新号[p] = 色板.length / 2; 色板.push(g.色板[2 * p]!, g.色板[2 * p + 1]!); }
      if (号.length > r0 && 号[号.length - 1] === q) 长[长.length - 1]!++;
      else { 号.push(q); 长.push(1); }
    }
    runCounts[c] = 号.length - r0;
  }
  return { ...g.id, kBottom: g.kBottom, nz, palette: Uint16Array.from(色板), runCounts, paletteIndex: Uint16Array.from(号), runLengths: Uint16Array.from(长) };
};

/** 埋格换石：整格、六个邻格也都整格的换成填充方块。只动第 2～31 列（第 1、32 列是核心的边，网格给它们出裙边；第 0、33 列是邻圈），
 *  同一格在两个区段里的两份抄本始终一样。邻格都按没换之前判，换完仍是整格，先后无关。返回换了几格 */
export const 埋格换石 = (g: 格子): number => {
  const { nz, cm, 满, 石 } = g, 边 = g.宽 ?? 窗边, 行 = 边 * nz, 改: number[] = [];
  for (let y = 2; y <= 边 - 3; y++) for (let x = 2; x <= 边 - 3; x++) {
    const base = (y * 边 + x) * nz;
    for (let k = 0; k < nz - 1; k++) {
      const at = base + k, p = cm[at]!;
      if (p === 石 || !满[p] || !满[cm[at + 1]!] || (k > 0 && !满[cm[at - 1]!])) continue;
      if (!满[cm[at - nz]!] || !满[cm[at + nz]!] || !满[cm[at - 行]!] || !满[cm[at + 行]!]) continue;
      改.push(at);
    }
  }
  for (const at of 改) cm[at] = 石;
  return 改.length;
};

/** 和露天连通的非整格（空气、水、树叶、花草、半砖……）：六邻连通，不设最小口径（1 格的口也算通）。
 *  种子：最上一层的非整格；离窗口边不到 种子圈 列的非整格（窗口外不知道，当连通） */
export const 露天连通 = (g: 格子, 种子圈: number): Uint8Array => {
  const { nz, cm, 满 } = g, 边 = g.宽 ?? 窗边, 列数 = 边 * 边, 行 = 边 * nz, 开 = new Uint8Array(cm.length), 栈 = new Int32Array(cm.length);
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

/** 封腔填实：不和露天连通的非整格填成填充方块。碰到核心的边（第 1、32 列）或邻圈就当连通（跨区段不判，见 0011），所以填的都在第 2～31 列。返回填掉的格（下标） */
export const 填封闭腔 = (g: 格子): Int32Array => {
  const { cm, 满, 石 } = g, 开 = 露天连通(g, 2), 填: number[] = [];
  for (let at = 0; at < cm.length; at++) if (!满[cm[at]!] && !开[at]) 填.push(at);
  for (const at of 填) cm[at] = 石;
  return Int32Array.from(填);
};

/** 邻圈（第 0、33 列）：本段从不出它们的面，网格只拿它的挡面掩码剔核心边的面。所以六面被埋的整格换填充方块（窗口外当整格；露在外面的那层不换，
 *  和旁边核心边那一列长得像，编码上下文更准），挡面掩码是 0 的非空气（归空[p] = 1：花草、火把这类）换成空气。返回换了几格 */
export const 邻圈归一 = (g: 格子, 归空: Uint8Array): number => {
  const { nz, cm, 满, 石 } = g, 边 = g.宽 ?? 窗边, 行 = 边 * nz, 改: number[] = [];
  for (let c = 0; c < 边 * 边; c++) {
    const x = c % 边, y = (c - x) / 边;
    if (x > 0 && y > 0 && x < 边 - 1 && y < 边 - 1) continue;
    for (let k = 0; k < nz; k++) {
      const at = c * nz + k, p = cm[at]!;
      if (!满[p]) { if (p !== 0 && 归空[p]) 改.push(at); continue; }
      if (p === 石) continue;
      if (k === nz - 1 || !满[cm[at + 1]!] || (k > 0 && !满[cm[at - 1]!]) || (x > 0 && !满[cm[at - nz]!]) || (x < 边 - 1 && !满[cm[at + nz]!]) || (y > 0 && !满[cm[at - 行]!]) || (y < 边 - 1 && !满[cm[at + 行]!])) continue;
      改.push(at);
    }
  }
  for (const at of 改) cm[at] = 满[cm[at]!] ? 石 : 0;
  return 改.length;
};

/** 核心边（第 1、32 列）上六面被埋的整格换填充方块：网格只给它出朝邻圈的裙边面（邻段这一帧同级在画时不画），换了以后裙边贴图变成填充方块、并得更大。
 *  有邻 = [+x, −x, +y, −y] 那一侧同一级的区段在不在包里，不在的那一侧（包的边）不动。
 *  可挡(x, y, k, 侧)：邻段换粗一级画时，这块裙边朝着的那一格整个被粗格挡住（见 可见环境.父格挡）；不给 = 都挡（测试用）。返回换掉的格（下标） */
export const 核心边换石 = (g: 格子, 有邻: readonly boolean[], 可挡?: (x: number, y: number, k: number, 侧: number) => boolean): Int32Array => {
  const { nz, cm, 满, 石 } = g, 边 = g.宽 ?? 窗边, 行 = 边 * nz, 改: number[] = [];
  for (let y = 1; y < 边 - 1; y++) for (let x = 1; x < 边 - 1; x++) {
    if (x > 1 && x < 边 - 2 && y > 1 && y < 边 - 2) continue;
    const 侧们 = [x === 边 - 2, x === 1, y === 边 - 2, y === 1];
    if (侧们.some((在, d) => 在 && !有邻[d])) continue;
    const base = (y * 边 + x) * nz;
    for (let k = 0; k < nz - 1; k++) {
      const at = base + k, p = cm[at]!;
      if (p === 石 || !满[p] || !满[cm[at + 1]!] || (k > 0 && !满[cm[at - 1]!]) || !满[cm[at - nz]!] || !满[cm[at + nz]!] || !满[cm[at - 行]!] || !满[cm[at + 行]!]) continue;
      if (可挡 && 侧们.some((在, d) => 在 && !可挡(x, y, k, d))) continue;
      改.push(at);
    }
  }
  for (const at of 改) cm[at] = 石;
  return Int32Array.from(改);
};

export type 变换记 = { 填: Int32Array; 埋: number; 邻圈: number; 核心边: Int32Array };
/** 四项按这个顺序做（封腔填完的格算整格，再判埋没埋）；原格子不动，返回改后的和记录 */
export const 做安全项 = (g0: 格子, 罩: Uint8Array, 有邻: readonly boolean[], 可挡?: (x: number, y: number, k: number, 侧: number) => boolean) => {
  const g = 抄(g0);
  const 填 = 填封闭腔(g), 埋 = 埋格换石(g);
  const 归空 = Uint8Array.from({ length: g.色板.length / 2 }, (_, p) => (p && 罩[g.色板[2 * p]!] === 0 ? 1 : 0));
  const 邻圈 = 邻圈归一(g, 归空);
  const 核心边 = g.id.L === 0 ? 核心边换石(g, 有邻, 可挡) : new Int32Array(0);
  return { g, 记: { 填, 埋, 邻圈, 核心边 } satisfies 变换记 };
};

type 父段 = { kBottom: number; nz: number; 罩: Uint8Array };

/** 一个包（变换的源：烘焙的中性表暂存包，或要转的旧包）的变换环境：整包索引（邻段在不在）、保真区段、第 1 级区段（核心边查父格）。
 *  源可以是格式 1、2、3；读的永远是原样的格子 */
export class 可见环境 {
  readonly 满: Uint8Array;
  readonly 罩: Uint8Array;
  readonly 填充号: number;
  readonly 记录: 可见记录;
  private 有 = new Set<string>();
  private 保真 = new Set<string>();
  private 块 = new Map<string, { 文件: string; 格式: number; 索引: Uint32Array; fd?: number }>();
  private 父缓存 = new Map<string, 父段 | null>();
  private 库: 体素库;
  private dir: string;

  constructor(库: 体素库, dir: string, 设置: 可见设置) {
    this.库 = 库;
    this.dir = dir;
    const info = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as 包信息;
    ({ 满: this.满, 罩: this.罩 } = 状态表(库, info));
    this.填充号 = info.状态.indexOf(设置.填充);
    if (this.填充号 < 0) throw new Error(`包的状态表里没有填充方块 ${设置.填充}（世界声明 [烘焙] 填充 换一种这个维度有的整格方块）`);
    if (!this.满[this.填充号]) throw new Error(`填充方块 ${设置.填充} 不是整格不透明`);
    this.记录 = 成记录(设置);
    const { tileHeaderLen, sectionAtIndex } = 库.区段包;
    for (const 名 of 块文件们(dir)) {
      const 文件 = path.join(dir, 名), 头 = Buffer.alloc(tileHeaderLen), fd = fs.openSync(文件, 'r');
      try { fs.readSync(fd, 头, 0, tileHeaderLen, 0); } finally { fs.closeSync(fd); }
      const 索引 = 读块索引(库, 头), [ti, tj] = 块号(名);
      this.块.set(`${ti}.${tj}`, { 文件, 格式: 块格式(头), 索引 });
      for (let slot = 0; slot < 库.区段包.tileEntryCount; slot++) if (索引[2 * slot + 1]) { const q = sectionAtIndex(ti, tj, slot); this.有.add(`${q.L}/${q.i}/${q.j}`); }
    }
    // 保真盒碰到的区段（各级，四周多留 2 格）：游戏 (x, z) → 第 0 级的格 (x − ox, oz − 1 − z)，同 导入地形.ts 的 toSceneBox
    const [ox, , oz] = info.原点;
    for (const [x0, z0, x1, z1] of this.记录.保真) {
      const a0 = x0 - ox, a1 = x1 - ox, b0 = oz - 1 - z1, b1 = oz - 1 - z0;
      for (let L = 0; L <= 库.区段.coarsestLevel; L++) {
        const s = 2 ** L, w = 32 * s;
        for (let j = Math.floor((b0 - 2 * s) / w); j <= Math.floor((b1 + 2 * s) / w); j++)
          for (let i = Math.floor((a0 - 2 * s) / w); i <= Math.floor((a1 + 2 * s) / w); i++) this.保真.add(`${L}/${i}/${j}`);
      }
    }
  }

  有段 = (L: number, i: number, j: number) => this.有.has(`${L}/${i}/${j}`);
  在保真 = (L: number, i: number, j: number) => this.保真.has(`${L}/${i}/${j}`);
  get 保真段数() { return [...this.保真].filter((k) => this.有.has(k)).length; }

  /** 从源包取一个区段（原样） */
  取 = (L: number, i: number, j: number): SectionData | null => {
    const { ti, tj, slot } = this.库.区段包.sectionInTile({ L, i, j });
    const b = this.块.get(`${ti}.${tj}`);
    const len = b?.索引[2 * slot + 1];
    if (!b || !len) return null;
    b.fd ??= fs.openSync(b.文件, 'r');
    const raw = Buffer.alloc(len);
    if (fs.readSync(b.fd, raw, 0, len, b.索引[2 * slot]!) !== len) throw new Error(`${b.文件} 读短了`);
    const id = { L, i, j };
    return b.格式 === 1 ? 解格式1区段(raw) : b.格式 === 2 ? 解格式2区段(raw, id) : this.库.区段解码.解区段(raw, id, 读包模型(this.dir));
  };

  private 父 = (i: number, j: number): 父段 | null => {
    const k = `${i}/${j}`;
    let v = this.父缓存.get(k);
    if (v !== undefined) { this.父缓存.delete(k); this.父缓存.set(k, v); return v; }
    const d = this.取(1, i, j);
    v = null;
    if (d) {
      const cm = 到列优先(d), 罩 = new Uint8Array(cm.length);
      for (let at = 0; at < cm.length; at++) if (cm[at]) 罩[at] = this.罩[d.palette[2 * cm[at]!]!]!;
      v = { kBottom: d.kBottom, nz: d.nz, 罩 };
    }
    if (this.父缓存.size >= 256) this.父缓存.delete(this.父缓存.keys().next().value!);
    this.父缓存.set(k, v);
    return v;
  };

  /** 第 0 级区段 (i, j) 的核心边格 (x, y, k) 朝 侧 那一格的裙边：邻段换第 1 级画时，正对着的粗格整格（或树叶，粗级画成实心）就挡住了。
   *  粗格在粗段 k底 以下时粗段不出面，按网格的规矩当实心，要那一列最下面存着的一格是实心才算挡（不然从那个洞看得到，见 0011 的 507 格）；
   *  没有粗段、粗格高过粗段顶都不算挡 */
  父格挡 = (i: number, j: number, kBottom: number, x: number, y: number, k: number, 侧: number) => {
    const ax = 侧 === 0 ? 窗边 - 1 : 侧 === 1 ? 0 : x, ay = 侧 === 2 ? 窗边 - 1 : 侧 === 3 ? 0 : y;
    const X = Math.floor((32 * i + ax - 1) / 2), Y = Math.floor((32 * j + ay - 1) / 2), Z = Math.floor((kBottom + k) / 2);
    const pi = Math.floor(X / 32), pj = Math.floor(Y / 32), p = this.父(pi, pj);
    if (!p) return false;
    const k1 = Z - p.kBottom, 列 = ((Y - 32 * pj + 1) * 窗边 + X - 32 * pi + 1) * p.nz;
    if (k1 >= p.nz) return false;
    return (p.罩[列 + Math.max(0, k1)]! & 3) !== 0;
  };

  /** 一个区段的变换。保真范围里的原样；什么都没改也原样（字节不变） */
  变换 = (d: SectionData): { d: SectionData; 记: 变换记 | null; g0?: 格子; g?: 格子 } => {
    if (this.在保真(d.L, d.i, d.j)) return { d, 记: null };
    const g0 = 成格子(d, this.满, this.填充号);
    const 有邻 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => this.有段(d.L, d.i + a!, d.j + b!));
    const { g, 记 } = 做安全项(g0, this.罩, 有邻, (x, y, k, 侧) => this.父格挡(d.i, d.j, d.kBottom, x, y, k, 侧));
    if (!记.填.length && !记.埋 && !记.邻圈 && !记.核心边.length) return { d, 记, g0, g };
    return { d: 成区段(g), 记, g0, g };
  };

  关 = () => {
    for (const b of this.块.values()) if (b.fd !== undefined) { fs.closeSync(b.fd); b.fd = undefined; }
  };
}
