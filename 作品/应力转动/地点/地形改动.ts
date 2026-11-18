// 本作品对导入地形的改动（挖框、整平，游戏坐标），按世界列；暮色离线烘成独立覆盖层。烘焙、转码的可见变换（docs/世界.md「可见变换」）把埋住的格换成石头、
// 封死的腔填实，挖开以后会露出来，所以这些改动碰到的区段要原样保留：anim check 核这里每一处都落在世界声明的 [[烘焙.保真]] 盒里。
// 这里只汇总，不让渲染代码引它（免得每段都打包进全部地点）：各处数组还在原处定义，新加一处挖框、整平要来这里补一行。
// 边城的竖井、古城挖框要算 6-3 的物理轨迹（打包要拖进角色、贴图），这里只登记整平罩，6-3-下坠/地形.ts 加载时核挖框落在整平罩的外框里。
import type { LandmarkCutout, FlattenArea } from '@engine/voxel/导入地形.ts';
import { baseIslandDigBoxes } from './基地小岛挖框.ts';
import { borderTownFlatten } from './边城地基.ts';
import { overworldPackName } from './主世界116.ts';
import { allCutouts, allFlattens } from './暮色新世界/摆放.ts';

export const terrainEdits: { name: string; pack: string; digBoxes: LandmarkCutout[]; flattenAreas: FlattenArea[] }[] = [
  { name: '基地小岛', pack: overworldPackName, digBoxes: baseIslandDigBoxes, flattenAreas: [] },
  { name: '边城（竖井、古城挖框在整平罩里，见上）', pack: overworldPackName, digBoxes: [], flattenAreas: borderTownFlatten() },
  { name: '暮色地标', pack: '暮色放大-1752', digBoxes: allCutouts, flattenAreas: allFlattens },
];
