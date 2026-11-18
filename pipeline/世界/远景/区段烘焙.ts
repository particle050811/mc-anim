import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { VoxelGrid } from '../../../engine/voxel/生成.ts';
import type { DistantGrid } from '../../../engine/voxel/远景.ts';
import { type FarVoxelLib } from '../体素库.ts';
import { EntryTable } from '../烘焙/条目.ts';
import { fromColumnMajor } from '../烘焙/区段编码.ts';

// 染色按列选群系，不把 RGB 反查成群系号（同色的两个群系在别的位置不一定同色）。群系取中心，解码时按最小角重新染色，和 distantSection 一致。
export const farSectionData = (lib: FarVoxelLib, table: EntryTable, grid: DistantGrid, origin: number[], id: SectionId, v: VoxelGrid) => {
  const cols = v.nx * v.ny, cm = new Uint16Array(cols * v.nz), palette = [0, lib.sectionPack.noBiome];
  const states = v.palette.map(p => p.v ? table.internState(lib.blockTable.blockNames[p.v - 1]!) : 0);
  const local = new Map<number, number>();
  for (let c = 0; c < cols; c++) {
    const x = v.origin[0] + ((c % v.nx) - 0.5) * v.cell + origin[0]!;
    const z = origin[2]! - v.origin[1] - (Math.floor(c / v.nx) - 0.5) * v.cell;
    let biome: number | undefined;
    for (let k = 0; k < v.nz; k++) {
      const p = v.vox[k * cols + c]!;
      if (!p) continue;
      const st = states[p]!, bi = lib.knowledge.tint[v.palette[p]!.v] ? (biome ??= table.internBiome(lib.distant.distantBiome(grid, x, z))) : lib.sectionPack.noBiome;
      const key = st * 65536 + bi;
      let n = local.get(key);
      if (n === undefined) { n = palette.length / 2; palette.push(st, bi); local.set(key, n); }
      cm[c * v.nz + k] = n;
    }
  }
  return fromColumnMajor(id, v.origin[2] / v.cell, v.nz, cm, palette, cols);
};
