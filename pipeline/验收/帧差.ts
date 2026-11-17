// anim verify frames --compare 的「差多少」（用户 11-16 要：只改 pipeline/ 的改动段不过期、认指纹管不到，只能靠逐帧比，以前只报哪几帧 sha 不同）。
// 两张无损 PNG 逐像素比：差像素占比（任一通道差 > 0、> 8、> 32）、最大差，加 anim reuse 同一套块平均差（比较.ts 的 computeBlockDiff、judgeBlockDiff，门槛 verify/阈值.toml）。
// 只报数，判过不过还是逐字节（预期差是 0，见 docs/决策/0013）；--tolerance 才按最大差放行。只比 RGB：Remotion 出的帧不透明，alpha 不看。
import { convertIndexedToRgb, decode } from 'fast-png';
import { computeBlockDiff, judgeBlockDiff, type BlockDiff, type BlockVerdict, type DiffIntegral, type Threshold } from './比较.ts';

/** 「任一通道差 > 级」的几档 */
export const pixelLevels = [0, 8, 32] as const;
export type PixelLevel = (typeof pixelLevels)[number];

export type FrameDiff = { pixelCount: number; over: Record<PixelLevel, number>; maxDiff: number; block: BlockDiff; verdict: BlockVerdict };

/** PNG → rgb24（调色板、灰度、16 位都换成 8 位 RGB；1、2、4 位灰度不认） */
export const pngToRgb = (bytes: Uint8Array): { width: number; height: number; rgb: Buffer } => {
  const png = decode(bytes);
  const { width, height } = png;
  let data: ArrayLike<number> = png.data;
  let channels: number = png.channels;
  let depth: number = png.depth;
  if (png.palette) {
    data = convertIndexedToRgb(png);
    channels = png.palette[0]?.length ?? 3;
    depth = 8;
  }
  if (depth !== 8 && depth !== 16) throw new Error(`${depth} 位的 PNG 不认`);
  const shift = depth === 16 ? 8 : 0;
  const n = width * height;
  const rgb = Buffer.allocUnsafe(n * 3);
  for (let i = 0; i < n; i++) {
    const s = i * channels;
    if (channels <= 2) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = data[s]! >> shift;
    else {
      rgb[i * 3] = data[s]! >> shift;
      rgb[i * 3 + 1] = data[s + 1]! >> shift;
      rgb[i * 3 + 2] = data[s + 2]! >> shift;
    }
  }
  return { width, height, rgb };
};

/** 新、旧两张 PNG 差多少；尺寸不同抛错 */
export const frameDiff = (newPng: Uint8Array, oldPng: Uint8Array, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold' | 'glanceThreshold'>): FrameDiff => {
  const a = pngToRgb(newPng);
  const b = pngToRgb(oldPng);
  if (a.width !== b.width || a.height !== b.height) throw new Error(`尺寸不同：基准 ${b.width}×${b.height}，这次 ${a.width}×${a.height}`);
  return rgbFrameDiff(a.rgb, b.rgb, a.width, a.height, threshold);
};

/** 新、旧两帧 rgb24 差多少（anim diff 解好的帧也走这里；积分图已经建好的传进来省一遍） */
export const rgbFrameDiff = (newRgb: Buffer, oldRgb: Buffer, width: number, height: number, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold' | 'glanceThreshold'>, integralImage?: DiffIntegral): FrameDiff => {
  const pixelCount = width * height;
  const over: Record<PixelLevel, number> = { 0: 0, 8: 0, 32: 0 };
  let maxDiff = 0;
  for (let i = 0; i < pixelCount * 3; i += 3) {
    const d = Math.max(Math.abs(newRgb[i]! - oldRgb[i]!), Math.abs(newRgb[i + 1]! - oldRgb[i + 1]!), Math.abs(newRgb[i + 2]! - oldRgb[i + 2]!));
    if (d === 0) continue;
    over[0]++;
    if (d > 8) over[8]++;
    if (d > 32) over[32]++;
    if (d > maxDiff) maxDiff = d;
  }
  const block = computeBlockDiff(newRgb, oldRgb, width, height, integralImage);
  return { pixelCount, over, maxDiff, block, verdict: judgeBlockDiff(block, threshold) };
};

/** 占比写成百分数；很少的带像素数（「29 个像素差 1 级」这种要看得出来） */
export const ratioText = (count: number, total: number) => {
  if (!count) return '0';
  const p = (count / total) * 100;
  return `${p >= 0.1 ? p.toFixed(2) : p.toPrecision(2)}%${count < 1000 ? `（${count} 像素）` : ''}`;
};

export const frameDiffText = (d: FrameDiff) =>
  `差像素 >0 ${ratioText(d.over[0], d.pixelCount)}、>8 ${ratioText(d.over[8], d.pixelCount)}、>32 ${ratioText(d.over[32], d.pixelCount)}，最大差 ${d.maxDiff} 级；` +
  `块平均差 16×16 ${d.block[16].差.toFixed(1)}、64×64 ${d.block[64].差.toFixed(1)}、8×8 ${d.block[8].差.toFixed(1)}（按 reuse 的门槛：${d.verdict}）`;

/** 越差越靠前：先比 16×16 块差，再比最大差、差像素数 */
export const worseFirst = (x: FrameDiff, y: FrameDiff) => y.block[16].差 - x.block[16].差 || y.maxDiff - x.maxDiff || y.over[0] - x.over[0];
