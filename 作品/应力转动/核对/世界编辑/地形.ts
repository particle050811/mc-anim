// 世界编辑核对用的地形来源：直接按版本取没登记的区段包 测试-修整-岛-编辑示例（anim world bake 测试-修整-编辑示例 烘的，声明里 登记 = false）。
// 不走 engine/voxel/导入地形.ts：那边只认段声明、登记进 assets/地形版本.json 的包；这个包只是演示，不登记。它也不记地形用量（engine/voxel/地形用量.ts）。
// 这里是它的精简版（不挖地标、不平整、不并 Range 请求），区段一样交给区段工人取、解、换体素块；版本写在 画面.tsx 里，换了版本本段指纹跟着变。
import { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { dataUrl, fetchJson, fetchRange, loadOnce } from '@engine/core/数据源.ts';
import { sectionKey, type SectionId } from '@engine/voxel/区段.ts';
import { formatVersion, buildPackTables, coarseHeightAt, decodeCoarseHeight, decodeTileHeader, hasSection, sectionInTile, tileFileName, tileHeaderLen, type PackageInfo, type SectionData } from '@engine/voxel/区段包.ts';
import { variesByPos } from '@engine/voxel/群系色.ts';
import { importedSectionVoxels, type SectionContext } from '@engine/voxel/导入区段.ts';
import { fetchSectionsInPool, registerSource, registerModel } from '@engine/voxel/区段工人池.ts';
import { readModel, modelFileName } from '@engine/voxel/区段模型.ts';
import type { VoxelGrid, VoxelSource } from '@engine/voxel/生成.ts';

export type VersionedTerrain = { key: string; source: VoxelSource; heightRange: [number, number]; origin: [number, number, number] };

const buildSource = async (dir: string): Promise<VersionedTerrain> => {
  const info = await fetchJson<PackageInfo>(`${dir}/包.json`, 'anim world bake 测试-修整-编辑示例 烘出来');
  if (info.version !== formatVersion) throw new Error(`世界编辑核对地形 ${dir} 是格式 ${info.version}，这版代码只读格式 ${formatVersion}：运行 anim world transcode，或 anim world bake 测试-修整-编辑示例 后更新画面.tsx 的版本`);
  const url = new URL(dataUrl(`${dir}/${modelFileName}`), location.href).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取世界编辑核对模型 ${url}：${res.status}；运行 anim world transcode，或 anim world bake 测试-修整-编辑示例 后更新画面.tsx 的版本`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  readModel(bytes);
  registerModel(url, bytes);
  const coarse = decodeCoarseHeight(info);
  let maxTop = -Infinity;
  for (const h of coarse.height) if (h !== -32768) maxTop = Math.max(maxTop, h);
  const ctx: SectionContext = { info, tables: buildPackTables(info), variesByPos: info.biome.map(variesByPos), cutBoxes: [], flattenAreas: [] };
  const workerCtx = registerSource({ origin: info.origin, state: info.state, biome: info.biome }, [], []);
  const indexCache = new Map<string, Promise<Uint32Array>>();
  const sectionDataByKey = new Map<string, SectionData>();
  const readyVoxels = new Map<string, VoxelGrid>();
  const inFlight = new Map<string, Promise<void>>();
  const getSection = (q: SectionId) => {
    const { ti, tj, slot } = sectionInTile(q);
    const file = `${dir}/${tileFileName(ti, tj)}`;
    let idx = indexCache.get(file);
    if (!idx) indexCache.set(file, (idx = fetchRange(file, 0, tileHeaderLen).then((ab) => decodeTileHeader(new Uint8Array(ab)))));
    const url = new URL(dataUrl(file), location.href).href;
    return idx
      .then((ix) => fetchSectionsInPool(url, ix[2 * slot], ix[2 * slot + 1], [{ off: 0, len: ix[2 * slot + 1], ctx: workerCtx, id: q }]))
      .then(([r]) => {
        sectionDataByKey.set(sectionKey(q), r.data);
        if (r.voxels) readyVoxels.set(sectionKey(q), r.voxels);
      });
  };
  const source: VoxelSource = {
    采样: (x, y, out) => {
      const h = coarseHeightAt(coarse, x, y);
      out.z = h === -Infinity ? 0 : h;
      out.crown = 0;
    },
    sections: (q) => {
      if (!hasSection(coarse, q)) return null;
      const k = sectionKey(q);
      const v = readyVoxels.get(k);
      if (v) {
        readyVoxels.delete(k);
        return v;
      }
      return importedSectionVoxels(sectionDataByKey.get(k)!, ctx);
    },
    transferOwnership: true,
    prefetch: (qs) => {
      const pending = new Set<Promise<void>>();
      for (const q of qs) {
        const k = sectionKey(q);
        if (sectionDataByKey.has(k) || !hasSection(coarse, q)) continue;
        let p = inFlight.get(k);
        if (!p) inFlight.set(k, (p = getSection(q)));
        pending.add(p);
      }
      return pending.size ? Promise.all(pending).then(() => undefined) : undefined;
    },
  };
  return { key: `按版本:${dir}`, source: source, heightRange: [-64 - info.origin[1], maxTop], origin: info.origin };
};

/** 包.json 取到之前返回 null，并用 delayRender 拦住截图（同 useImportedTerrain） */
export const useVersionedTerrain = (pack: string, version: string): VersionedTerrain | null => {
  const dir = `terrain/${pack}/${version}`;
  const [terrain, setTerrain] = useState<VersionedTerrain | null>(null);
  const [handle] = useState(() => delayRender(`世界编辑核对：取 ${dir}/包.json`));
  const released = useRef(false);
  useEffect(() => {
    loadOnce(dir, () => buildSource(dir))
      .then(setTerrain)
      .catch((e) => cancelRender(e));
  }, [dir]);
  useEffect(() => {
    if (!terrain || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [terrain, handle]);
  return terrain;
};
