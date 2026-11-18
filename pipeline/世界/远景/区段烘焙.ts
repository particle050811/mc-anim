// 用户 11-18 定：暮色先试，保留现场生成的全部格子，不做可见变换。边块只烘用到的列，否则整块的高低极值会改变并列后的竖直范围。
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { VoxelGrid } from '../../../engine/voxel/生成.ts';
import type { DistantGrid } from '../../../engine/voxel/远景.ts';
import { modelFileName, modelBytes } from '../../../engine/voxel/区段模型.ts';
import { loadVoxelLib, type VoxelLib } from '../体素库.ts';
import { nodeDataSource } from '../node数据源.ts';
import { EntryTable } from '../烘焙/条目.ts';
import { fromColumnMajor, encodeSection } from '../烘焙/区段编码.ts';
import { learnModel } from '../烘焙/模型.ts';
import { writePackDoc } from '../烘焙/包信息.ts';
import { newStaging, release, readTerrainTable, registerTerrain, registerTerrainEntry, versionDir } from '../版本.ts';
import type { WorldDecl } from '../声明.ts';

// 染色按列选群系，不把 RGB 反查成群系号（同色的两个群系在别的位置不一定同色）。群系取中心，解码时按最小角重新染色，和 distantSection 一致。
export const farSectionData = (lib: VoxelLib, table: EntryTable, grid: DistantGrid, origin: number[], id: SectionId, v: VoxelGrid) => {
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

export const bakeFarSections = async (world: WorldDecl, columns: Map<string, string>, noRegister: boolean) => {
  const far = world.farView!, pack = far.sectionPack!, terrain = readTerrainTable().pack;
  const base = world.pack[0]!;
  const baseInfo = JSON.parse(fs.readFileSync(path.join(versionDir(base.name, terrain[base.name]!.version), '包.json'), 'utf8')) as { origin: [number, number, number]; coarsestLevel: number };
  const { origin, coarsestLevel } = baseInfo;
  const version = terrain[far.pack]!.version;
  const lib = await loadVoxelLib(), P = lib.sectionPack, grid = await lib.distant.readDistantGrid(nodeDataSource(), `terrain/${far.pack}/${version}`, far.pack);
  const table = new EntryTable(lib.knowledge), ordered = [...columns].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const rows = ordered.map(([key, mask]) => {
    const [L, i, j] = key.split('|').map(Number) as [number, number, number];
    const bits = mask === '*' ? null : Buffer.from(mask, 'base64');
    if (![i, j, L].every(Number.isSafeInteger) || L < 0 || L > coarsestLevel || (bits && bits.length !== Math.ceil(lib.sections.paddedSectionCols ** 2 / 8))) throw new Error(`远景覆盖中有无效区段或列罩：${key}`);
    return { id: { L, i, j }, want: bits ? (c: number) => !!(bits[c >> 3]! & (1 << (c & 7))) : undefined };
  });
  if (!rows.length) throw new Error('远景覆盖是空的，不烘包');
  const make = (row: typeof rows[number]) => lib.distant.distantSection(grid, origin, row.id, row.want);
  const data = (row: typeof rows[number], v: VoxelGrid) => farSectionData(lib, table, grid, origin, row.id, v);
  const byLevel = new Map<number, number>();
  const sample = rows.filter(({ id }) => { const n = byLevel.get(id.L) ?? 0; byLevel.set(id.L, n + 1); return n % 40 === 0; }).map(r => data(r, make(r)));
  const model = learnModel(() => sample);
  const tiles = new Map<string, { ti: number; tj: number; parts: { id: SectionId; bytes: Uint8Array }[] }>();
  const bounds = rows.map(r => lib.sections.sectionBounds(r.id));
  const cell = lib.sections.sectionCells;
  const x0 = Math.min(...bounds.map(b => b[0])), y0 = Math.min(...bounds.map(b => b[1]));
  const nx = (Math.max(...bounds.map(b => b[0] + b[2])) - x0) / cell, ny = (Math.max(...bounds.map(b => b[1] + b[2])) - y0) / cell;
  const height = new Int16Array(nx * ny).fill(-32768);
  for (const r of rows) {
    const v = make(r), d = data(r, v), { ti, tj } = P.sectionInTile(r.id, coarsestLevel), file = P.tileFileName(ti, tj);
    let tile = tiles.get(file);
    if (!tile) tiles.set(file, tile = { ti, tj, parts: [] });
    tile.parts.push({ id: r.id, bytes: encodeSection(d, model) });
    for (let y = 1; y < v.ny - 1; y++) for (let x = 1; x < v.nx - 1; x++) {
      const c = y * v.nx + x;
      let k = v.nz - 1;
      while (k >= 0 && !v.vox[k * v.nx * v.ny + c]) k--;
      if (k < 0) continue;
      const at = Math.floor((v.origin[1] + (y - 1) * v.cell - y0) / cell) * nx + Math.floor((v.origin[0] + (x - 1) * v.cell - x0) / cell);
      height[at] = Math.max(height[at]!, v.origin[2] + (k + 1) * v.cell);
    }
  }
  // 各级区段中心都落在半个 L0 边长的格点上。存旧采样器在这些点的值，不拿方块顶（含树冠）替代选级用的地面。
  const step = cell / 2;
  const sampleX = Math.floor((grid.x0 - origin[0] - grid.step) / step) * step;
  const sampleY = Math.floor((origin[2] - grid.z0 - grid.nz * grid.step) / step) * step;
  const sampleNx = Math.ceil((grid.x0 + grid.nx * grid.step - origin[0] - sampleX) / step) + 1;
  const sampleNy = Math.ceil((origin[2] - grid.z0 + grid.step - sampleY) / step) + 1;
  const sampler = lib.sampler.fallbackSampler({ cell, x0: 0, y0: 0, nx: 0, ny: 0, height: new Int16Array() }, grid, null, origin);
  const samples = Int16Array.from({ length: sampleNx * sampleNy }, (_, i) => sampler(sampleX + (i % sampleNx) * step, sampleY + Math.floor(i / sampleNx) * step));
  const pick = P.encodePackMaps({ coarse: { cell: step, x0: sampleX, y0: sampleY, nx: sampleNx, ny: sampleNy, height: samples } });
  const pickInfo = { coarseHeight: pick.coarseHeight, outside: sampler(sampleX - step, sampleY - step), groundMax: lib.sampler.fallbackHeightRange([-Infinity, -Infinity], grid, origin, 0)[1], waterLevel: grid.seaLevel - origin[1] };
  const staging = newStaging(pack);
  try {
    for (const [name, t] of tiles) fs.writeFileSync(path.join(staging.dir, name), Buffer.concat(P.encodeTile(t.ti, t.tj, coarsestLevel, t.parts)));
    fs.writeFileSync(path.join(staging.dir, modelFileName), modelBytes(model));
    fs.writeFileSync(path.join(staging.dir, '选级.bin.gz'), gzipSync(pick.bytes, { level: 9 }));
    writePackDoc(lib, staging.dir, { dimension: world.packDimension, origin, state: table.stateList, biome: table.biomeList, coarsestLevel, maps: { coarse: { cell, x0, y0, nx, ny, height } }, extra: { farColumns: Object.fromEntries(ordered), farPick: pickInfo } });
    const out = release(pack, staging.dir);
    const entry = await registerTerrainEntry(pack, out.version, { source: `${far.pack}@${version}，anim world bake-far ${world.displayName} 按镜头覆盖烘焙`, license: terrain[far.pack]!.license, visibility: '私有', note: '暮色试点，仅本地登记，不随 Release 分发' });
    if (!noRegister) registerTerrain(pack, entry);
    console.log(`${pack}@${out.version}：${rows.length} 个区段，${entry.size} 字节，${noRegister ? '未登记' : '已本地登记'}`);
    return out.目录;
  } finally { staging.放(); }
};
