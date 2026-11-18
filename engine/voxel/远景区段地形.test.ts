import { describe, expect, it, vi } from 'vitest';
import { buildBakedFarTerrain } from './远景区段地形.ts';
import type { ImportedTerrain } from './导入地形.ts';
import type { VoxelGrid } from './生成.ts';

const q = { L: 0, i: 0, j: 0 };
const coarse = { cell: 32, x0: 0, y0: 0, nx: 1, ny: 1, height: Int16Array.of(-32768) };
const grid = (indices: number[], bottom = 0): VoxelGrid => ({ nx: 2, ny: 1, nz: 1, cell: 1, vox: Uint16Array.from(indices), origin: [0, 0, bottom], palette: [{ v: 0, c: [255, 255, 255] }, { v: 1, c: [12, 34, 56] }] });
const terrain = (v: VoxelGrid | null, offset?: number) => ({
  key: '试验', origin: [0, 0, 0], heightRange: [-32, 60], coarse,
  source: { coarsestLevel: 6, sections: vi.fn(() => v) },
  far: { bytes: Uint8Array.of(2), columns: offset === undefined ? {} : { '0|0|0': offset }, pick: coarse, outside: 31, groundMax: 66, waterLevel: 0 },
}) as unknown as ImportedTerrain;

describe('按实测空列读远景', () => {
  it('主包优先，只补空列，挖地标挖空的列不补', () => {
    const inside = grid([0, 0], 1);
    inside.carveMask = Uint8Array.of(1, 0);
    const landmarks = terrain(grid([1, 1]));
    const world = buildBakedFarTerrain(terrain(inside), landmarks, terrain(grid([0, 1]), 0), 50);
    const out = world.source.sections(q)!;
    expect(landmarks.source.sections).not.toHaveBeenCalled();
    expect([out.origin[2], out.nz]).toEqual([0, 2]);
    expect(Array.from(out.vox, p => out.palette[p].v)).toEqual([0, 1, 0, 0]);
  });
  it('缺级或空列变化就停，不降级也不现场造；整块兜底恢复水位', () => {
    const none = terrain(null), far = terrain(grid([1, 1]), -1);
    const whole = buildBakedFarTerrain(none, none, far, 50);
    expect(whole.source.sections(q)!.waterLevel).toBe(0);
    expect(() => whole.source.sections({ ...q, L: 1 })).toThrow('1|0|0');
    expect(() => buildBakedFarTerrain(terrain(grid([1, 0])), none, far, 50).source.sections(q)).toThrow('空列已变');
  });
});
