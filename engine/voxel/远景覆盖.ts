// 挑块时还不知道哪些列空了。每个导入区段只解一次，按真正挖过、平整过的格子判；距离随每帧更新，不算猜的预取。
import { delayRender, continueRender, cancelRender } from 'remotion';
import { sectionBounds, sectionKey, type SectionId } from './区段.ts';
import { buildPackTables, hasSection } from './区段包.ts';
import { variesByPos } from './群系色.ts';
import { importedSectionVoxels } from './导入区段.ts';
import type { ImportedTerrain } from './导入地形.ts';
import { emptyColumns } from './远景并列.ts';

export type FarUse = { first: number; near: number; far: number; columns: string }; // * 是整块；其余是含邻圈的空列位图
export type FarCover = Record<string, Record<string, FarUse>>;
const globals = globalThis as { terrainFarCover?: FarCover };
export const columnBits = (mask: Uint8Array) => {
  const bits = new Uint8Array(Math.ceil(mask.length / 8));
  for (let i = 0; i < mask.length; i++) if (mask[i]) bits[i >> 3] |= 1 << (i & 7);
  return btoa(String.fromCharCode(...bits));
};

export const farCoverage = (name: string, base: ImportedTerrain, supplement: ImportedTerrain) => {
  const sources = [base, supplement].map(t => ({ t, ctx: { ...t.voxelContext, tables: buildPackTables(t.voxelContext.info), variesByPos: t.voxelContext.info.biome.map(variesByPos) } }));
  const seen = new Map<string, FarUse>();
  const output = ((globals.terrainFarCover ??= {})[name] ??= {});
  return (qs: SectionId[], camera: number[], frame: number) => {
    const fresh: SectionId[][] = [[], []];
    for (const q of qs) {
      const key = sectionKey(q), [x, y, size] = sectionBounds(q);
      const d = Math.hypot(Math.max(x - camera[0], 0, camera[0] - x - size), Math.max(y - camera[1], 0, camera[1] - y - size));
      const entry = seen.get(key) ?? output[key];
      if (entry) { entry.first = Math.min(frame, entry.first); entry.near = Math.min(d, entry.near); entry.far = Math.max(d, entry.far); continue; }
      const use = { first: frame, near: d, far: d, columns: '*' };
      seen.set(key, use);
      const i = sources.findIndex(s => hasSection(s.t.coarse, q));
      if (i < 0) output[key] = use;
      else fresh[i].push(q);
    }
    fresh.forEach((ids, i) => {
      if (!ids.length) return;
      const handle = delayRender('远景覆盖：核实导入区段的空列');
      const { t, ctx } = sources[i];
      t.sectionData(ids).then(ds => {
        ds.forEach((d, j) => {
          const mask = emptyColumns(importedSectionVoxels(d!, ctx));
          if (!mask) return;
          const key = sectionKey(ids[j]), use = seen.get(key)!;
          use.columns = columnBits(mask);
          output[key] = use;
        });
        continueRender(handle);
      }).catch(cancelRender);
    });
  };
};
