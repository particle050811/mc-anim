import { describe, expect, it } from 'vitest';
import { entityTexture } from './贴图方盒.tsx';
import { toVanillaCoords, textureScale } from './贴图倍数.ts';

const makeImage = (w: number, h: number) => ({ w, h, px: new Uint8Array(w * h * 4) });

describe('贴图倍数', () => {
  it('整数倍才认', () => {
    expect(textureScale(makeImage(64, 64), [64, 64])).toBe(1);
    expect(textureScale(makeImage(128, 64), [64, 32])).toBe(2);
    expect(() => textureScale(makeImage(96, 96), [64, 64])).toThrow('整数倍');
    expect(() => textureScale(makeImage(128, 64), [64, 64])).toThrow('整数倍');
  });

  it('原版尺寸原样返回；高清图换成带 k 倍 uv 缩放的新对象，原图的贴图不动', () => {
    const originalImage = makeImage(64, 64);
    expect(toVanillaCoords(originalImage, [64, 64])).toBe(originalImage);
    const image = makeImage(128, 128);
    const converted = toVanillaCoords(image, [64, 64]);
    expect(converted).not.toBe(image);
    expect(converted.px).toBe(image.px);
    expect(toVanillaCoords(image, [64, 64])).toBe(converted);
    expect(entityTexture(converted).repeat.toArray()).toEqual([2, 2]);
    expect(entityTexture(image).repeat.toArray()).toEqual([1, 1]);
  });
});
