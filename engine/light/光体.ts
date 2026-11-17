// 光体：发光方块照亮周围（用户 11-17 定「用光体更加真实」，又定光照物理一些：「肯定是圆形的光啊，而不是这个方块格子的光」）。纯函数，光体工人（光体工人.ts）里跑，测试直接调。
// 做法：发光方块露在空气里的面是面光源（熔岩海只有顶面露着，朝上发光；火、灯笼四面露着，往四周发光），按大小分级聚成团（1、2、4……64 米），
// 镜头四周按级读成几层 3D 格子（`cascades`，粗的在外、细的在里），每个不挡光的格子当一个探针，在显卡上（光体组件.tsx）对附近的团逐个累加
// 「发光 / 距离²」，再往团心步进占用格子判遮挡（被方块挡住就是影子）。所以光是圆的、按距离平方衰减、成片的光源亮度叠加。
// 这里出：每层的占用格（挡光 255），每层探针要用的团表（团的位置、各向同性发光、朝向发光、影响半径）和按砖（8 × 8 × 8 格）分好的团号。
// 团的分级：探针离团 d 米时用大小约 d / 1.4 米的团，相邻两级按 log₂ 距离线性过渡（每一处的光在各级里的权重加起来是 1，换级处没有台阶）；
// 最细一级（这一层自己的格子）管更近的，最粗一级（64 米）管更远的。
import { blockNames, blockProps, voxelCount } from '../voxel/真实方块表.ts';
import { sectionCells } from '../voxel/区段.ts';
import type { VoxelGrid } from '../voxel/生成.ts';

export type LightVolumeParams = {
  /** 照亮 = 方块原色 × 光 × 强 */
  strength: number;
  /** 软封顶：亮度 x 画成 x / (1 + x / knee)，熔岩海这类成片光源不过曝 */
  knee: number;
  /** 光小于它就不算（定每团的影响半径 = √(发光 / minLight)），越小照得越远、越慢 */
  minLight: number;
};

/** 一层：一格 2^L 米；水平窗口以镜头为中心按 snapM 米取整，往两边各 halfM 米；竖直是整个高度范围。从粗到细排 */
export type Cascade = { L: number; snapM: number; halfM: number };
// 细的一层取整步长小于粗一层的格子差：窗口一定套在粗一层里面、离边至少 (粗.halfM − 粗.snapM/2) − (细.halfM + 细.snapM/2) 米
export const cascades: readonly Cascade[] = [
  { L: 2, snapM: 64, halfM: 512 },
  { L: 1, snapM: 32, halfM: 176 },
  { L: 0, snapM: 16, halfM: 56 },
];
/** 团的最粗一级（64 米） */
export const KMAX = 6;
/** 探针离团 d 米时用的级：u = log₂(d / LEVEL_D)，第 k 级在 u ∈ (k − 1, k + 1) 里按帽子函数取权（着色器里同一个数） */
export const LEVEL_D = 1.4;
/** 一块砖几格（每边）：探针按砖取团表 */
export const BRICK = 8;

/** 一层的窗口（场景坐标，米）：最小角 x0 y0 z0，格数 W H D */
export type LightWindow = { L: number; x0: number; y0: number; z0: number; W: number; H: number; D: number };
export const windowKey = (w: LightWindow) => `${w.L}:${w.x0},${w.y0},${w.z0}:${w.W}x${w.H}x${w.D}`;
export const cellOf = (w: LightWindow) => 2 ** w.L;

/** 镜头在 cam（场景坐标）时各层的窗口；heightRange 是场景 z 的范围 */
export const lightWindows = (cam: readonly number[], heightRange: readonly [number, number], layers: readonly Cascade[] = cascades): LightWindow[] =>
  layers.map((c) => {
    const cell = 2 ** c.L;
    const cx = Math.round(cam[0]! / c.snapM) * c.snapM, cy = Math.round(cam[1]! / c.snapM) * c.snapM;
    const z0 = Math.floor(heightRange[0] / cell) * cell;
    return { L: c.L, x0: cx - c.halfM, y0: cy - c.halfM, z0, W: (2 * c.halfM) / cell, H: (2 * c.halfM) / cell, D: Math.ceil((heightRange[1] - z0) / cell) };
  });

/** 窗口碰到的区段 */
export const windowSections = (w: LightWindow) => {
  const secM = sectionCells * cellOf(w);
  const out: { L: number; i: number; j: number }[] = [];
  for (let j = Math.floor(w.y0 / secM); j <= Math.floor((w.y0 + w.H * cellOf(w) - 1) / secM); j++)
    for (let i = Math.floor(w.x0 / secM); i <= Math.floor((w.x0 + w.W * cellOf(w) - 1) / secM); i++) out.push({ L: w.L, i, j });
  return out;
};

// 光色（线性）：熔岩、岩浆块偏橙红，火、灯偏橙黄，灵魂火偏青，萤石、蛙明灯、海晶灯偏暖白，菌光体偏橙
export const glowColor = (name: string): [number, number, number] => {
  if (name.includes('soul')) return [0.35, 0.8, 1];
  if (name.includes('lava') || name.includes('magma')) return [1, 0.42, 0.12];
  if (name.includes('glowstone') || name.includes('froglight') || name.includes('sea_lantern')) return [1, 0.82, 0.5];
  if (name.includes('shroomlight')) return [1, 0.6, 0.3];
  return [1, 0.62, 0.28];
};

// 每格一个码：0 空气（不挡光），1 挡光，2 起是发光（光色表的下标 + 2），整格不透明的发光方块（萤石、菌光体、岩浆块）再加 128。
// 光色表：体素地形用 `emitColors`（方块发光表 × 光色，engine/voxel/方块发光.ts），方块网格自带一份（光体网格.ts）
export const CODE_AIR = 0;
export const CODE_OPAQUE = 1;
export const EMIT_OPAQUE = 128;
export const isBlocking = (code: number) => code === CODE_OPAQUE || code >= EMIT_OPAQUE;
const emitIndex = new Map<string, number>();
export const emitColors: [number, number, number][] = [];
export const cellCode = new Uint8Array(voxelCount);
for (let v = 1; v < voxelCount; v++) {
  const glow = blockProps.glow[v]! / 255;
  if (glow) {
    const c = glowColor(blockNames[v - 1] ?? '').map((x) => x * glow) as [number, number, number];
    const k = c.join(',');
    let idx = emitIndex.get(k);
    if (idx === undefined) emitIndex.set(k, (idx = emitColors.push(c) - 1));
    cellCode[v] = idx + 2 + (blockProps.opaque[v]! >= 15 && !blockProps.leaf[v] ? EMIT_OPAQUE : 0);
  } else if (blockProps.opaque[v]! >= 15 && !blockProps.leaf[v]) cellCode[v] = CODE_OPAQUE;
}
if (emitColors.length > EMIT_OPAQUE - 2) throw new Error('光体：发光色超过 126 种，一格一个字节放不下');

/** 一个区段（体素块，带一圈相邻格）→ 核心 64 × 64 列的格码，竖直按 [z0, z0 + D·格) 排（下标 (z·64 + y)·64 + x）：体素块底下当挡光（区段只存地表附近，再往下是实心），顶上当空气 */
export const sectionCodes = (g: VoxelGrid, z0: number, D: number): Uint8Array => {
  const n = sectionCells;
  const out = new Uint8Array(n * n * D);
  const pal = Uint8Array.from(g.palette, (p) => cellCode[p.v] ?? 0);
  const k0 = Math.round((g.origin[2] - z0) / g.cell); // 体素块第 0 层在窗口里是第几层
  for (let z = 0; z < Math.min(D, k0); z++) out.fill(CODE_OPAQUE, z * n * n, (z + 1) * n * n);
  for (let gz = Math.max(0, -k0); gz < g.nz && gz + k0 < D; gz++) {
    const base = (gz + k0) * n * n;
    for (let y = 0; y < n; y++) {
      const row = (gz * g.ny + y + 1) * g.nx + 1;
      for (let x = 0; x < n; x++) out[base + y * n + x] = pal[g.vox[row + x]!]!;
    }
  }
  return out;
};

/** 把各区段的格码拼成窗口的格码；拿不到的区段（包里没有）当空气 */
export const fillWindow = (w: LightWindow, codesOf: (i: number, j: number) => Uint8Array | null): Uint8Array => {
  const { W, H, D } = w;
  const n = sectionCells;
  const cell = cellOf(w);
  const out = new Uint8Array(W * H * D);
  const ox = w.x0 / cell, oy = w.y0 / cell; // 窗口最小角的全局格号
  for (const q of windowSections(w)) {
    const codes = codesOf(q.i, q.j);
    if (!codes) continue;
    const sx0 = q.i * n, sy0 = q.j * n;
    const xa = Math.max(ox, sx0), xb = Math.min(ox + W, sx0 + n);
    const ya = Math.max(oy, sy0), yb = Math.min(oy + H, sy0 + n);
    for (let z = 0; z < D; z++)
      for (let y = ya; y < yb; y++) {
        const src = (z * n + (y - sy0)) * n;
        out.set(codes.subarray(src + xa - sx0, src + xb - sx0), (z * H + (y - oy)) * W + (xa - ox));
      }
  }
  return out;
};

/** 占用格：挡光的 255，别的 0（显卡上建多级纹理，粗级是这一块里挡光的比例） */
export const occupancy = (codes: Uint8Array): Uint8Array => codes.map((c) => (isBlocking(c) ? 255 : 0));

/** 一层的格码和它的光色表 */
export type LayerCodes = { w: LightWindow; codes: Uint8Array; colors: readonly (readonly number[])[] };

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// 一团光：位置（按发光加权的重心）、各向同性发光 iso（rgb）、朝向发光 dir（Σ 亮度 × 面积 × 面法线）和它的颜色 dc（Σ 色 × 面积 ÷ Σ 亮度 × 面积，亮度为 1）。
// 往方向 ω 的发光 = iso + max(0, dir·ω) × dc：熔岩海只露顶面，往斜上方越来越暗，从侧面、底下看不到（积分有限，大片熔岩不会越远越亮到发散）
type Clump = { k: number; base: boolean; px: number; py: number; pz: number; wsum: number; iso: [number, number, number]; dir: [number, number, number]; dcol: [number, number, number]; dlum: number };

/** 一层格码里露在空气里的发光格聚成各级团，加进 out（键：级|来源|全局团号）。skip：这个窗口里的格不要（交给更细的一层） */
const addClumps = (out: Map<string, Clump>, src: LayerCodes, tag: number, skip: LightWindow | null) => {
  const { w, codes, colors } = src;
  const { W, H, D } = w;
  const cell = cellOf(w);
  const A = cell * cell;
  const WH = W * H;
  const inSkip = (x: number, y: number) => skip !== null && x >= skip.x0 && x < skip.x0 + skip.W * cellOf(skip) && y >= skip.y0 && y < skip.y0 + skip.H * cellOf(skip);
  const neighbours: [number, number, number, number][] = [[1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, 0, W], [0, -1, 0, -W], [0, 0, 1, WH], [0, 0, -1, -WH]];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code < 2) continue;
    const x = i % W, y = ((i - x) / W) % H, z = (i - x - y * W) / WH;
    const px = w.x0 + (x + 0.5) * cell, py = w.y0 + (y + 0.5) * cell, pz = w.z0 + (z + 0.5) * cell;
    if (inSkip(px, py)) continue;
    // 露在空气里的面（窗口边上的不算）
    let open = 0, nx = 0, ny = 0, nz = 0;
    for (const [dx, dy, dz, di] of neighbours) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= W || yy >= H || zz >= D) continue;
      if (codes[i + di] !== CODE_AIR) continue;
      open++;
      nx += dx;
      ny += dy;
      nz += dz;
    }
    if (!open) continue;
    const c = colors[(code & (EMIT_OPAQUE - 1)) - 2]!;
    const cl = lum(c[0]!, c[1]!, c[2]!);
    // 露 4 面以上（火、灯笼）当各向同性：发光 = 露的面数 × 面积 / 4（各面朗伯，总光通量 ÷ 4π）；不然按面朝向
    const isoK = open >= 4 ? (open * A) / 4 : 0;
    const dirK = open >= 4 ? 0 : A;
    const weight = isoK * cl + dirK * cl * Math.hypot(nx, ny, nz);
    for (let k = w.L; k <= KMAX; k++) {
      const s = 2 ** k;
      const key = `${k}|${tag}|${Math.floor(px / s)},${Math.floor(py / s)},${Math.floor(pz / s)}`;
      let cl0 = out.get(key);
      if (!cl0) out.set(key, (cl0 = { k, base: k === w.L, px: 0, py: 0, pz: 0, wsum: 0, iso: [0, 0, 0], dir: [0, 0, 0], dcol: [0, 0, 0], dlum: 0 }));
      cl0.px += px * weight;
      cl0.py += py * weight;
      cl0.pz += pz * weight;
      cl0.wsum += weight;
      for (let ch = 0; ch < 3; ch++) cl0.iso[ch] += isoK * c[ch]!;
      if (dirK) {
        cl0.dir[0] += dirK * cl * nx;
        cl0.dir[1] += dirK * cl * ny;
        cl0.dir[2] += dirK * cl * nz;
        for (let ch = 0; ch < 3; ch++) cl0.dcol[ch] += dirK * c[ch]!;
        cl0.dlum += dirK * cl;
      }
    }
  }
};

/** 一盏团在团表里占的浮点数：[x y z 级] [iso.rgb 标记] [dir.xyz 影响半径] [dc.rgb 软化半径]；标记 1 = 最细一级（管更近的），2 = 最粗一级（管更远的） */
export const LIGHT_FLOATS = 16;

/** 一层探针要的团表：lights 团表，bricks 每砖 [起, 数, 0, 0]（砖按 (bz·BH + by)·BW + bx 排），index 团号 */
export type LightSet = { lights: Float32Array; bricks: Float32Array; index: Float32Array; count: number };
/** 一层要的：占用格、团表（光体工人出，光体缓存存） */
export type LightLayerData = { occ: Uint8Array; set: LightSet };

/**
 * 探针层 receiver 的团表。sources 从粗到细，最后一个是探针这一层自己；每一层只取不在更细一层窗口里的格（每处的光只算一次）。
 * 团按 级、来源、位置排（结果和 Map 的插入顺序无关），各砖里的团号从小到大。
 */
export const buildLightSet = (receiver: LightWindow, sources: readonly LayerCodes[], minLight: number): LightSet => {
  const clumps = new Map<string, Clump>();
  sources.forEach((s, n) => addClumps(clumps, s, n, n + 1 < sources.length ? sources[n + 1]!.w : null));
  const keys = [...clumps.keys()].sort();
  const list: { c: Clump; R: number }[] = [];
  for (const key of keys) {
    const c = clumps.get(key)!;
    if (c.wsum <= 0) continue;
    const jmax = lum(c.iso[0], c.iso[1], c.iso[2]) + Math.hypot(c.dir[0], c.dir[1], c.dir[2]);
    list.push({ c, R: Math.sqrt(jmax / minLight) });
  }
  const lights = new Float32Array(list.length * LIGHT_FLOATS);
  list.forEach(({ c, R }, n) => {
    const o = n * LIGHT_FLOATS;
    lights.set([c.px / c.wsum, c.py / c.wsum, c.pz / c.wsum, c.k, ...c.iso, (c.base ? 1 : 0) + (c.k === KMAX ? 2 : 0), ...c.dir, R], o);
    const dl = c.dlum || 1;
    lights.set([c.dcol[0] / dl, c.dcol[1] / dl, c.dcol[2] / dl, 0.5 * 2 ** c.k], o + 12);
  });
  // 分砖：砖和团的最近、最远距离落在这一级用得到的距离里（d ∈ (½, 2) × LEVEL_D × 2^k 米，最细一级不设下限、最粗一级不设上限），且最近距离在影响半径内
  const cell = cellOf(receiver);
  const B = BRICK * cell;
  const BW = Math.ceil(receiver.W / BRICK), BH = Math.ceil(receiver.H / BRICK), BD = Math.ceil(receiver.D / BRICK);
  const perBrick: number[][] = Array.from({ length: BW * BH * BD }, () => []);
  list.forEach(({ c, R }, n) => {
    const s = 2 ** c.k;
    const lo = c.base ? 0 : (LEVEL_D * s) / 2;
    const hi = Math.min(R, c.k === KMAX ? Infinity : LEVEL_D * s * 2);
    const px = c.px / c.wsum, py = c.py / c.wsum, pz = c.pz / c.wsum;
    const bx0 = Math.max(0, Math.floor((px - hi - receiver.x0) / B)), bx1 = Math.min(BW - 1, Math.floor((px + hi - receiver.x0) / B));
    const by0 = Math.max(0, Math.floor((py - hi - receiver.y0) / B)), by1 = Math.min(BH - 1, Math.floor((py + hi - receiver.y0) / B));
    const bz0 = Math.max(0, Math.floor((pz - hi - receiver.z0) / B)), bz1 = Math.min(BD - 1, Math.floor((pz + hi - receiver.z0) / B));
    for (let bz = bz0; bz <= bz1; bz++)
      for (let by = by0; by <= by1; by++)
        for (let bx = bx0; bx <= bx1; bx++) {
          const ax = receiver.x0 + bx * B, ay = receiver.y0 + by * B, az = receiver.z0 + bz * B;
          const nearX = Math.max(ax - px, 0, px - ax - B), nearY = Math.max(ay - py, 0, py - ay - B), nearZ = Math.max(az - pz, 0, pz - az - B);
          const farX = Math.max(Math.abs(px - ax), Math.abs(px - ax - B)), farY = Math.max(Math.abs(py - ay), Math.abs(py - ay - B)), farZ = Math.max(Math.abs(pz - az), Math.abs(pz - az - B));
          if (Math.hypot(nearX, nearY, nearZ) >= hi || Math.hypot(farX, farY, farZ) <= lo) continue;
          perBrick[(bz * BH + by) * BW + bx]!.push(n);
        }
  });
  const bricks = new Float32Array(perBrick.length * 4);
  let total = 0;
  perBrick.forEach((l, b) => {
    bricks[b * 4] = total;
    bricks[b * 4 + 1] = l.length;
    total += l.length;
  });
  const index = new Float32Array(Math.max(1, total));
  let at = 0;
  for (const l of perBrick) for (const n of l) index[at++] = n;
  return { lights, bricks, index, count: list.length };
};

/** 第 k 级团在距离 d 米处的权重（帽子函数；最细一级不设下限、最粗一级不设上限），和着色器里的算法一样（测试用） */
export const levelWeight = (d: number, k: number, flags: number) => {
  const u = Math.log2(Math.max(d, 1e-6) / LEVEL_D);
  if (u < k && flags & 1) return 1;
  if (u > k && flags & 2) return 1;
  return Math.max(0, 1 - Math.abs(u - k));
};
