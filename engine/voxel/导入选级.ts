// 导入地形（导入地形.ts）挑区段要的那几样：地物顶采样、哪些区段算这个包的、读到的区段记到哪几个包。纯模块：页面上的地形源和 Node 里的加载计划（加载计划.ts）共用。
import { sectionKey, type SectionId } from './区段.ts';
import { coarseHeightAt, hasSection, type CoarseHeightMap } from './区段包.ts';
import type { TerrainSampler } from './地表.ts';

/**
 * 选区段拿 采样 的 z 当这一带的地物顶。没数据的地方给 outside（航线包登记的存档外高度，普通包 0）而不是 −Infinity：
 * 选区段只在区段中心取一次，粗级大区段中心没数据、角上有数据时，按无限远算就永远不细分
 */
export const importedSampler = (coarse: CoarseHeightMap, outside = 0): TerrainSampler => (x, y, out) => {
  const height = coarseHeightAt(coarse, x, y);
  out.z = height === -Infinity ? outside : height;
  out.crown = 0;
};

/** 包里有没有这个区段：航线包按区段索引，普通包按粗高度图 */
export const importedContains = (coarse: CoarseHeightMap, routeKeys?: ReadonlySet<string>) => (q: SectionId) =>
  routeKeys ? routeKeys.has(sectionKey(q)) : hasSection(coarse, q);

/** 读到的区段记到哪几个包：航线按世界的完整需求记底包（含覆盖块），覆盖层另记它换掉的那几块 */
export const readsByPack = (pack: string, keys: string[], overlay?: { pack: string; keys: ReadonlySet<string> }): [string, string[]][] =>
  overlay ? [[pack, keys], [overlay.pack, keys.filter((k) => overlay.keys.has(k))]] : [[pack, keys]];
