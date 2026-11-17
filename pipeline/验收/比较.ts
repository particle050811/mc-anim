// 比两版画面和声音（阈值在 verify/阈值.toml，用户 10-21 定：成片不要差太多就行，不要求逐像素、逐样本相同）。
// 画面（用户 11-02 定换比法，预览 1102-1143-verify比法）：哈希一样就是没变；不一样时比小块的平均颜色挪了多少（块差），压缩只让单个像素乱跳、几乎不动小块平均，
//   真改了东西一整块的平均会跟着变。没有旧帧只能比 16×9 块均值。
// 两边的像素都由 YUV 按固定公式换成 RGB（换算），不用 ffmpeg 的 swscale：H.264、FFV1 解出来的 YUV 各版本逐位一样，swscale 换出来的 RGB 不一样
//   （brew ffmpeg 9.0.2 和 Remotion 的 7.1 整帧差 1～1.4 级，64×64 块差到 2.7，档位才 4）。
// 声音：sha 一样就是没变；不一样时比整段响度（LUFS）和起音落点（台词、音效开始的时刻）。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { measureEbur128 } from '../资产/音频量.ts';
import { codeRoot } from '../环境/路径.ts';

export type Threshold = { block8Threshold: number; block16Threshold: number; block64Threshold: number; glanceThreshold: number; blockMeanTol: number; loudnessTolLu: number; onsetTolFrames: number };

export const thresholdFile = () => path.join(codeRoot(), 'verify', '阈值.toml');

export const readThresholds = (file = thresholdFile()): Threshold => {
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const thresholdKeys = ['block8Threshold', 'block16Threshold', 'block64Threshold', 'glanceThreshold', 'blockMeanTol', 'loudnessTolLu', 'onsetTolFrames'] as const;
  for (const k of thresholdKeys) if (typeof t[k] !== 'number') throw new Error(`${file} 要写数字 ${k}`);
  return Object.fromEntries(thresholdKeys.map((k) => [k, t[k]])) as Threshold;
};

// ---------- YUV → RGB ----------

/**
 * 换算的名字，写进认可记录（"conversion"）。BT.601 有限范围（这批母版 color_space 没标、color_range tv，swscale 默认也按 601 换），
 * 系数 Q16 定点、四舍五入、截到 0～255；色度 2×2 共用一个样本（最近邻，和 swscale 不缩放时一样）。改公式就要换名字
 */
export const conversion = 'yuv420p bt601 tv q16 色度最近邻 v1';
const coefY = 76309; // 255/219
const coefRV = 104597; // 1.596027
const coefGU = 25675; // 0.391762
const coefGV = 53279; // 0.812968
const coefBU = 132201; // 2.017232

/** yuv420p 一帧（Y 宽×高，U、V 各 宽/2×高/2）→ rgb24 */
export const yuvToRgb = (yuv: Buffer, width: number, height: number): Buffer => {
  if (width % 2 || height % 2) throw new Error(`yuv420p 的宽高要是偶数：${width}×${height}`);
  if (yuv.length !== (width * height * 3) / 2) throw new Error(`yuv420p 一帧应是 ${(width * height * 3) / 2} 字节，给的是 ${yuv.length}`);
  const out = Buffer.allocUnsafe(width * height * 3);
  const halfWidth = width / 2;
  const uStart = width * height;
  const vStart = uStart + halfWidth * (height / 2);
  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < height; y++) {
    const chromaRow = (y >> 1) * halfWidth;
    let o = y * width * 3;
    for (let x = 0; x < width; x++) {
      const c = coefY * (yuv[y * width + x]! - 16) + 32768;
      const u = yuv[uStart + chromaRow + (x >> 1)]! - 128;
      const v = yuv[vStart + chromaRow + (x >> 1)]! - 128;
      out[o++] = clampByte((c + coefRV * v) >> 16);
      out[o++] = clampByte((c - coefGU * u - coefGV * v) >> 16);
      out[o++] = clampByte((c + coefBU * u) >> 16);
    }
  }
  return out;
};

// ---------- 块差 ----------

/** 比的窗口边长（像素）。窗口左上角落在 4 像素网格上、整个在画面内，步长 4 像素 */
export const TileEdge = [8, 16, 64] as const;
export type TileEdge = (typeof TileEdge)[number];
export type BlockDiff = Record<TileEdge, { 差: number; x: number; y: number }>;

/** 4×4 格差值和的积分图：(格高+1)×(格宽+1)×3，第 0 行、第 0 列是 0；和最大 255×像素数，double 精确 */
export type DiffIntegral = { cellWidth: number; cellRows: number; rowLen: number; integral: Float64Array };

/** d = 新 − 旧（逐通道、带符号）先按 4×4 格求和、再建积分图：任一窗口的通道和四次查表得出（computeBlockDiff、anim diff 的挑窗口共用） */
export const diffIntegral = (newPixels: Buffer, oldBuf: Buffer, width: number, height: number): DiffIntegral => {
  if (newPixels.length !== oldBuf.length || newPixels.length !== width * height * 3) throw new Error('两帧大小不一样');
  const cellWidth = Math.floor(width / 4);
  const cellRows = Math.floor(height / 4);
  const rowLen = (cellWidth + 1) * 3;
  const integral = new Float64Array((cellRows + 1) * rowLen);
  const cellDiffs = new Int32Array(cellWidth * 3);
  for (let gy = 0; gy < cellRows; gy++) {
    cellDiffs.fill(0);
    for (let y = gy * 4; y < gy * 4 + 4; y++) {
      let i = y * width * 3;
      for (let gx = 0; gx < cellWidth; gx++) {
        for (let k = 0; k < 4; k++, i += 3) {
          cellDiffs[gx * 3] += newPixels[i]! - oldBuf[i]!;
          cellDiffs[gx * 3 + 1] += newPixels[i + 1]! - oldBuf[i + 1]!;
          cellDiffs[gx * 3 + 2] += newPixels[i + 2]! - oldBuf[i + 2]!;
        }
      }
    }
    const upRowBase = gy * rowLen;
    const rowStart = (gy + 1) * rowLen;
    let r = 0, g = 0, b = 0;
    for (let gx = 0; gx < cellWidth; gx++) {
      r += cellDiffs[gx * 3]!;
      g += cellDiffs[gx * 3 + 1]!;
      b += cellDiffs[gx * 3 + 2]!;
      const j = (gx + 1) * 3;
      integral[rowStart + j] = integral[upRowBase + j]! + r;
      integral[rowStart + j + 1] = integral[upRowBase + j + 1]! + g;
      integral[rowStart + j + 2] = integral[upRowBase + j + 2]! + b;
    }
  }
  return { cellWidth, cellRows, rowLen, integral };
};

/** 左上角在第 i 行、第 j 列格、边长 k 格的窗口里通道 c 的差值和 */
export const windowSum = ({ integral, rowLen }: DiffIntegral, i: number, j: number, k: number, c: number) =>
  integral[(i + k) * rowLen + (j + k) * 3 + c]! - integral[i * rowLen + (j + k) * 3 + c]! - integral[(i + k) * rowLen + j * 3 + c]! + integral[i * rowLen + j * 3 + c]!;

/**
 * d = 新 − 旧（逐通道、带符号）；每个窗口里各通道 d 的平均取绝对值、三通道取最大，L_w 是全帧所有窗口里最大的那个（级，0–255）和它的左上角。
 * 先按 4×4 格求和、再用积分图，一帧一次算完所有窗口（参考实现：数据根 archive/verify比法-1102/脚本/库.py 的 指标()）。画面比窗口小就是 0
 */
export const computeBlockDiff = (newPixels: Buffer, oldBuf: Buffer, width: number, height: number, integralImage = diffIntegral(newPixels, oldBuf, width, height)): BlockDiff => {
  const { cellWidth, cellRows } = integralImage;
  const r = {} as BlockDiff;
  for (const w of TileEdge) {
    const k = w / 4;
    let maxDiff = 0, maxX = 0, maxY = 0;
    for (let i = 0; i + k <= cellRows; i++) {
      for (let j = 0; j + k <= cellWidth; j++) {
        for (let c = 0; c < 3; c++) {
          const m = Math.abs(windowSum(integralImage, i, j, k, c)) / (w * w);
          if (m > maxDiff) [maxDiff, maxX, maxY] = [m, j * 4, i * 4];
        }
      }
    }
    r[w] = { 差: maxDiff, x: maxX, y: maxY };
  }
  return r;
};

export type BlockVerdict = '变了' | '看一眼' | '容差内';

/** 16×16 > 块16门槛、64×64 > 块64门槛、8×8 > 块8门槛 任一条就是变了；16×16 在 (看一眼门槛, 块16门槛] 不判失败、出并排图给人看 */
export const judgeBlockDiff = (d: BlockDiff, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold' | 'glanceThreshold'>): BlockVerdict =>
  d[16].差 > threshold.block16Threshold || d[64].差 > threshold.block64Threshold || d[8].差 > threshold.block8Threshold ? '变了' : d[16].差 > threshold.glanceThreshold ? '看一眼' : '容差内';

/** 哪个窗口最该看：超门槛最多的那一档（都没超就是 16×16） */
export const blocksToView = (d: BlockDiff, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold'>): TileEdge => {
  const thresholdRatio = { 8: d[8].差 / threshold.block8Threshold, 16: d[16].差 / threshold.block16Threshold, 64: d[64].差 / threshold.block64Threshold };
  return (TileEdge.filter((w) => thresholdRatio[w] > 1).sort((a, b) => thresholdRatio[b] - thresholdRatio[a])[0] ?? 16) as TileEdge;
};

export const blockDiffNote = (d: BlockDiff, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold'>) =>
  `块平均差 16×16 ${d[16].差.toFixed(1)}（门槛 ${threshold.block16Threshold}）、64×64 ${d[64].差.toFixed(1)}（${threshold.block64Threshold}）、8×8 ${d[8].差.toFixed(1)}（${threshold.block8Threshold}），最大的 16×16 块在 (${d[16].x}, ${d[16].y})`;

// ---------- 并排图 ----------

const zoomFactor = 6;
const diffColor = [255, 0, 0] as const;

/**
 * 并排图：上排 旧 | 新 | 差×4（各通道差的最大绝对值乘 4，灰度），三格都在 块 那个窗口外画红框；
 * 下排是三格在这个窗口附近的裁切放大 6 倍。宽 3×宽、高 2×高
 */
export const sideBySide = (newPixels: Buffer, oldBuf: Buffer, width: number, height: number, box: { x: number; y: number; side: number }): Buffer => {
  const W = width * 3;
  const out = Buffer.alloc(W * height * 2 * 3);
  const diffPixels = Buffer.allocUnsafe(width * height * 3);
  for (let i = 0; i < width * height * 3; i += 3) {
    const d = Math.max(Math.abs(newPixels[i]! - oldBuf[i]!), Math.abs(newPixels[i + 1]! - oldBuf[i + 1]!), Math.abs(newPixels[i + 2]! - oldBuf[i + 2]!));
    diffPixels[i] = diffPixels[i + 1] = diffPixels[i + 2] = Math.min(255, d * 4);
  }
  const images = [oldBuf, newPixels, diffPixels];
  for (const [n, src] of images.entries()) for (let y = 0; y < height; y++) src.copy(out, (y * W + n * width) * 3, y * width * 3, (y + 1) * width * 3);
  // 裁切：以窗口中心为中心、宽/放大 × 高/放大，夹在画面里
  const cropWidth = Math.max(1, Math.floor(width / zoomFactor));
  const cropHeight = Math.max(1, Math.floor(height / zoomFactor));
  const cx = Math.min(Math.max(0, box.x + box.side / 2 - cropWidth / 2), width - cropWidth) | 0;
  const cy = Math.min(Math.max(0, box.y + box.side / 2 - cropHeight / 2), height - cropHeight) | 0;
  for (const [n, src] of images.entries()) {
    for (let y = 0; y < cropHeight * zoomFactor; y++) {
      const sy = cy + Math.floor(y / zoomFactor);
      for (let x = 0; x < cropWidth * zoomFactor; x++) {
        const s = (sy * width + cx + Math.floor(x / zoomFactor)) * 3;
        const o = ((height + y) * W + n * width + x) * 3;
        out[o] = src[s]!;
        out[o + 1] = src[s + 1]!;
        out[o + 2] = src[s + 2]!;
      }
    }
  }
  // 红框：上排画在窗口外一圈（留 2 像素空，线宽 2），下排按放大后的坐标画
  const setPixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= height * 2) return;
    const o = (y * W + x) * 3;
    [out[o], out[o + 1], out[o + 2]] = diffColor;
  };
  const drawBox = (x0: number, y0: number, x1: number, y1: number, clipX0: number, clipX1: number, clipY0: number, clipY1: number) => {
    for (let t = 0; t < 2; t++) {
      for (let x = x0 - t; x <= x1 + t; x++) for (const y of [y0 - t, y1 + t]) if (x >= clipX0 && x < clipX1 && y >= clipY0 && y < clipY1) setPixel(x, y);
      for (let y = y0 - t; y <= y1 + t; y++) for (const x of [x0 - t, x1 + t]) if (x >= clipX0 && x < clipX1 && y >= clipY0 && y < clipY1) setPixel(x, y);
    }
  };
  for (let n = 0; n < 3; n++) {
    drawBox(n * width + box.x - 3, box.y - 3, n * width + box.x + box.side + 2, box.y + box.side + 2, n * width, (n + 1) * width, 0, height);
    const bx = n * width + (box.x - cx) * zoomFactor;
    const by = height + (box.y - cy) * zoomFactor;
    drawBox(bx - 1, by - 1, bx + box.side * zoomFactor, by + box.side * zoomFactor, n * width, n * width + cropWidth * zoomFactor, height, height + cropHeight * zoomFactor);
  }
  return out;
};

/** 两份块均值每个通道的最大差 */
export const compareBlockMeans = (newMeans: readonly string[], oldBlocks: readonly string[]) => {
  if (newMeans.length !== oldBlocks.length) return Infinity;
  let maxDiff = 0;
  newMeans.forEach((row, i) => {
    const a = Buffer.from(row, 'hex');
    const b = Buffer.from(oldBlocks[i]!, 'hex');
    if (a.length !== b.length) maxDiff = Infinity;
    else for (let j = 0; j < a.length; j++) maxDiff = Math.max(maxDiff, Math.abs(a[j]! - b[j]!));
  });
  return maxDiff;
};

/** 整段积分响度（EBU R128，LUFS）；ffmpeg 的 ebur128 滤镜，静音是 -70 */
export const measureLoudness = (file: string): number => {
  const { lufs, stderr } = measureEbur128(file, { lowPriority: true });
  if (lufs === undefined) throw new Error(`读不出 ${file} 的响度：\n${stderr.slice(-500)}`);
  return lufs === -Infinity ? -70 : lufs;
};

// ---------- 起音 ----------
// 5 ms 一格的 RMS 包络（双声道取平均，dBFS）；某格比前 50 ms 里最低的那格跳起 ≥ 记录门槛 dB、且本格不低于 -45 dBFS，记一个起音（60 ms 内不重记）。
// 强度 = 跳起的 dB。比的时候，一边 ≥ 强起音 的起音，另一边在容差内要有起音（≥ 记录门槛 即可），免得刚好压在门槛上的被当成多了或少了。
export const cellSec = 0.005;
const cellSamples = 48000 * cellSec;
const lookbackCells = 10;
const relogGapCells = 12;
export const recordThreshold = 6;
export const strongOnset = 10;
const floorDb = -45;

export type Onset = { sec: number; strength: number };

/** 边读 s16le 双声道 48 kHz 的 PCM 边算包络 */
export class Envelope {
  private sum = 0;
  private count = 0;
  private 余 = Buffer.alloc(0);
  readonly dB: number[] = [];
  加(pcm: Buffer) {
    const b = this.余.length ? Buffer.concat([this.余, pcm]) : pcm;
    const n = b.length - (b.length % 4);
    for (let i = 0; i < n; i += 4) {
      const v = (b.readInt16LE(i) + b.readInt16LE(i + 2)) / 2 / 32768;
      this.sum += v * v;
      if (++this.count === cellSamples) this.flushCells();
    }
    this.余 = Buffer.from(b.subarray(n));
  }
  private flushCells() {
    this.dB.push(this.sum > 0 ? 10 * Math.log10(this.sum / this.count) : -120);
    this.sum = 0;
    this.count = 0;
  }
  finish() {
    if (this.count) this.flushCells();
    return this.dB;
  }
}

export const findOnsets = (dB: readonly number[]): Onset[] => {
  const r: Onset[] = [];
  let lastIndex = -Infinity;
  for (let i = 1; i < dB.length; i++) {
    if (dB[i]! < floorDb || i - lastIndex < relogGapCells) continue;
    let minDb = Infinity;
    for (let j = Math.max(0, i - lookbackCells); j < i; j++) minDb = Math.min(minDb, dB[j]!);
    const jumpDb = dB[i]! - minDb;
    if (jumpDb >= recordThreshold) {
      r.push({ sec: Math.round(i * cellSec * 1000) / 1000, strength: Math.round(jumpDb * 10) / 10 });
      lastIndex = i;
    }
  }
  return r;
};

/** 一边的强起音在另一边容差内找不到起音的，列出来（秒） */
export const compareOnsets = (newOnsets: readonly Onset[], oldOnsets: readonly Onset[], toleranceSec: number) => {
  const findMissing = (firstOnsets: readonly Onset[], secondOnsets: readonly Onset[]) => firstOnsets.filter((a) => a.strength >= strongOnset && !secondOnsets.some((b) => Math.abs(b.sec - a.sec) <= toleranceSec + 1e-9)).map((a) => a.sec);
  return { oldOnly: findMissing(oldOnsets, newOnsets), newOnly: findMissing(newOnsets, oldOnsets) };
};

/** 认可记录里起音写成「秒@强度」 */
export const onsetToString = (x: Onset) => `${x.sec.toFixed(3)}@${x.strength.toFixed(1)}`;
export const onsetFromString = (s: string): Onset => {
  const m = /^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) throw new Error(`起音要写成「秒@强度」：${s}`);
  return { sec: Number(m[1]), strength: Number(m[2]) };
};
