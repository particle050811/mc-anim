// 核对-体素教堂的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）：
// 结构模板的格 (x, y, z) 占场景 [x, x+1]×[−z−1, −z]×[y, y+1]，整座 87×77×97 落在 x 0～87、y −97～0、z 0～77。
import type { V3 } from '@engine/model/parts.tsx';

export const aspect = { width: 1920, height: 1080 } as const;

export type View = { name: string; 眼: V3; 看: V3; fov: number; note?: string };

const aimCenter: V3 = [43.5, -48.5, 30];
export const views: readonly View[] = [
  { name: '东南高处', 眼: [150, -170, 95], 看: aimCenter, fov: 40 },
  { name: '西北高处', 眼: [-65, 75, 95], 看: aimCenter, fov: 40 },
  { name: '正南平视', 眼: [43.5, -190, 20], 看: [43.5, -48.5, 32], fov: 40 },
  { name: '正东平视', 眼: [185, -48.5, 20], 看: [43.5, -48.5, 32], fov: 40 },
];
