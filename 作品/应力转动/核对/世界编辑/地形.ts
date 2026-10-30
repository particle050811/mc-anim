// 世界编辑核对用的地形来源：直接按版本取没登记的区段包 测试-修整-岛-编辑示例（anim world bake 测试-修整-编辑示例 烘的，声明里 登记 = false）。
// 不走 engine/voxel/导入地形.ts：那边只认 assets/地形版本.json 登记过的包，登记一个包会让所有用地形的段过期。
// 这里是它的精简版（不挖地标、不平整、不并 Range 请求），区段一样交给区段工人取、解、换体素块；版本写在 画面.tsx 里，换了版本本段指纹跟着变。
import { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { dataUrl, fetchJson, fetchRange, loadOnce } from '@engine/core/数据源.ts';
import { sectionKey, type SectionId } from '@engine/voxel/区段.ts';
import { buildPackTables, coarseHeightAt, decodeCoarseHeight, decodeTileHeader, hasSection, sectionInTile, tileFileName, tileHeaderLen, type 包信息, type SectionData } from '@engine/voxel/区段包.ts';
import { variesByPos } from '@engine/voxel/群系色.ts';
import { importedSectionVoxels, type 区段上下文 } from '@engine/voxel/导入区段.ts';
import { fetchSectionsInPool, registerSource } from '@engine/voxel/区段工人池.ts';
import type { VoxelGrid, VoxelSource } from '@engine/voxel/生成.ts';

export type 按版本的地形 = { 键: string; 来源: VoxelSource; 高度: [number, number]; 原点: [number, number, number] };

const 建来源 = async (dir: string): Promise<按版本的地形> => {
  const info = await fetchJson<包信息>(`${dir}/包.json`, 'anim world bake 测试-修整-编辑示例 烘出来');
  const 粗 = decodeCoarseHeight(info);
  let 顶 = -Infinity;
  for (const h of 粗.高) if (h !== -32768) 顶 = Math.max(顶, h);
  const ctx: 区段上下文 = { info, tables: buildPackTables(info), variesByPos: info.群系.map(variesByPos), cutBoxes: [], flattenAreas: [] };
  const 工人ctx = registerSource({ 原点: info.原点, 状态: info.状态, 群系: info.群系 }, [], []);
  const 索引 = new Map<string, Promise<Uint32Array>>();
  const 数据 = new Map<string, SectionData>();
  const 现成 = new Map<string, VoxelGrid>();
  const 在取 = new Map<string, Promise<void>>();
  const 取 = (q: SectionId) => {
    const { ti, tj, slot } = sectionInTile(q);
    const 文件 = `${dir}/${tileFileName(ti, tj)}`;
    let idx = 索引.get(文件);
    if (!idx) 索引.set(文件, (idx = fetchRange(文件, 0, tileHeaderLen).then((ab) => decodeTileHeader(new Uint8Array(ab)))));
    const url = new URL(dataUrl(文件), location.href).href;
    return idx
      .then((ix) => fetchSectionsInPool(url, ix[2 * slot], ix[2 * slot + 1], [{ off: 0, len: ix[2 * slot + 1], ctx: 工人ctx }]))
      .then(([r]) => {
        数据.set(sectionKey(q), r.data);
        if (r.voxels) 现成.set(sectionKey(q), r.voxels);
      });
  };
  const 来源: VoxelSource = {
    采样: (x, y, out) => {
      const h = coarseHeightAt(粗, x, y);
      out.z = h === -Infinity ? 0 : h;
      out.crown = 0;
    },
    区段: (q) => {
      if (!hasSection(粗, q)) return null;
      const k = sectionKey(q);
      const v = 现成.get(k);
      if (v) {
        现成.delete(k);
        return v;
      }
      return importedSectionVoxels(数据.get(k)!, ctx);
    },
    转交: true,
    prefetch: (qs) => {
      const 等 = new Set<Promise<void>>();
      for (const q of qs) {
        const k = sectionKey(q);
        if (数据.has(k) || !hasSection(粗, q)) continue;
        let p = 在取.get(k);
        if (!p) 在取.set(k, (p = 取(q)));
        等.add(p);
      }
      return 等.size ? Promise.all(等).then(() => undefined) : undefined;
    },
  };
  return { 键: `按版本:${dir}`, 来源, 高度: [-64 - info.原点[1], 顶], 原点: info.原点 };
};

/** 包.json 取到之前返回 null，并用 delayRender 拦住截图（同 useImportedTerrain） */
export const use按版本的地形 = (包: string, 版本: string): 按版本的地形 | null => {
  const dir = `terrain/${包}/${版本}`;
  const [地形, 设] = useState<按版本的地形 | null>(null);
  const [handle] = useState(() => delayRender(`世界编辑核对：取 ${dir}/包.json`));
  const 放了 = useRef(false);
  useEffect(() => {
    loadOnce(dir, () => 建来源(dir))
      .then(设)
      .catch((e) => cancelRender(e));
  }, [dir]);
  useEffect(() => {
    if (!地形 || 放了.current) return;
    放了.current = true;
    continueRender(handle);
  }, [地形, handle]);
  return 地形;
};
