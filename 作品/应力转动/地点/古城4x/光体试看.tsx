// 古城4x 的光体试看：试看 {"光体": {…}, "地形": ["古城放大幽匿-20260930"]}（登记见 engine/core/调试开关.ts），放在 AncientCity4xCanvas 的场景组里。
// 古城画的是方块网格，网格只记了箱子、幽匿方块的位置，没记灵魂灯、灵魂火、熔岩这些发光方块；光源和挡光照同一份存档烘的包
// （sourcing/worlds/古城放大幽匿-20260930.toml）算，包本身不画。没开试看什么都不挂。
import React from 'react';
import { LightVolume } from '@engine/light/光体组件.tsx';
import { trialLightVolume } from '@engine/light/光体试看.ts';
import type { LightVolumeParams } from '@engine/light/光体.ts';
import { useImportedTerrain, type LandmarkCutout } from '@engine/voxel/导入地形.ts';

const pack = '古城放大幽匿-20260930';
const packOrigin = [-2048, 64, 0];
// 包的场景坐标 + 这个 = 古城4x 的场景坐标（古城4x 原点是游戏 (−720, −50, 240)，地点/古城4x.tsx）
const shift = [-1328, 240, 114] as const;
// 竖直只取城这一段：游戏 y −64（维度底）～ 54（最高的洞厅顶 y 42 再留余量），包的场景 z = y − 64。整列 384 格的话探针多三倍
const heightRange: [number, number] = [-128, -10];
const noCuts: LandmarkCutout[] = [];

const Lit: React.FC<{ camPos: readonly number[]; params: LightVolumeParams }> = ({ camPos, params }) => {
  const t = useImportedTerrain(pack, noCuts);
  if (t && t.origin.some((v, i) => v !== packOrigin[i])) throw new Error(`区段包 ${pack} 的原点是 ${t.origin}，光体试看.tsx 按 ${packOrigin} 算的`);
  return (
    <group position={[...shift]}>
      <LightVolume t={t} center={camPos.map((v, i) => v - shift[i]!)} heightRange={heightRange} params={params} />
    </group>
  );
};

export const AncientCityLightTrial: React.FC<{ camPos: readonly number[] }> = ({ camPos }) => {
  const params = trialLightVolume();
  return params ? <Lit camPos={camPos} params={params} /> : null;
};
