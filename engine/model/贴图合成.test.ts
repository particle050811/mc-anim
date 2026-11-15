import { describe, expect, it } from 'vitest';
import { overlayTextures } from './贴图合成.ts';

const makeImage = (...pixels: number[][]) => ({ w: pixels.length, h: 1, px: new Uint8Array(pixels.flat()) });

describe('叠贴图', () => {
  it('不透明盖住、透明露底、半透明按 alpha 混', () => {
    const bottomTex = makeImage([10, 20, 30, 255], [10, 20, 30, 255], [0, 0, 0, 255], [0, 0, 0, 0]);
    const overlay = makeImage([200, 0, 0, 255], [0, 0, 0, 0], [255, 255, 255, 51], [90, 90, 90, 255]);
    expect([...overlayTextures([bottomTex, overlay]).px]).toEqual([200, 0, 0, 255, 10, 20, 30, 255, 51, 51, 51, 255, 90, 90, 90, 255]);
  });

  it('一层原样返回，尺寸不一样报错，不改输入', () => {
    const bottomTex = makeImage([1, 2, 3, 255]);
    expect(overlayTextures([bottomTex])).toBe(bottomTex);
    expect(() => overlayTextures([bottomTex, makeImage([0, 0, 0, 255], [0, 0, 0, 255])])).toThrow(/尺寸/);
    overlayTextures([bottomTex, makeImage([9, 9, 9, 255])]);
    expect([...bottomTex.px]).toEqual([1, 2, 3, 255]);
  });
});
