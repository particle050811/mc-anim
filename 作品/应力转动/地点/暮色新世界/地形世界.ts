// 暮色新世界的地形怎么挑区段（暮色新世界.tsx 的 TwilightTerrain 和各段的地形视图、加载计划共用）：纯模块，不碰 React。
// 开超远景的镜头读整个底包（含模拟远景）；不开的只看原存档范围：采样换成冻结的原粗高度、区段滤到存档以内、竖直范围的顶换成原存档的最高处，这三样都影响选级。
import type { V3 } from '@engine/model/parts.tsx';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { frozenCoarse } from '@engine/voxel/冻结粗高度.ts';
import { coarseHeightAt, hasSection } from '@engine/voxel/区段包.ts';
import { importedPlanWorld } from '@engine/voxel/加载计划.ts';
import type { TerrainCanvasView, TerrainWorld } from '@engine/voxel/地形视图.ts';
import type { SelectionSource } from '@engine/voxel/选区段.ts';
import { twilightFrozen } from './地标表.ts';
import { farViewOf, twilightFarViewM, twilightOverlayPack, twilightSectionPack, type TwilightFarView } from './超远景.ts';

const originalCoarse = frozenCoarse(twilightFrozen);
const originalTop = originalCoarse.height.reduce((top, height) => Math.max(top, height), -Infinity);

/** 只看原存档范围的选级那几样（不开超远景时）：盖在底包的地形源上 */
export const archiveSelection = <S extends Pick<SelectionSource, '采样' | 'resolveSections'>>(source: S): S => ({
  ...source,
  采样: (x, y, sample) => {
    const height = coarseHeightAt(originalCoarse, x, y);
    sample.z = height === -Infinity ? 0 : height;
    sample.crown = 0;
  },
  resolveSections: (requests, guessed) => {
    const inside = requests.filter((section) => hasSection(originalCoarse, section));
    return source.resolveSections?.(inside, guessed) ?? inside;
  },
});
export const archiveHeightRange = (range: readonly [number, number]): [number, number] => [range[0], originalTop];

const fullWorld = importedPlanWorld(twilightSectionPack, twilightOverlayPack);
const archiveWorld: TerrainWorld = {
  key: `${fullWorld.key}:存档范围`,
  open: async (src, dirOf) => {
    const w = await fullWorld.open(src, dirOf);
    return { ...w, source: archiveSelection(w.source), heightRange: archiveHeightRange(w.heightRange) };
  },
};

/** TwilightTerrain 这一镜的选级参数：超远景（试看 > 镜头给的正式值 > 不开）、最远距离、门槛；far、pixel 不给照下面的默认 */
export const twilightTerrainParams = (o: { farView?: TwilightFarView; far?: number; pixel?: number }) => {
  const distant = !!farViewOf(o.farView);
  return {
    distant,
    farM: o.far ?? (distant ? twilightFarViewM(LevelParams.视频.far) : LevelParams.视频.far),
    pixel: o.pixel ?? LevelParams.视频.pixel,
  };
};

/** 挂 TwilightTerrain 的画布在地形视图（engine/voxel/地形视图.ts）里除机位以外的那几项：读哪个地形、最远、门槛、投影光向 */
export const twilightViewParts = (o: { farView?: TwilightFarView; far?: number; pixel?: number; shadowLightDir?: V3 }): Pick<TerrainCanvasView, 'world' | 'farM' | 'pixel' | 'shadowLightDir'> => {
  const { distant, farM, pixel } = twilightTerrainParams(o);
  return { world: distant ? fullWorld : archiveWorld, farM, pixel, ...(o.shadowLightDir ? { shadowLightDir: o.shadowLightDir } : {}) };
};
