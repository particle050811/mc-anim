// 暮色新世界：6-1-1（暮色那一半）到 6-1-9 用的地形和地标摆放。
// 地形：游戏里生成的真实地貌（暮色放大 4 倍，种子 1752，存档 game/取材服务端/暮色放大-1752），由 world bake-far 把存档与模拟远景烘成一个区段包。
// 地标：已导出的 8 座地标网格（模型/场景/*.网格）平移摆到新世界里同一座结构的位置（用户 10-04 定），导入地形在网格范围里挖掉（`LandmarkCutout`），新世界自己生成的那座也就跟着挖掉。
//
// 世界坐标 = 区段包的场景坐标（lib/体素/区段包.ts）：X = 游戏 x − ox，Y = oz − 游戏 z，Z = 游戏 y，北 = +Y。
//   6-1-1～6-1-3 的编排用庭院本地坐标：整个场景放进 <group position={庭院原点}>，地形照世界坐标画。
//   不反过来把地形挪到庭院原点：庭院网格原点在半格上，挪了以后方块材质按世界坐标算的格（lib/体素/材质.ts 的 `vW`）会错开。
//
import React, { useMemo } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { useImportedTerrain } from '@engine/voxel/导入地形.ts';
import { sectionKey } from '@engine/voxel/区段.ts';
import { coarseHeightAt, hasSection } from '@engine/voxel/区段包.ts';
import { frozenCoarse } from '@engine/voxel/冻结粗高度.ts';
import { limitToOriginal } from '@engine/voxel/航线区段包.ts';
import type { VoxelSource } from '@engine/voxel/生成.ts';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { NagaCourtyard } from './娜迦庭院.tsx';
import { FinalCastle } from './终焉高原城堡.tsx';
import { twilightFrozen, type TwilightLandmarkName } from './暮色新世界/地标表.ts';
import { frameByName, landmarkHideOutsideCore, castleMeshHide } from './暮色新世界/摆放.ts';
import { twilightOverlayPack, twilightSectionPack, farViewOf, twilightFarViewM, type TwilightFarView } from './暮色新世界/超远景.ts';

export { twilightPackName, twilightFrozen, type TwilightLandmarkName } from './暮色新世界/地标表.ts';
export {
  twilightLandmark,
  landmarkHideOutsideCore,
  castleMeshHide
} from './暮色新世界/摆放.ts';
export {
  twilightCellTop,
  isInTwilightLandmark,
  cruiseClearanceM,
  canopySurface,
  cruiseHeight,
  twilightTerrainKey,
  viewEdgeDistance,
  twilightHeightAboveGround,
} from './暮色新世界/高度.ts';

// ---------- 地形组件 ----------
// 镜头：镜头的世界坐标；地标：要画哪几座的网格（boss 那几座由各段的 戏.tsx 自己画，这里一般只给 娜迦庭院、终焉高原城堡）；
// `t`、`清草`：娜迦庭院的火焰时间、不画花草的矩形（庭院本地坐标）；像素、远：体素世界的精度和最远距离（远不给：开着超远景是 超远景.ts 的 `twilightFarViewM`，没开是级别的）；`投影光向`：同 `TwilightZones`；
// 超远景：这一镜的正式超远景（暮色新世界/超远景.ts，不给 = 不开，试看能盖掉）
type TerrainProps = { camPos: number[]; landmarks?: TwilightLandmarkName[]; t?: number; clearPlants?: number[][]; pixel?: number; far?: number; shadowLightDir?: V3; farView?: TwilightFarView };
const noCutouts: [] = [];
const originalCoarse = frozenCoarse(twilightFrozen);
const originalTop = originalCoarse.height.reduce((top, height) => Math.max(top, height), -Infinity);

// 作品覆盖层只换整块；不开超远景的镜头仍用原存档边界选级，不能把原来没有的地平线带进庭院。
export const TwilightTerrain: React.FC<TerrainProps> = (props) => {
  const terrain = useImportedTerrain(twilightSectionPack, noCutouts, undefined, twilightOverlayPack);
  const showDistant = !!farViewOf(props.farView);
  const view = useMemo(() => {
    if (!terrain || showDistant) return terrain;
    const { source, route } = terrain;
    if (!route) throw Error('暮色底包缺区段索引');
    const localSource: VoxelSource = {
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
      sections: (section) => {
        const grid = source.sections(section);
        const edge = route.edges[sectionKey(section)];
        if (!grid || !edge) return grid;
        const simulated = route.simulateFromLevel !== null && section.L >= route.simulateFromLevel;
        return limitToOriginal(grid, edge, simulated);
      },
    };
    return { key: `${terrain.key}:存档范围`, source: localSource, heightRange: [terrain.heightRange[0], originalTop] as [number, number] };
  }, [terrain, showDistant]);
  if (!view) return null;
  const far = props.far ?? (showDistant ? twilightFarViewM(LevelParams.视频.far) : LevelParams.视频.far);
  return <TerrainView terrain={view} {...props} far={far} />;
};
const TerrainView: React.FC<TerrainProps & { terrain: { key: string; source: VoxelSource; heightRange: [number, number] } }> = ({
  terrain,
  camPos: cameraPos,
  landmarks: landmarks = [],
  t = 0,
  clearPlants,
  pixel: splitPixels = LevelParams.视频.pixel,
  far: farM = LevelParams.视频.far,
  shadowLightDir,
}) => (
  <group>
    <VoxelWorld worldKey={terrain.key} source={terrain.source} center={cameraPos} pixel={splitPixels} far={farM} heightRange={terrain.heightRange} shadowLightDir={shadowLightDir} />
    {landmarks.map((name) => (
      <LandmarkMesh key={name} name={name} t={t} clearPlants={clearPlants} />
    ))}
  </group>
);

// boss 那几座的 戏.tsx 用同样的变换包自己的场景
export const LandmarkPlacement: React.FC<{ name: TwilightLandmarkName; children: React.ReactNode }> = ({ name: name, children }) => {
  const frame = frameByName[name];
  return (
    <group position={frame.origin} rotation={[0, 0, (frame.转 * Math.PI) / 180]}>
      {children}
    </group>
  );
};
const LandmarkMesh: React.FC<{ name: TwilightLandmarkName; t: number; clearPlants?: number[][] }> = ({ name: name, t, clearPlants }) => {
  if (name === '娜迦庭院')
    return (
      <LandmarkPlacement name={name}>
        <NagaCourtyard t={t} clearPlants={clearPlants} hideBlocks={landmarkHideOutsideCore.娜迦庭院} />
      </LandmarkPlacement>
    );
  if (name === '终焉高原城堡')
    return (
      <LandmarkPlacement name={name}>
        <FinalCastle hide={castleMeshHide} />
      </LandmarkPlacement>
    );
  throw new Error(`暮色地形：${name} 由各段的 戏.tsx 画`);
};
