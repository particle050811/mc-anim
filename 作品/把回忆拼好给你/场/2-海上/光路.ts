// 第 4 句海面上原版没有、Agent 加的两样（参数.ts 的 远档、光路）：远处分档往地平色靠，太阳底下一行一行的光路。纯模块。
// 按屏幕上的块（海块 个成片像素见方，同 天.tsx 的天色块）逐块算视线，出一张「盖在水上的颜色」图：rgb = 颜色，a = 盖多少（0 = 原样的水）。
// 海面着色器按片元在屏幕上的位置取这张图（海面.tsx），所以边是块的台阶，船和人在水前面照样挡住它。
import { lightPath, farTiers } from './参数.ts';
import { elevationAzimuthDiff, sunBody, sightDir, type Perspective } from './编排.ts';
import { horizonColor, type RGB } from './天色.ts';

const parseColor = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const coreColor = parseColor(lightPath.coreColor);
const edgeColor = parseColor(lightPath.edgeColor);
/** 太阳本体的半张角（度） */
const sunHalfDeg = (Math.atan(sunBody.半边 / sunBody.距) * 180) / Math.PI;

/** 固定的伪随机：两个整数 → 0～1（同一行同一步每次一样） */
const scatter = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** 下视角 下（度）、离太阳方位差 差（度）处光路的颜色，没有就 null。刻：游戏刻（闪的节奏） */
export const lightPathColor = (depthBelow: number, azimuthDiff: number, tick: number): RGB | null => {
  if (depthBelow <= 0 || depthBelow >= lightPath.near) return null;
  if (depthBelow < lightPath.startDist) {
    // 贴着海平线那一道：连成一片，和太阳本体差不多宽
    const w = sunHalfDeg * lightPath.宽;
    const a = Math.abs(azimuthDiff);
    return a < w * lightPath.coreWidth ? coreColor : a < w ? edgeColor : null;
  }
  // 行：贴着海平线的几行按比例越往近越高，过了 厚起 每行一样高（不然近处一行有几十个像素高，成了一块一块的砖）
  const logRow = (d: number) => Math.log(d / lightPath.startDist) / Math.log(lightPath.比);
  const row = Math.floor(depthBelow < lightPath.thickStart ? logRow(depthBelow) : logRow(lightPath.thickStart) + (depthBelow - lightPath.thickStart) / (lightPath.thickStart * (lightPath.比 - 1)));
  if (row % 2 === 1) return null; // 行与行之间隔一行水
  // 每行自己的相位，轮着换，不一起跳
  const stepIndex = Math.floor(tick / lightPath.stepTicks + scatter(row, 7));
  const W = sunHalfDeg * (lightPath.宽 + lightPath.spread * depthBelow);
  const cutoff = lightPath.missingBase + (1 - lightPath.missingBase) * (depthBelow / lightPath.near) * 0.8;
  for (let i = 0; i < lightPath.cuts; i++) {
    const n = stepIndex * 16 + i * 4;
    if (scatter(row, n) < cutoff) continue;
    const x = azimuthDiff - W * lightPath.jitter * (2 * scatter(row, n + 1) - 1);
    const l = W * (0.2 + 0.35 * scatter(row, n + 2));
    if (Math.abs(x) < l) return Math.abs(x) < l * lightPath.coreWidth ? coreColor : edgeColor;
  }
  return null;
};

/** 远档：下视角 下 度处往地平色混多少 */
export const farMix = (depthBelow: number): number => {
  if (depthBelow <= 0) return 0;
  for (const [angleThreshold, mix] of farTiers) if (depthBelow < angleThreshold) return mix;
  return 0;
};

/** 一整帧的图：块数 列 × 行，RGBA 字节，第 0 行是画面最上面。宽、高：页面尺寸；块：一块多少页面像素。
 *  光路在太阳的方位（正西）底下，下视角从海平线量（太阳往下落几分之一度，光路不跟着变） */
export const seaPattern = (rig: Perspective, tick: number, width: number, height: number, tileSize: number) => {
  const cols = Math.ceil(width / tileSize);
  const rowCount = Math.ceil(height / tileSize);
  const bytes = new Uint8Array(cols * rowCount * 4);
  for (let j = 0; j < rowCount; j++)
    for (let i = 0; i < cols; i++) {
      const { elevation, 差: azimuthDiff } = elevationAzimuthDiff(sightDir(rig, (i + 0.5) * tileSize, (j + 0.5) * tileSize, width, height));
      const dipAngle = -elevation;
      if (dipAngle <= 0) continue;
      const o = (j * cols + i) * 4;
      const light = lightPathColor(dipAngle, azimuthDiff, tick);
      if (light) {
        bytes.set([light[0], light[1], light[2], 255], o);
        continue;
      }
      const m = farMix(dipAngle);
      if (m > 0) {
        const c = horizonColor(azimuthDiff);
        bytes.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(m * 255)], o);
      }
    }
  return { 字节: bytes, 列: cols, 行: rowCount };
};
