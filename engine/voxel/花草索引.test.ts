import { describe, expect, it, vi } from 'vitest';
import { faceGroupMesh, type MaterialClass } from './材质.ts';

vi.mock('./真实方块图集.ts', () => ({ blockAtlas: () => ({}), blockAtlasGlsl: () => '' }));
vi.mock('./网格.ts', () => ({ posScale: 64, groupCount: 11, skirtGroupStart: 7 }));

const 索引 = (面数: number, 材质: MaterialClass) => {
  const 面组 = { n: 面数, pos: new Int16Array(面数 * 12), uv: new Int16Array(面数 * 8), tex: new Uint16Array(面数 * 16), col: new Uint8Array(面数 * 16), 段: [0, 面数] };
  const ctx = { SHORT: 5122, UNSIGNED_SHORT: 5123, UNSIGNED_BYTE: 5121 } as WebGL2RenderingContext;
  return faceGroupMesh(ctx, 面组, 材质, [0, 0, 0], 1, [0, 0, 0, 1, 1, 1])!.geometry.index!;
};

describe('花草短索引', () => {
  it('边界内共用，全部三角形与原索引相同', () => {
    const 短 = 索引(16383, '花草');
    expect(索引(1, '花草')).toBe(短);
    expect(短.array).toBeInstanceOf(Uint16Array);
    expect(短.array).toEqual(Uint16Array.from(索引(16383, '实心').array.slice(0, 16383 * 6)));
  });

  it('不把第 65535 号顶点当成短索引图元重启', () => {
    const 宽 = 索引(16384, '花草');
    expect(宽.array).toBeInstanceOf(Uint32Array);
    expect(宽.array[16384 * 6 - 1]).toBe(65535);
  });
});
