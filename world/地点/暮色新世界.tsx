// 暮色新世界：6-1-1（暮色那一半）到 6-1-9 用的地形和地标摆放。
// 地形：游戏里生成的真实地貌（暮色放大 4 倍，种子 1752，存档 game/取材服务端/暮色放大-1752），npm run 导入:暮色放大1752扩展 烘焙成区段包，由 lib/体素/导入地形.ts 画。
// 地标：已导出的 8 座地标网格（模型/场景/*.网格）平移摆到新世界里同一座结构的位置（用户 10-04 定），导入地形在网格范围里挖掉（`LandmarkCutout`），新世界自己生成的那座也就跟着挖掉。
//
// 世界坐标 = 区段包的场景坐标（lib/体素/区段包.ts）：X = 游戏 x − ox，Y = oz − 游戏 z，Z = 游戏 y，北 = +Y。
//   6-1-1～6-1-3 的编排用庭院本地坐标：整个场景放进 <group position={庭院原点}>，地形照世界坐标画。
//   不反过来把地形挪到庭院原点：庭院网格原点在半格上，挪了以后方块材质按世界坐标算的格（lib/体素/材质.ts 的 `vW`）会错开。
//
import React from 'react';
import type { V3 } from '../../engine/model/parts.tsx';
import { useImportedTerrain } from '../../engine/voxel/导入地形.ts';
import { VoxelWorld } from '../../engine/voxel/世界.tsx';
import { LevelParams } from '../../engine/core/渲染级别.ts';
import { NagaCourtyard } from './娜迦庭院.tsx';
import { FinalCastle } from './终焉高原城堡.tsx';
import { twilightPackName, type TwilightLandmarkName } from './暮色新世界/地标表.ts';
import { frameByName, allCutouts, allFlattens, landmarkHideOutsideCore, castleMeshHide } from './暮色新世界/摆放.ts';

export { twilightPackName, twilightFrozen, gameToWorld, yetiCore, twilightLandmarkNames, type TwilightLandmarkName } from './暮色新世界/地标表.ts';
export {
  twilightLandmark,
  twilightCutouts,
  twilightRemovedClouds,
  twilightDrawsMesh,
  twilightCore,
  twilightRotation,
  twilightPlacement,
  landmarkHideOutsideCore,
  castleMeshHide,
  type LandmarkFrame,
} from './暮色新世界/摆放.ts';
export {
  twilightCellTop,
  isInTwilightLandmark,
  twilightFeatureTop,
  twilightCameraGround,
  cruiseClearanceM,
  canopySurface,
  cruiseHeight,
  twilightTerrainKey,
  viewEdgeDistance,
  twilightHeightAboveGround,
} from './暮色新世界/高度.ts';

// ---------- 地形组件 ----------
// 镜头：镜头的世界坐标；地标：要画哪几座的网格（boss 那几座由各段的 戏.tsx 自己画，这里一般只给 娜迦庭院、终焉高原城堡）；
// `t`、`清草`：娜迦庭院的火焰时间、不画花草的矩形（庭院本地坐标）；像素、远：体素世界的精度和最远距离；`投影光向`：同 `TwilightZones`
export const TwilightTerrain: React.FC<{ camPos: number[]; landmarks?: TwilightLandmarkName[]; t?: number; clearPlants?: number[][]; 像素?: number; 远?: number; shadowLightDir?: V3 }> = ({
  camPos: cameraPos,
  landmarks: landmarks = [],
  t = 0,
  clearPlants,
  像素: splitPixels = LevelParams.视频.像素,
  远: farM = LevelParams.视频.远,
  shadowLightDir,
}) => {
  const terrain = useImportedTerrain(twilightPackName, allCutouts, allFlattens);
  if (!terrain) return null;
  return (
    <group>
      <VoxelWorld 键={terrain.键} 来源={terrain.来源} 中心={cameraPos} 像素={splitPixels} 远={farM} 高度={terrain.高度} shadowLightDir={shadowLightDir} />
      {landmarks.map((name) => (
        <LandmarkMesh key={name} name={name} t={t} clearPlants={clearPlants} />
      ))}
    </group>
  );
};

// boss 那几座的 戏.tsx 用同样的变换包自己的场景
export const LandmarkPlacement: React.FC<{ 名: TwilightLandmarkName; children: React.ReactNode }> = ({ 名: name, children }) => {
  const frame = frameByName[name];
  return (
    <group position={frame.原点} rotation={[0, 0, (frame.转 * Math.PI) / 180]}>
      {children}
    </group>
  );
};
const LandmarkMesh: React.FC<{ name: TwilightLandmarkName; t: number; clearPlants?: number[][] }> = ({ name: name, t, clearPlants }) => {
  if (name === '娜迦庭院')
    return (
      <LandmarkPlacement 名={name}>
        <NagaCourtyard t={t} clearPlants={clearPlants} hideBlocks={landmarkHideOutsideCore.娜迦庭院} />
      </LandmarkPlacement>
    );
  if (name === '终焉高原城堡')
    return (
      <LandmarkPlacement 名={name}>
        <FinalCastle hide={castleMeshHide} />
      </LandmarkPlacement>
    );
  throw new Error(`暮色地形：${name} 由各段的 戏.tsx 画`);
};
