// PNG 的像素 sha：取材脚本经 Pillow 重编码，换个 Pillow（或 zlib）版本，压缩出来的字节会变、像素不变。
// anim extract 核对产物时，文件 sha 和锁不一样、两边都是 PNG 的，再比像素 sha：一样就算一致（锁里留原来那份字节，不换）。
// 像素 sha = sha256(「宽x高:位深」+ 展开成 RGBA 的像素)：调色板、灰度、有没有 alpha 通道这些编码差别都抹平，只比画出来的颜色。
import crypto from 'node:crypto';
import { convertIndexedToRgb, decode, hasPngSignature } from 'fast-png';

/** 不是 PNG 或解不开返回 null */
export const 像素sha = (字节: Uint8Array): string | null => {
  if (!hasPngSignature(字节)) return null;
  let png: ReturnType<typeof decode>;
  try {
    png = decode(字节);
  } catch {
    return null;
  }
  const { width: 宽, height: 高 } = png;
  const n = 宽 * 高;
  let 深 = png.depth;
  let 源: ArrayLike<number> = png.data;
  let 通道 = png.channels;
  if (png.palette) {
    源 = convertIndexedToRgb(png);
    通道 = png.palette[0]?.length ?? 3;
    深 = 8;
  }
  // 1、2、4 位灰度 fast-png 给的是没拆开的字节，不比（当作比不了，退回按文件 sha）
  if (深 < 8) return null;
  const 最大 = 深 === 16 ? 65535 : 255;
  const 出 = 深 === 16 ? new Uint16Array(n * 4) : new Uint8Array(n * 4);
  // tRNS：灰度、RGB 图里等于这个颜色的像素算全透明（fast-png 把它放在 transparency）
  const 透明色 = !png.palette && png.transparency && (通道 === 1 || 通道 === 3) ? [...png.transparency] : null;
  for (let i = 0; i < n; i++) {
    const 取 = (c: number) => 源[i * 通道 + c]!;
    let r: number, g: number, b: number, a: number;
    if (通道 === 1 || 通道 === 2) {
      r = g = b = 取(0);
      a = 通道 === 2 ? 取(1) : 透明色 && 取(0) === 透明色[0] ? 0 : 最大;
    } else {
      r = 取(0);
      g = 取(1);
      b = 取(2);
      a = 通道 === 4 ? 取(3) : 透明色 && r === 透明色[0] && g === 透明色[1] && b === 透明色[2] ? 0 : 最大;
    }
    出[i * 4] = r;
    出[i * 4 + 1] = g;
    出[i * 4 + 2] = b;
    出[i * 4 + 3] = a;
  }
  return crypto
    .createHash('sha256')
    .update(`${宽}x${高}:${深 === 16 ? 16 : 8}\n`)
    .update(new Uint8Array(出.buffer, 出.byteOffset, 出.byteLength))
    .digest('hex');
};

/** 两份字节画出来一样：都是 PNG、像素 sha 相等 */
export const 像素一致 = (甲: Uint8Array, 乙: Uint8Array) => {
  const a = 像素sha(甲);
  return a !== null && a === 像素sha(乙);
};
