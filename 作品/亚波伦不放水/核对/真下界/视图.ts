// 核对-真下界的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。提亮、雾放远的 17 个在前（第 0～16 秒），照原版光和雾的 2 个对照在后（第 17、18 秒）。
// 提亮：封面空中点（地点/真下界位置.ts 的 真下界选点）平视北、东、南、西，仰视 45 度，俯视 70 度；
// 正片场地（真下界场地）中心人眼高度平视北、东、南、西，朝空中点（熔岩海）看，从场地南边 14 格处仰看中心头顶 30 格的地方（亚波伦悬停的高度），再从空中点回看场地；最后是备选场地（真下界备选场地）人眼平视四向。竖直视角都是 70 度（原版默认 fov）。
import type { V3 } from '@engine/model/parts.tsx';
import { realNetherVenue, realNetherScene, realNetherAltVenue, realNetherPick } from '../../地点/真下界位置.ts';

export const aspect = { width: 1920, height: 1080 } as const;

export type View = { name: string; 光: '原版' | '提亮'; /** 眼、看的点（场景坐标：x 东、y 北、z 上） */ 眼: V3; 看: V3 };

const airPoint = realNetherScene(realNetherPick.x, realNetherPick.y, realNetherPick.z);
const eyeHeightM = 1.62;
const groundCenter = realNetherScene(realNetherVenue.心.x + 0.5, realNetherVenue.心.y, realNetherVenue.心.z + 0.5);
const groundEye: V3 = [groundCenter[0], groundCenter[1], groundCenter[2] + eyeHeightM];
const backupCenter = realNetherScene(realNetherAltVenue.心.x + 0.5, realNetherAltVenue.心.y, realNetherAltVenue.心.z + 0.5);
const backupEye: V3 = [backupCenter[0], backupCenter[1], backupCenter[2] + eyeHeightM];
const pointAhead = (eye: V3, dir: readonly number[]): V3 => [eye[0] + dir[0]!, eye[1] + dir[1]!, eye[2] + dir[2]!];
const elevationDir = (elevationDeg: number) => [0, Math.cos((elevationDeg * Math.PI) / 180), Math.sin((elevationDeg * Math.PI) / 180)];
const fourDirs = [
  ['北', [0, 1, 0]],
  ['东', [1, 0, 0]],
  ['南', [0, -1, 0]],
  ['西', [-1, 0, 0]],
] as const;

const brightenedGroup: readonly Omit<View, '光'>[] = [
  ...fourDirs.map(([dirName, dir]) => ({ name: `空中点 平视${dirName}`, 眼: airPoint, 看: pointAhead(airPoint, dir) })),
  { name: '空中点 仰视 45 度（朝北）', 眼: airPoint, 看: pointAhead(airPoint, elevationDir(45)) },
  { name: '空中点 俯视 70 度（朝北）', 眼: airPoint, 看: pointAhead(airPoint, elevationDir(-70)) },
  ...fourDirs.map(([dirName, dir]) => ({ name: `场地中心 人眼平视${dirName}`, 眼: groundEye, 看: pointAhead(groundEye, dir) })),
  { name: '场地中心 人眼朝空中点（西边的熔岩海）', 眼: groundEye, 看: airPoint },
  { name: '场地南边 14 格 仰看中心头顶 30 格', 眼: [groundEye[0], groundEye[1] - 14, groundEye[2]], 看: [groundCenter[0], groundCenter[1], groundCenter[2] + 30] },
  { name: '空中点 回看场地', 眼: airPoint, 看: groundCenter },
  ...fourDirs.map(([dirName, dir]) => ({ name: `备选场地（山头） 人眼平视${dirName}`, 眼: backupEye, 看: pointAhead(backupEye, dir) })),
];
const vanillaGroup: readonly Omit<View, '光'>[] = [brightenedGroup[3]!, brightenedGroup[10]!];

export const views: readonly View[] = [...brightenedGroup.map((v) => ({ ...v, name: `提亮 ${v.name}`, 光: '提亮' as const })), ...vanillaGroup.map((v) => ({ ...v, name: `原版 ${v.name}`, 光: '原版' as const }))];
