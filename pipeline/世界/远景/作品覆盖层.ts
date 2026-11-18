// 覆盖层只读世界底包和本作品的改动；不重新生成远景，也不把底包的粗高度图抄一份。
import fs from 'node:fs';
import path from 'node:path';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import { modelFileName } from '../../../engine/voxel/区段模型.ts';
import { codeRoot } from '../../环境/路径.ts';
import { workRoot, workName } from '../../环境/作品.ts';
import { dataRoot, draftRoot } from '../../环境/配置.ts';
import { readTerrainEdits } from '../作品地形改动.ts';
import { loadImportedVoxelLib } from '../体素库.ts';
import { readPackDoc, writePackDoc } from '../烘焙/包信息.ts';
import { blockFiles, sectionsInBlock, readPackModel } from '../烘焙/读区段.ts';
import { encodeSection, gridData } from '../烘焙/区段编码.ts';
import { EntryTable } from '../烘焙/条目.ts';
import { versionDir, release, packManifest, type TerrainRecord } from '../版本.ts';
import { compareTrimmed, writeTrimmed, keepFileName } from '../裁级/裁剪.ts';

export const overlayName = (world: string, work: string) => `${world}-${work}-覆盖层`;
export const bakeWorkOverlay = async (base: string, record: TerrainRecord): Promise<TerrainRecord> => {
  const pack = overlayName(base, workName());
  const edits = (await readTerrainEdits(codeRoot(), workRoot(), dataRoot()))?.filter((edit) => edit.pack === base);
  if (!edits?.length) throw Error(`${workName()} 的地形改动.ts 没有 ${base} 的改动，或缺少依赖素材`);
  const lib = await loadImportedVoxelLib(),
    P = lib.sectionPack;
  const dir = versionDir(base, record.version),
    info = readPackDoc(lib, dir),
    model = readPackModel(dir);
  const [ox, oy, oz] = info.origin;
  const cuts = edits.flatMap((edit) =>
    edit.digBoxes.map((m) => ({
      boxes: [m.from[0]! - ox, oz - 1 - m.to[2]!, m.from[1]! - oy, m.to[0]! + 1 - ox, oz - m.from[2]!, m.to[1]! + 1 - oy],
      留: m.留 ? lib.imported.globRegex(m.留) : null,
    })),
  );
  const flats = edits.flatMap((edit) => edit.flattenAreas);
  const table = new EntryTable(lib.knowledge);
  // 底包区段和覆盖区段共享底包的编号前缀；新填方状态只追加到作品表。
  info.state.forEach((s) => table.internState(s));
  info.biome.forEach((b) => table.internBiome(b));
  const tables = P.buildPackTables(info),
    ids: SectionId[] = [];
  const scratch = path.join(draftRoot(), '工作-暮色合包');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, '作品覆盖-')),
    folder = path.join(root, '完整');
  fs.mkdirSync(folder);
  try {
    for (const file of blockFiles(dir)) {
      const replacements: { id: SectionId; bytes: Uint8Array }[] = [];
      for (const row of sectionsInBlock(lib, path.join(dir, file))) {
        const { id } = row,
          [x, y, width] = lib.sections.sectionBounds(id),
          apron = 2 ** id.L;
        // 邻圈参与网格生成；跨区段边界的改动必须让两侧都重烘。
        const hits = (left: number, back: number, right: number, front: number) =>
          left < x + width + apron && right > x - apron && back < y + width + apron && front > y - apron;
        const cutBoxes = cuts.filter(({ boxes: b }) => hits(b[0]!, b[1]!, b[3]!, b[4]!));
        const flattenAreas = flats.filter((a) => hits(a.x0 - ox, oz - a.z0 - a.nz, a.x0 + a.nx - ox, oz - a.z0));
        if (!cutBoxes.length && !flattenAreas.length) continue;
        const data = row.取();
        const grid = lib.imported.importedSectionVoxels(data, { info, tables, variesByPos: [], cutBoxes, flattenAreas });
        const palette = Array.from(data.palette);
        for (let n = palette.length / 2; n < grid.palette.length; n++)
          palette.push(table.internState(lib.blockTable.blockNames[grid.palette[n]!.v - 1]!), P.noBiome);
        replacements.push({ id, bytes: encodeSection(gridData(id, grid, palette), model) });
        ids.push(id);
      }
      if (replacements.length) {
        const { ti, tj } = P.sectionInTile(replacements[0]!.id, info.coarsestLevel);
        fs.writeFileSync(path.join(folder, file), Buffer.concat(P.encodeTile(ti, tj, info.coarsestLevel, replacements)));
      }
    }
    if (!ids.length) throw Error(`${pack} 的改动未碰到任何底包区段`);
    fs.copyFileSync(path.join(dir, modelFileName), path.join(folder, modelFileName), fs.constants.COPYFILE_FICLONE);
    writePackDoc(lib, folder, {
      dimension: info.dimension,
      origin: info.origin,
      state: table.stateList,
      biome: table.biomeList,
      coarsestLevel: info.coarsestLevel,
      maps: { coarse: { cell: info.maps.coarse.cell, x0: 0, y0: 0, nx: 0, ny: 0, height: new Int16Array() } },
      extra: { overlay: { base, from: record.version, keys: ids.map(lib.sections.sectionKey) } },
    });
    const full = release(pack, folder);
    const entry: TerrainRecord = {
      version: full.version,
      source: `${base}@${record.version} + ${workName()}/地点/地形改动.ts`,
      visibility: '发布',
      license: record.license,
      ...(await packManifest(full.目录)),
    };
    if (record.trimmed) {
      const keep = new Set(
        fs
          .readFileSync(path.join(versionDir(base, record.trimmed.version), keepFileName), 'utf8')
          .trimEnd()
          .split('\n')
          .map((l) => l.replaceAll('\t', '|')),
      );
      const formal = ids.filter((q) => keep.has(lib.sections.sectionKey(q))).sort((a, b) => a.L - b.L || a.i - b.i || a.j - b.j);
      const trimmed = path.join(root, '裁级');
      fs.mkdirSync(trimmed);
      const method = '作品覆盖层：只留底包正式版保留的受影响区段';
      const keepSha256 = await writeTrimmed(full.目录, { pack, record: entry }, formal, trimmed, method);
      const checked = await compareTrimmed(full.目录, trimmed);
      if (checked.problems.length) throw Error(checked.problems.join('\n'));
      const t = release(pack, trimmed);
      entry.trimmed = { version: t.version, from: full.version, method, keepSha256, ...(await packManifest(t.目录)) };
      console.log(`${pack}：完整 ${ids.length} 块 ${entry.size} B；正式 ${checked.checked} 块 ${entry.trimmed.size} B`);
    }
    return entry;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
