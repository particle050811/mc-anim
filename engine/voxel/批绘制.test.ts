import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { 建批项, 类批, 四边形索引, 花草短面数 } from './批绘制.ts';
import { faceGroupMesh, pickDirs } from './材质.ts';

vi.mock('./真实方块图集.ts', () => ({ blockAtlas: () => ({}), blockAtlasGlsl: () => '' }));
vi.mock('./网格.ts', () => ({ posScale: 64, groupCount: 11, skirtGroupStart: 7 }));

const ctx = { SHORT: 5122, UNSIGNED_SHORT: 5123, UNSIGNED_BYTE: 5121 } as WebGL2RenderingContext;
const 面组 = (面数: number, 段 = [0, 面数]) => ({ n: 面数, pos: new Int16Array(面数 * 12), uv: new Int16Array(面数 * 8), tex: new Uint16Array(面数 * 16), col: new Uint8Array(面数 * 16), 段 });

describe('花草短索引', () => {
  it('只有花草、面数在边界内才用 16 位索引', () => {
    expect(建批项(ctx, 面组(1), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).短).toBe(true);
    expect(建批项(ctx, 面组(花草短面数), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).短).toBe(true);
    // 第 16384 个四边形要用到第 65535 号顶点，16 位索引里它是图元重启
    expect(建批项(ctx, 面组(花草短面数 + 1), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).短).toBe(false);
    expect(建批项(ctx, 面组(1), false, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).短).toBe(false);
  });
  it('两种宽度的索引是同一批三角形', () => {
    const 短 = 四边形索引(new Uint16Array(花草短面数 * 6));
    expect(短[短.length - 1]).toBe(65531);
    expect(Array.from(短.slice(0, 12))).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(Uint16Array.from(四边形索引(new Uint32Array(花草短面数 * 6)))).toEqual(短);
  });
});

describe('批项', () => {
  it('包围球和逐网格画时 three 算出来的一样', () => {
    const 原点 = [1024, -2048, 64];
    const 盒 = [1024, -2048, 64, 1024 + 128, -2048 + 128, 64 + 96];
    const 项 = 建批项(ctx, 面组(4), false, 原点, 64 / 4, 盒);
    const 网格 = faceGroupMesh(ctx, 面组(4), '水', 原点, 4, 盒)!;
    网格.updateMatrixWorld();
    const 球 = new THREE.Sphere().copy(网格.geometry.boundingSphere!).applyMatrix4(网格.matrixWorld);
    expect(项.球.center.toArray()).toEqual(球.center.toArray());
    expect(项.球.radius).toBe(球.radius);
    expect(项.缩放).toBe(网格.scale.x);
  });
  it('挑朝向并出来的段和 pickDirs 一样', () => {
    const 段 = [0, 3, 3, 10, 11, 20, 20, 26, 30, 30, 31, 40];
    const 看 = [
      [true, false, true, false, true, false, true],
      [true, true, true, true, true, true, true, false, true, false, true],
      [false, false, false, false, false, true, false],
      [false, false, false, false, false, false, false],
    ];
    for (const 看得见 of 看) {
      const 批 = new 类批(new THREE.MeshBasicMaterial(), false);
      批.加(建批项(ctx, 面组(40, 段), false, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]), 看得见);
      const 网格 = faceGroupMesh(ctx, 面组(40, 段), '水', [0, 0, 0], 1, [0, 0, 0, 1, 1, 1])!;
      pickDirs(网格, 看得见);
      expect(批.段).toEqual(网格.geometry.groups.flatMap((g) => [g.start, g.count]));
      expect(批.项.length).toBe(网格.visible ? 1 : 0);
    }
  });
});
