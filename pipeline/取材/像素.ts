// PNG 的像素 sha：取材脚本经 Pillow 重编码，换个 Pillow（或 zlib）版本，压缩出来的字节会变、像素不变。
// anim extract 核对产物时，文件 sha 和锁不一样、两边都是 PNG 的，再比像素 sha：一样就算一致（锁里留原来那份字节，不换）。
// 像素 sha = sha256(「宽x高:位深」+ 展开成 RGBA 的像素)：调色板、灰度、有没有 alpha 通道这些编码差别都抹平，只比画出来的颜色。
import crypto from 'node:crypto';
import { convertIndexedToRgb, decode, hasPngSignature } from 'fast-png';

/** 不是 PNG 或解不开返回 null */
export const pixelSha = (bytes: Uint8Array): string | null => {
  if (!hasPngSignature(bytes)) return null;
  let png: ReturnType<typeof decode>;
  try {
    png = decode(bytes);
  } catch {
    return null;
  }
  const { width: width, height: height } = png;
  const n = width * height;
  let bitDepth = png.depth;
  let pixelSource: ArrayLike<number> = png.data;
  let channels = png.channels;
  if (png.palette) {
    pixelSource = convertIndexedToRgb(png);
    channels = png.palette[0]?.length ?? 3;
    bitDepth = 8;
  }
  // 1、2、4 位灰度 fast-png 给的是没拆开的字节，不比（当作比不了，退回按文件 sha）
  if (bitDepth < 8) return null;
  const maxChannel = bitDepth === 16 ? 65535 : 255;
  const pixels = bitDepth === 16 ? new Uint16Array(n * 4) : new Uint8Array(n * 4);
  // tRNS：灰度、RGB 图里等于这个颜色的像素算全透明（fast-png 把它放在 transparency）
  const transparentColor = !png.palette && png.transparency && (channels === 1 || channels === 3) ? [...png.transparency] : null;
  for (let i = 0; i < n; i++) {
    const channelAt = (c: number) => pixelSource[i * channels + c]!;
    let r: number, g: number, b: number, a: number;
    if (channels === 1 || channels === 2) {
      r = g = b = channelAt(0);
      a = channels === 2 ? channelAt(1) : transparentColor && channelAt(0) === transparentColor[0] ? 0 : maxChannel;
    } else {
      r = channelAt(0);
      g = channelAt(1);
      b = channelAt(2);
      a = channels === 4 ? channelAt(3) : transparentColor && r === transparentColor[0] && g === transparentColor[1] && b === transparentColor[2] ? 0 : maxChannel;
    }
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return crypto
    .createHash('sha256')
    .update(`${width}x${height}:${bitDepth === 16 ? 16 : 8}\n`)
    .update(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength))
    .digest('hex');
};

/** 两份字节画出来一样：都是 PNG、像素 sha 相等 */
export const pixelsMatch = (firstPixels: Uint8Array, secondPixels: Uint8Array) => {
  const a = pixelSha(firstPixels);
  return a !== null && a === pixelSha(secondPixels);
};
