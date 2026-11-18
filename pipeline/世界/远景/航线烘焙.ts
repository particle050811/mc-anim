// 世界底包只合并存档、远地标和模拟区段，不读作品登记。
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { BoundaryColumns, RouteIndex } from '../../../engine/voxel/航线区段包.ts';
import type { SectionContext } from '../../../engine/voxel/导入区段.ts';
import { modelFileName } from '../../../engine/voxel/区段模型.ts';
import { loadFarVoxelLib } from '../体素库.ts';
import { EntryTable } from '../烘焙/条目.ts';
import { encodeSection, gridData } from '../烘焙/区段编码.ts';
import { walkSections, readPackModel } from '../烘焙/读区段.ts';
import { readPackDoc, writePackDoc } from '../烘焙/包信息.ts';
import { readTerrainTable, registerTerrainEntry, versionDir, release, packManifest, type TerrainRecord } from '../版本.ts';
import { compareTrimmed, keepTable, writeTrimmed, routeTrimMethod } from '../裁级/裁剪.ts';
import { nodeDataSource } from '../node数据源.ts';
import { draftRoot } from '../../环境/配置.ts';
import { farSectionData } from './区段烘焙.ts';
import type { WorldDecl } from '../声明.ts';
import { copyTerrain, parentTerrain } from './照抄.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';

// 看片分界：L3 替换会明显改变两帧望远的林冠；L4 起基本只改地平线。正式保真版不按这道门槛替换。
export const simulateFromLevel = 4;
export const routeIndexFile = '航线.json.gz';
const maskText = (mask: Uint8Array) => {
  const bits = Buffer.alloc(Math.ceil(mask.length / 8));
  mask.forEach((v, c) => (bits[c >> 3]! |= v << (c & 7)));
  return bits.toString('base64');
};
const idFromKey = (key: string): SectionId => {
  const [L, i, j] = key.split('|').map(Number) as [number, number, number];
  return { L, i, j };
};

export const bakeRoutePacks = async (world: WorldDecl, used: Set<string>, levels: number[], scratch: string = path.join(draftRoot(), '工作-暮色合包'), copy = false) => {
  const far = world.farView!,
    pack = far.sectionPack!,
    base = world.pack[0]!.name,
    land = far.landmarkPack!;
  const lib = await loadFarVoxelLib(),
    P = lib.sectionPack;
  // 并列也给主世界渲染使用，加载方块表的 Node 钩子注册完才能导入。
  const { emptyColumns, mergeColumns } = lib.merge;
  const { sectionKey } = lib.sections;
  const registry = readTerrainTable().pack,
    dir = (n: string) => versionDir(n, registry[n]!.version);
  const info = readPackDoc(lib, dir(base)),
    lm = readPackDoc(lib, dir(land)),
    model = readPackModel(dir(base));
  const { origin, coarsestLevel } = info,
    [ox, oy, oz] = origin;
  if (origin.some((v, i) => v !== lm.origin[i]) || coarsestLevel !== lm.coarsestLevel) throw Error('扩展、远地标的原点和最粗级必须相同');
  const grid = await lib.distant.readDistantGrid(nodeDataSource(), `terrain/${far.pack}/${registry[far.pack]!.version}`, far.pack);
  const table = new EntryTable(lib.knowledge);
  info.state.forEach((s) => table.internState(s));
  info.biome.forEach((b) => table.internBiome(b));
  const stateMap = lm.state.map((s) => table.internState(s)),
    biomeMap = lm.biome.map((b) => table.internBiome(b));
  const cleanContext = (source: typeof info): SectionContext => ({ info: source, tables: P.buildPackTables(source), variesByPos: [], cutBoxes: [], flattenAreas: [] });
  const baseContext = cleanContext(info), landmarkContext = cleanContext(lm);
  // 完整版留原来可查的真实区段；存档外只做航线及其所有祖先，另铺全幅最粗一级。不是把整个远景生成 L0。
  type Raw = ReturnType<typeof walkSections> extends Generator<infer T> ? T : never;
  const originals = new Map<string, { row: Raw; base: boolean }>();
  for (const name of [land, base]) for (const row of walkSections(lib, dir(name))) originals.set(sectionKey(row.id), { row, base: name === base });
  const keys = new Set([...originals.keys(), ...used]);
  for (const key of keys) {
    const q = idFromKey(key);
    if (q.L < coarsestLevel) keys.add(sectionKey({ L: q.L + 1, i: q.i >> 1, j: q.j >> 1 }));
  }
  const w = 64 * 2 ** coarsestLevel;
  for (let i = Math.floor((grid.x0 - ox) / w); i <= Math.floor((grid.x0 + (grid.nx - 1) * grid.step - ox) / w); i++)
    for (let j = Math.floor((oz - grid.z0 - (grid.nz - 1) * grid.step) / w); j <= Math.floor((oz - grid.z0) / w); j++)
      keys.add(sectionKey({ L: coarsestLevel, i, j }));
  const coarse = info.maps.coarse,
    cell = coarse.cell,
    step = 32;
  // 旧远景只在 32 米选级格点采样，扩展范围内永远优先用原来的 16 米格；两图都不取平均。
  const x0 = Math.floor((grid.x0 - ox - grid.step) / step) * step,
    y0 = Math.floor((oz - grid.z0 - grid.nz * grid.step) / step) * step;
  const nx = Math.ceil((grid.x0 + grid.nx * grid.step - ox - x0) / cell) + 2,
    ny = Math.ceil((oz - grid.z0 + grid.step - y0) / cell) + 2;
  const fallback = lib.sampler.fallbackSampler({ ...coarse, nx: 0, ny: 0 }, grid, null, origin);
  const height = Int16Array.from({ length: nx * ny }, (_, n) => {
    const x = x0 + (n % nx) * cell,
      y = y0 + Math.floor(n / nx) * cell;
    const v = P.coarseHeightAt(coarse, x, y);
    return v === -Infinity ? fallback(Math.floor(x / step) * step, Math.floor(y / step) * step) : v;
  });
  const max = (h: Int16Array) => h.reduce((a, b) => Math.max(a, b), -Infinity),
    maxTop = lib.sampler.fallbackHeightRange([-32, max(coarse.height)], grid, origin, 50, max(lm.maps.coarse.height))[1];
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, '航线包-')),
    stages = levels.map((L, n) => {
      const folder = path.join(root, String(n));
      fs.mkdirSync(folder);
      return { L, folder, simulated: [] as string[] };
    });
  const edges: Record<string, BoundaryColumns> = {};
  const copyLeaf = copy && copyTerrain(lib, table, grid, origin, [...originals.values()].filter(v => v.base).map(v => v.row), world.visible.faithful.map(v => v.boxes));
  const cache = new Map<string, SectionData>();
  const copied = (id: SectionId): SectionData => {
    const key = sectionKey(id), cached = cache.get(key);
    if (cached) return cached;
    if (!copyLeaf) throw Error('未启用照抄');
    const item = originals.get(key);
    const fill = () => id.L > 3 ? parentTerrain(lib, table, id, copied) : copyLeaf(id);
    let data: SectionData;
    if (!item) data = fill();
    else {
      data = item.row.取();
      const vox = lib.imported.importedSectionVoxels(data,item.base ? baseContext : landmarkContext), mask = emptyColumns(vox);
      if (!item.base) data = { ...data, palette: data.palette.map((v,n) => n%2 ? (v === P.noBiome ? v : biomeMap[v]!) : stateMap[v]!) };
      if (mask) {
        if (item.base) edges[key] = { bottom: vox.origin[2]/vox.cell,nz:vox.nz,empty:maskText(mask) };
        const other = fill();
        if (id.L > 3) data = other;
        else {
          const sv = P.sectionToVoxels(other,{value:new Uint16Array(table.stateList.length),色:()=>[255,255,255]});
          data = gridData(id,mergeColumns(vox,sv,mask),[...data.palette,...other.palette.slice(2),table.internState('minecraft:stone'),P.noBiome]);
        }
      }
    }
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key,data);
    return data;
  };
  const keep = await keepTable(used, keys, coarsestLevel, coarsestLevel),
    tiles = new Map<string, SectionId[]>();
  for (const key of keys) {
    const q = idFromKey(key),
      { ti, tj } = P.sectionInTile(q, coarsestLevel),
      f = P.tileFileName(ti, tj);
    if (!tiles.has(f)) tiles.set(f, []);
    tiles.get(f)!.push(q);
  }
  try {
    for (const [file, ids] of tiles) {
      const { ti, tj } = P.sectionInTile(ids[0]!, coarsestLevel),
        parts = stages.map(() => [] as { id: SectionId; bytes: Uint8Array }[]);
      for (const id of ids) {
        const key = sectionKey(id),
          original = originals.get(key);
        if (copy) {
          const data = copied(id);
          parts[0]!.push({id, bytes: original?.base && !edges[key] ? original.row.bytes : encodeSection(data, model)});
          if (!original) stages[0]!.simulated.push(key);
          continue;
        }
        let realBytes: Uint8Array | undefined, simBytes: Uint8Array | undefined;
        const sim = (mask?: Uint8Array) => lib.distant.distantSection(grid, origin, id, mask ? (c) => !!mask[c] : undefined);
        if (original) {
          const d = original.row.取(),
            ctx = original.base ? baseContext : landmarkContext,
            v = lib.imported.importedSectionVoxels(d, ctx),
            mask = emptyColumns(v);
          if (mask && original.base) edges[key] = { bottom: v.origin[2] / v.cell, nz: v.nz, empty: maskText(mask) };
          if (levels.some((L) => id.L < L)) {
            let data = d;
            const palette = Array.from(d.palette);
            if (!original.base)
              for (let k = 0; k < palette.length; k += 2) {
                palette[k] = stateMap[palette[k]!]!;
                if (palette[k + 1] !== P.noBiome) palette[k + 1] = biomeMap[palette[k + 1]!]!;
              }
            if (mask) {
              const fill = sim(mask),
                sd = farSectionData(lib, table, grid, origin, id, fill);
              // 两边的调色板编号不能互换：给并列函数一份和编码调色板编号相同的体素块，颜色在最后按原群系解。
              const sv = P.sectionToVoxels(sd, { value: new Uint16Array(table.stateList.length), 色: () => [255, 255, 255] });
              const merged = mergeColumns(v, sv, mask);
              data = gridData(id, merged, [...palette, ...sd.palette.slice(2), table.internState('minecraft:stone'), P.noBiome]);
            } else if (!original.base) data = { ...d, palette: Uint16Array.from(palette) };
            realBytes = data === d && original.base ? original.row.bytes : encodeSection(data, model);
          }
        }
        if (!original || levels.some((L) => id.L >= L)) simBytes = encodeSection(farSectionData(lib, table, grid, origin, id, sim()), model);
        stages.forEach((stage, n) => {
          const useSim = !original || id.L >= stage.L;
          if (useSim) stage.simulated.push(key);
          parts[n]!.push({ id, bytes: (useSim ? simBytes : realBytes)! });
        });
      }
      for (const [n, stage] of stages.entries()) fs.writeFileSync(path.join(stage.folder, file), Buffer.concat(P.encodeTile(ti, tj, coarsestLevel, parts[n]!)));
    }
    const records: Record<string, TerrainRecord> = {};
    for (const stage of stages) {
      const level = copy ? 'copy' : Number.isFinite(stage.L) ? String(stage.L) : 'outside';
      const index: RouteIndex = {
        keys: [...keys],
        simulated: stage.simulated,
        edges,
        waterLevel: grid.seaLevel - oy,
        outside: fallback(x0 - step, y0 - step),
        maxTop,
        simulateFromLevel: Number.isFinite(stage.L) ? stage.L : null,
      };
      fs.writeFileSync(path.join(stage.folder, routeIndexFile), gzipSync(JSON.stringify(index), { level: 9 }));
      fs.copyFileSync(path.join(dir(base), modelFileName), path.join(stage.folder, modelFileName));
      writePackDoc(lib, stage.folder, {
        dimension: info.dimension,
        origin,
        state: table.stateList,
        biome: table.biomeList,
        coarsestLevel,
        maps: { coarse: { cell, x0, y0, nx, ny, height } },
        extra: { routeIndex: routeIndexFile },
      });
      const full = release(pack, stage.folder),
        registered = await registerTerrainEntry(pack, full.version, {
          source: `${base}@${registry[base]!.version}、${land}@${registry[land]!.version}、${far.pack}@${registry[far.pack]!.version}；${copy ? '存档边外照抄' : `模拟起级 ${level}`}`,
          license: registry[base]!.license,
          visibility: '发布',
        });
      const { trimmed: _previousTrim, activePolicy: _policy, policies: _variants, ...entry } = registered;
      const trimmed = path.join(root, '裁级');
      fs.mkdirSync(trimmed);
      const keepSha256 = await writeTrimmed(full.目录, { pack, record: entry }, keep, trimmed, routeTrimMethod);
      const check = await compareTrimmed(full.目录, trimmed);
      if (check.problems.length) throw Error(check.problems.join('\n'));
      const t = release(pack, trimmed),
        manifest = await packManifest(t.目录);
      records[level] = { ...entry, trimmed: { version: t.version, from: full.version, method: routeTrimMethod, keepSha256, ...manifest } };
      console.log(`模拟起级 ${level}：完整 ${full.version} ${entry.size} B，正式 ${t.version} ${manifest.size} B，核对 ${check.checked} 个区段`);
    }
    return records;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
