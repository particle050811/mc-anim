// 材质包的高清实体贴图（箱子 128×128、告示牌 128×64…）是原版的整数倍；TexBox（贴图方盒.tsx）按贴图实际宽高算 uv，按原版像素写坐标的模型直接用会只取到左上一角。
// 这里不改模型、不改 TexBox：给同一张图一个新的像素对象，它的 three 贴图带 k 倍 uv 缩放，TexBox 算出的 uv 乘 k 正好落回原版坐标（k 是 2 的幂，乘法不丢精度）。
// 为什么不在模型里乘倍数：库/物品/箱子.tsx、贴图方盒.tsx 在应力转动的段闭包里，改一个字那些段就过期（用户 11-02 要材质包和不用包的段解耦）。
import type { Png } from './贴图.ts';
import { entityTexture } from './贴图方盒.tsx';

/** 贴图是原版（原宽 × 原高）的几倍；不是整数倍、宽高倍数不一样就报错 */
export const textureScale = (texture: { w: number; h: number }, [origWidth, origHeight]: readonly [number, number]): number => {
  const k = texture.w / origWidth;
  if (!Number.isInteger(k) || k < 1 || texture.h !== origHeight * k) throw new Error(`贴图 ${texture.w}×${texture.h} 不是原版 ${origWidth}×${origHeight} 的整数倍`);
  return k;
};

const scaledCache = new WeakMap<Png, Png>();
/** 给按原版像素写坐标、交给 TexBox 的模型用（<Chest 贴图={按原版坐标(VANILLA_CHEST_TEX, [64, 64])} />）。原版尺寸的图原样返回，画面和指纹都不动 */
export const toVanillaCoords = (texture: Png, origSize: readonly [number, number]): Png => {
  const k = textureScale(texture, origSize);
  if (k === 1) return texture;
  let scaled = scaledCache.get(texture);
  if (!scaled) {
    scaled = { ...texture };
    entityTexture(scaled).repeat.set(k, k);
    scaledCache.set(texture, scaled);
  }
  return scaled;
};
