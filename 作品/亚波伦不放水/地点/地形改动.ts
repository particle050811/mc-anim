// 本作品渲染时对导入地形的改动（挖框，游戏坐标），按包列。烘焙、转码的可见变换（docs/世界.md「可见变换」）把埋住的格换掉、
// 封死的腔填实，挖开以后会露出来，所以这些改动碰到的区段要原样保留：anim check 核这里每一处都落在世界声明的 [[烘焙.保真]] 盒里。
// 新加挖框写在这里（场里引），别在场、段里另写。
import type { LandmarkCutout, FlattenArea } from '@engine/voxel/导入地形.ts';
import { 真下界包 } from './真下界位置.ts';

/** 黑曜石底占的那一层地面（祭坛，场/1-台地/布局.ts）：画仪式结构的段要把导入地形的这 49 格挖掉，不挖的话下界岩和黑曜石共面，镜头一动就整片闪 */
export const 祭坛底挖 = { 框: [{ from: [895, 49, -303], to: [901, 49, -297] }] as LandmarkCutout[], 键后缀: ':挖祭坛底' };

export const 地形改动: { 名: string; 包: string; 挖: LandmarkCutout[]; 平: FlattenArea[] }[] = [{ 名: '祭坛底', 包: 真下界包, 挖: 祭坛底挖.框, 平: [] }];
