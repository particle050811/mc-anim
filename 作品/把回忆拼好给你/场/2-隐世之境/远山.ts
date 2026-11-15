// 窗外远山（参数 远山）：樱花林那一圈平地外面起伏成山、坡上的樱花树和花簇、原版的雾和天色。纯函数，不 import react、three（窗外.tsx 搭网格，测试核）。
// 坐标同 参数.ts（网格本地，Z 朝上）；一列 (x, y) 指 x～x+1、y～y+1，高 h = 那一列草方块顶面的 z（平地 0）。
// 地形整个压低 0.01（同樱花林的草地：藏在结构方块顶面底下），树、花簇照整格放。
import { cameraRig, cherryGrove, farHills } from './参数.ts';
import { cherryTree, type CellPos } from './樱花树.ts';
import { clamp01, mulberry32 } from '@engine/core/数学.ts';

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** 结构占地 [x0, y0, x1, y1]（模板 21×26）：这里面的地面由 窗外.tsx 按结构地面层的缺口铺，远山不铺 */
export const structFootprint = [0, -26, 21, 0] as const;

/** 平地框 [x0, y0, x1, y1]：樱花林撒树那一圈（内框 中心 ± 外半径）再让 平地留边 格 */
export const flatBox = (() => {
  const [x0, y0, x1, y1] = cherryGrove.innerBox;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const r = cherryGrove.outerRadius + farHills.flatMargin;
  return [cx - r, cy - r, cx + r, cy + r] as const;
})();

/** 点 (px, py) 出平地框多远（格；框里是 0） */
export const flatAreaDist = (px: number, py: number) => {
  const [x0, y0, x1, y1] = flatBox;
  return Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));
};

/** 整数格点上的随机数（0～1），同一组 (i, j, 种) 每次一样 */
const scatter = (i: number, j: number, seed: number) => {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 值噪声（0～1）：格点上取 散，格子里缓过去 */
const valueNoise = (x: number, y: number, scale: number, seed: number) => {
  const [u, v] = [x / scale, y / scale];
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const [a, b] = [smoothstep(u - i), smoothstep(v - j)];
  const lowSample = scatter(i, j, seed) + (scatter(i + 1, j, seed) - scatter(i, j, seed)) * a;
  const rowAbove = scatter(i, j + 1, seed) + (scatter(i + 1, j + 1, seed) - scatter(i, j + 1, seed)) * a;
  return lowSample + (rowAbove - lowSample) * b;
};

/** 这一列的高（整格）：平地框里 0，出框以后按 坡长 慢慢起伏 */
export const heightAt = (x: number, y: number) => {
  const [px, py] = [x + 0.5, y + 0.5];
  const d = flatAreaDist(px, py);
  if (d <= 0) return 0;
  const { 种子: seed, slopeLength, 起伏: undulation, scale, 细: fineWeight } = farHills;
  const n = (1 - fineWeight) * valueNoise(px, py, scale[0], seed) + fineWeight * valueNoise(px, py, scale[1], seed + 1);
  return Math.round(smoothstep(clamp01(d / slopeLength)) * (undulation[0] + undulation[1] * d) * n);
};

/** 地形铺的范围 [x0, y0, x1, y1]：西门脚下那一列 ± 铺到 */
export const terrainRange = (() => {
  const [cx, cy] = [Math.floor(cameraRig.feet[0]), Math.floor(cameraRig.feet[1])];
  return [cx - farHills.groundSpread, cy - farHills.groundSpread, cx + farHills.groundSpread, cy + farHills.groundSpread] as const;
})();

export type FaceBuffers = { 位: number[]; uv: number[]; 法: number[]; 序: number[] };
const newFaces = (): FaceBuffers => ({ 位: [], uv: [], 法: [], 序: [] });
const addQuad = (f: FaceBuffers, corners: readonly (readonly number[])[], uv: readonly (readonly number[])[], normal: readonly number[]) => {
  const n = f.位.length / 3;
  for (let i = 0; i < 4; i++) {
    f.位.push(...corners[i]!);
    f.uv.push(...uv[i]!);
    f.法.push(...normal);
  }
  f.序.push(n, n + 1, n + 2, n, n + 2, n + 3);
};

const lowerOffset = 0.01;
const inFootprint = (x: number, y: number) => x >= structFootprint[0] && x < structFootprint[2] && y >= structFootprint[1] && y < structFootprint[3];

/** 四个方向的侧面：法线、这一面左右两头（从外面看，左到右）、贴图横向坐标（左、右）。贴图竖向 v = 0 在面的上沿（DataTexture 不翻转，第一行在上） */
const sideDirs = [
  { d: [1, 0], 法: [1, 0, 0], edgeEnds: (x: number, y: number) => [[x + 1, y], [x + 1, y + 1]], u: (x: number, y: number) => [y, y + 1] },
  { d: [-1, 0], 法: [-1, 0, 0], edgeEnds: (x: number, y: number) => [[x, y + 1], [x, y]], u: (x: number, y: number) => [-(y + 1), -y] },
  { d: [0, 1], 法: [0, 1, 0], edgeEnds: (x: number, y: number) => [[x + 1, y + 1], [x, y + 1]], u: (x: number, y: number) => [-(x + 1), -x] },
  { d: [0, -1], 法: [0, -1, 0], edgeEnds: (x: number, y: number) => [[x, y], [x + 1, y]], u: (x: number, y: number) => [x, x + 1] },
] as const;

/** 地形的面：顶（草方块顶，同高的一行并成一条）、草侧（每个台阶最上面那一格的侧面）、土侧（再往下露出来的泥土，几格并成一块、贴图竖向重复）。
 *  结构占地里不铺顶（窗外.tsx 按缺口铺）；范围最外一圈不画朝外的侧面（在雾外面） */
export const terrain = () => {
  const [x0, y0, x1, y1] = terrainRange;
  const width = x1 - x0;
  const heights = new Int16Array(width * (y1 - y0));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) heights[(y - y0) * width + (x - x0)] = heightAt(x, y);
  const cachedHeight = (x: number, y: number) => (x < x0 || x >= x1 || y < y0 || y >= y1 ? null : heights[(y - y0) * width + (x - x0)]!);
  const top = newFaces();
  const grassSide = newFaces();
  const dirtSide = newFaces();
  for (let y = y0; y < y1; y++) {
    let startIndex: number | null = null;
    let startHeight = 0;
    for (let x = x0; x <= x1; x++) {
      const h = x < x1 && !inFootprint(x, y) ? cachedHeight(x, y)! : null;
      if (startIndex !== null && h !== startHeight) {
        const z = startHeight - lowerOffset;
        addQuad(top, [[startIndex, y, z], [x, y, z], [x, y + 1, z], [startIndex, y + 1, z]], [[startIndex, y], [x, y], [x, y + 1], [startIndex, y + 1]], [0, 0, 1]);
        startIndex = null;
      }
      if (h !== null && startIndex === null) [startIndex, startHeight] = [x, h];
    }
  }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const h = cachedHeight(x, y)!;
      for (const s of sideDirs) {
        const hn = cachedHeight(x + s.d[0], y + s.d[1]);
        if (hn === null || hn >= h) continue;
        const [[lx, ly], [rx, ry]] = s.edgeEnds(x, y);
        const [ul, ur] = s.u(x, y);
        const face = (f: FaceBuffers, bottom: number, topZ: number) =>
          addQuad(f, [[lx, ly, bottom - lowerOffset], [rx, ry, bottom - lowerOffset], [rx, ry, topZ - lowerOffset], [lx, ly, topZ - lowerOffset]], [[ul, topZ - bottom], [ur, topZ - bottom], [ur, 0], [ul, 0]], s.法);
        face(grassSide, h - 1, h);
        if (h - 1 > hn) face(dirtSide, hn, h - 1);
      }
    }
  return { top, grassSide, dirtSide };
};

/** 点 (px, py) 在不在从西门往东看的扇形里、离西门多远 */
const inFan = (px: number, py: number, radius: number) => {
  const [dx, dy] = [px - cameraRig.feet[0], py - cameraRig.feet[1]];
  return Math.hypot(dx, dy) <= radius && Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) <= farHills.fanHalfAngleDeg;
};

/** 坡上的樱花树：按 树格 的格子撒，每格 有树 的机会、格里随机挪；只在扇形里、出平地框 4 格以外（不挨着樱花林那一圈的树干）。
 *  树根在那一列的草上；埋进坡里的叶子不放（原版树叶不替换实心方块） */
export const buildSlopeTrees = () => {
  const { 种子: seed, treeReach, treeSpacing: treeCell, treeChance } = farHills;
  const [x0, y0, x1, y1] = terrainRange;
  const logs: CellPos[] = [];
  const leaves: CellPos[] = [];
  let treeCount = 0;
  for (let gy = Math.floor(y0 / treeCell); gy * treeCell < y1; gy++)
    for (let gx = Math.floor(x0 / treeCell); gx * treeCell < x1; gx++) {
      if (scatter(gx, gy, seed + 2) >= treeChance) continue;
      const x = gx * treeCell + 1 + Math.floor(scatter(gx, gy, seed + 3) * (treeCell - 2));
      const y = gy * treeCell + 1 + Math.floor(scatter(gx, gy, seed + 4) * (treeCell - 2));
      if (!inFan(x + 0.5, y + 0.5, treeReach) || flatAreaDist(x + 0.5, y + 0.5) <= 4) continue;
      const h = heightAt(x, y);
      const t = cherryTree(x, y, mulberry32(seed * 1009 + x * 131 + y * 7));
      logs.push(...t.logs.map(([a, b, c]): CellPos => [a, b, c + h]));
      for (const [a, b, c] of t.leaves) if (c + h >= heightAt(a, b)) leaves.push([a, b, c + h]);
      treeCount++;
    }
  return { logs, leaves, 棵: treeCount };
};

/** 坡上的粉红色花簇 [x, y, 高, 转几个 90°]：扇形里、离西门 花簇到 格以内、出平地框的列，每列 花簇密度 的机会 */
export const buildSlopeFlowers = () => {
  const { 种子: seed, flowerReach, flowerDensity } = farHills;
  const [x0, y0, x1, y1] = terrainRange;
  const flowers: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!inFan(x + 0.5, y + 0.5, flowerReach) || flatAreaDist(x + 0.5, y + 0.5) <= 0) continue;
      if (scatter(x, y, seed + 5) >= flowerDensity) continue;
      flowers.push([x, y, heightAt(x, y), Math.floor(scatter(x, y, seed + 6) * 4)]);
    }
  return flowers;
};

// ---------- 原版的雾和天色（1.20.1 FogRenderer、LevelRenderer.renderSky、fog.glsl 的 linear_fog） ----------
const parseHex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];

/** 雾色（sRGB 数值 0～1）：生物群系雾色往天色靠 1 − (0.25 + 0.75 × 视距/32)^0.25（FogRenderer.setupColor，白天亮度 1：归隐之地锁在 2000 刻） */
export const vanillaFogColor = (sky: string, fog: string, viewDistance: number): [number, number, number] => {
  const k = 1 - Math.pow(0.25 + (0.75 * viewDistance) / 32, 0.25);
  const [a, b] = [parseHex(fog), parseHex(sky)];
  return a.map((v, i) => v + (b[i]! - v) * k) as [number, number, number];
};

/** 地形雾从哪儿起、到哪儿全是雾（格）：视距 × 16 往回让 视距×16/10（夹在 4～64） */
export const terrainFogRange = (viewDistance: number): [number, number] => {
  const far = viewDistance * 16;
  return [far - Math.min(64, Math.max(4, far / 10)), far];
};

/** 雾多浓（0～1）：linear_fog，起以内 0、起到止 smoothstep、止以外 1；距离是柱形的（水平距离和竖直距离取大的） */
export const fogDensity = (distance: number, start: number, end: number) => {
  if (distance <= start) return 0;
  if (distance >= end) return 1;
  const t = (distance - start) / (end - start);
  return t * t * (3 - 2 * t);
};

/** 天上仰角 仰（度）那一圈混进多少雾色：天盘在镜头上方 16 格、半径 512，盘心雾距 16、盘边 512，片元上按位置线性插（天雾 0 起、视距×16 止）；
 *  盘边（仰角 1.79° 以下）外面是清屏色 = 雾色 */
export const skyFog = (elevation: number, viewDistance: number) => {
  if (elevation <= 0) return 1;
  const r = 16 / Math.tan((elevation * Math.PI) / 180);
  if (r >= 512) return 1;
  return fogDensity(16 + ((512 - 16) * r) / 512, 0, viewDistance * 16);
};
