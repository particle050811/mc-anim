import { describe, expect, it } from 'vitest';
import { entityTexture } from './贴图方盒.tsx';
import { 按原版坐标, 贴图倍数 } from './贴图倍数.ts';

const 图 = (w: number, h: number) => ({ w, h, px: new Uint8Array(w * h * 4) });

describe('贴图倍数', () => {
  it('整数倍才认', () => {
    expect(贴图倍数(图(64, 64), [64, 64])).toBe(1);
    expect(贴图倍数(图(128, 64), [64, 32])).toBe(2);
    expect(() => 贴图倍数(图(96, 96), [64, 64])).toThrow('整数倍');
    expect(() => 贴图倍数(图(128, 64), [64, 64])).toThrow('整数倍');
  });

  it('原版尺寸原样返回；高清图换成带 k 倍 uv 缩放的新对象，原图的贴图不动', () => {
    const 原 = 图(64, 64);
    expect(按原版坐标(原, [64, 64])).toBe(原);
    const 高 = 图(128, 128);
    const 换 = 按原版坐标(高, [64, 64]);
    expect(换).not.toBe(高);
    expect(换.px).toBe(高.px);
    expect(按原版坐标(高, [64, 64])).toBe(换);
    expect(entityTexture(换).repeat.toArray()).toEqual([2, 2]);
    expect(entityTexture(高).repeat.toArray()).toEqual([1, 1]);
  });
});
