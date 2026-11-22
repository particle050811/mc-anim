// 区段包的元数据：只读 包.json 和 粗图.bin.gz，推出粗高度图、各处能不能再细分、竖直范围、哪些区段有地。不取模型、不碰工人池，纯模块，Node 里算加载计划也用。
// 推导和 engine/voxel/导入地形.ts 的 loadPack、buildTerrain 是同一套（那边还没改走数据源，暂时两份，由 地形元数据.test.ts 的对照守着）。
import type { DataSource } from '../core/数据读取.ts';
import { formatVersion, hasSection, decodePackMaps, decodeSplittable, packMapsFileName, type PackageInfo, type CoarseHeightMap } from './区段包.ts';
import type { SectionId } from './区段.ts';

// 维度的下界（游戏 y）：暮色森林的维度从 y −32 起，主世界 −64
const dimensionMinY: Record<string, number> = { 暮色: -32, 主世界: -64 };

export type PackMeta = {
  info: PackageInfo;
  coarse: CoarseHeightMap;
  canSplit: ReturnType<typeof decodeSplittable>; // 各处最细级不一样的包才有
  maxTop: number; // 粗高度图里最高的顶（场景 z）
  heightRange: [number, number]; // 场景 z 的范围（维度下界 ～ 最高的方块顶）
  hasSection: (q: SectionId) => boolean;
};

// dir：包的版本目录（engine/voxel/区段包位置.ts 的 packDir）
export const readPackMeta = async (src: DataSource, dir: string): Promise<PackMeta> => {
  const info = await src.json<PackageInfo>(`${dir}/包.json`, '本机没有这一版：anim assets pull 取，或 anim world bake 烘焙、anim world trim 裁（docs/世界.md）');
  if (info.version !== formatVersion) throw new Error(`地形包是格式 ${info.version}，这版代码只读格式 ${formatVersion}：anim assets pull，或 anim world transcode`);
  const { coarse, splittable } = decodePackMaps(info, new Uint8Array(await src.gunzip(`${dir}/${packMapsFileName}`, 'anim assets pull')));
  let maxTop = -Infinity;
  for (const height of coarse.height) if (height !== -32768) maxTop = Math.max(maxTop, height);
  return { info, coarse, canSplit: decodeSplittable(splittable), maxTop, heightRange: [dimensionMinY[info.dimension] - info.origin[1], maxTop], hasSection: (q) => hasSection(coarse, q) };
};
