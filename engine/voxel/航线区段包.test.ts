import { describe, expect, it, vi } from 'vitest';
import { resolveRouteSections, limitToOriginal } from './航线区段包.ts';
import type { VoxelGrid } from './生成.ts';

describe('稀疏航线包', () => {
  it('负坐标缺子块取最近可用祖先，同一块地不叠两级；猜取不消耗正式告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const resolve = resolveRouteSections(new Set(['0|-1|0', '1|-1|0', '2|-1|0']), 2);
      const requests = [
        { L: 0, i: -2, j: 0 },
        { L: 0, i: -1, j: 0 },
      ];
      expect(resolve(requests, true)).toEqual([{ L: 1, i: -1, j: 0 }]);
      expect(warn).not.toHaveBeenCalled();
      expect(resolve(requests)).toEqual([{ L: 1, i: -1, j: 0 }]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('0|-2|0→1|-1|0'));
      resolve(requests);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
  it('关远景后剔除边块的填补列，并恢复仅真实区段原有的竖直范围', () => {
    const grid: VoxelGrid = { nx: 2, ny: 1, nz: 3, cell: 2, origin: [0, 0, -2], palette: [], vox: Uint16Array.of(1, 3, 1, 3, 0, 3) };
    const edge = { empty: 'Ag==', bottom: 0, nz: 1 };
    const real = limitToOriginal(grid, edge, false);
    expect([real.origin[2], real.nz, ...real.vox]).toEqual([0, 1, 1, 0]);
    expect([...limitToOriginal(grid, edge, true).vox]).toEqual([1, 0, 1, 0, 0, 0]);
  });
});
