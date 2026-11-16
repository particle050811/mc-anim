import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildBatchItem, ClassBatch, quadIndices, plantShortFaceLimit } from './批绘制.ts';
import { faceGroupMesh, pickDirs } from './材质.ts';

vi.mock('./真实方块图集.ts', () => ({ blockAtlas: () => ({}), blockAtlasGlsl: () => '' }));
vi.mock('./网格.ts', () => ({ posScale: 64, groupCount: 12, skirtGroupStart: 8 }));

const ctx = { SHORT: 5122, UNSIGNED_SHORT: 5123, UNSIGNED_BYTE: 5121 } as WebGL2RenderingContext;
const makeFaceGroup = (faceCount: number, faceGroupStarts = [0, faceCount]) => ({ n: faceCount, pos: new Int16Array(faceCount * 12), uv: new Int16Array(faceCount * 8), tex: new Uint16Array(faceCount * 16), col: new Uint8Array(faceCount * 16), segment: faceGroupStarts });

describe('花草短索引', () => {
  it('只有花草、面数在边界内才用 16 位索引', () => {
    expect(buildBatchItem(ctx, makeFaceGroup(1), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).shortIndex).toBe(true);
    expect(buildBatchItem(ctx, makeFaceGroup(plantShortFaceLimit), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).shortIndex).toBe(true);
    // 第 16384 个四边形要用到第 65535 号顶点，16 位索引里它是图元重启
    expect(buildBatchItem(ctx, makeFaceGroup(plantShortFaceLimit + 1), true, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).shortIndex).toBe(false);
    expect(buildBatchItem(ctx, makeFaceGroup(1), false, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]).shortIndex).toBe(false);
  });
  it('两种宽度的索引是同一批三角形', () => {
    const shortIndex = quadIndices(new Uint16Array(plantShortFaceLimit * 6));
    expect(shortIndex[shortIndex.length - 1]).toBe(65531);
    expect(Array.from(shortIndex.slice(0, 12))).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(Uint16Array.from(quadIndices(new Uint32Array(plantShortFaceLimit * 6)))).toEqual(shortIndex);
  });
});

describe('批项', () => {
  it('包围球和逐网格画时 three 算出来的一样', () => {
    const origin = [1024, -2048, 64];
    const box = [1024, -2048, 64, 1024 + 128, -2048 + 128, 64 + 96];
    const batchItem = buildBatchItem(ctx, makeFaceGroup(4), false, origin, 64 / 4, box);
    const mesh = faceGroupMesh(ctx, makeFaceGroup(4), '水', origin, 4, box)!;
    mesh.updateMatrixWorld();
    const boundingSphere = new THREE.Sphere().copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    expect(batchItem.boundingSphere.center.toArray()).toEqual(boundingSphere.center.toArray());
    expect(batchItem.boundingSphere.radius).toBe(boundingSphere.radius);
    expect(batchItem.scale).toBe(mesh.scale.x);
  });
  it('挑朝向并出来的段和 pickDirs 一样', () => {
    const faceGroupStarts = [0, 3, 3, 10, 11, 20, 20, 26, 28, 30, 30, 31, 40];
    const visible = [
      [true, false, true, false, true, false, true, true],
      [true, true, true, true, true, true, true, false, false, true, false, true],
      [false, false, false, false, false, true, false, false],
      [false, false, false, false, false, false, false, true],
      [false, false, false, false, false, false, false, false],
    ];
    for (const visibleFlags of visible) {
      const batcher = new ClassBatch(new THREE.MeshBasicMaterial(), false);
      batcher.加(buildBatchItem(ctx, makeFaceGroup(40, faceGroupStarts), false, [0, 0, 0], 64, [0, 0, 0, 1, 1, 1]), visibleFlags);
      const mesh = faceGroupMesh(ctx, makeFaceGroup(40, faceGroupStarts), '水', [0, 0, 0], 1, [0, 0, 0, 1, 1, 1])!;
      pickDirs(mesh, visibleFlags);
      expect(batcher.segment).toEqual(mesh.geometry.groups.flatMap((g) => [g.start, g.count]));
      expect(batcher.items.length).toBe(mesh.visible ? 1 : 0);
    }
  });
});
