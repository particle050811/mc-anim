// 6-2-6 边城在望：6-2-5 那条飞行时间线（6-2-5/编排.ts）上的最后一个窗口，段内帧 f = 全局帧 − 段起。首帧 = 6-2-5 末帧。
// 6-2-6 是这次飞行的最后 15 秒：刚过转弯点（暖水海湾上空往左转，改朝西南偏西），离地物顶面约 80 米疾飞，
// 过平原、樱花林，顺着城东那座山顶积雪的石山按 0.5 的坡度往上爬，翻山时边城从山后露出来，9.9 秒起一路减速、慢慢改平，
// 悬停在边城正上方 1300 米（城中心往北 120 米），面朝正南往下看城的全景，接 6-3-1。航线、速度、云、机位的理由都在 6-2-5/编排.ts。
// 第 3 场接的是这一段的末帧（6-3-下坠/时间线.ts 的 起点：末帧的扫帚、镜头、骑手、能见度）。
import * as choreo625 from '../6-2-5/编排.ts';
import { BORDER_TOWN } from '../../边城轮廓.tsx';
import { borderTownPos } from '../../主世界116.ts';

export const segmentId = '6-2-6';
const G0 = choreo625.segmentTable['6-2-6'].起;
export const FRAMES = choreo625.segmentFrames('6-2-6');
const toSegFrame = (G: number) => G - G0;
export const beats = { 城墙: toSegFrame(choreo625.beats.townWall), 减速: toSegFrame(choreo625.beats.decelStart), hardBrake: toSegFrame(choreo625.beats.hardBrake), 停住: toSegFrame(choreo625.beats.stopFrame), 末帧: FRAMES - 1 };
export const hoverHeight = choreo625.hoverHeight;
export type BroomState = choreo625.BroomState;
export type Cam = choreo625.Cam;
export const broom = (f: number) => choreo625.broom(G0 + f);
export const riders = (f: number) => choreo625.riders(G0 + f);
export const camera = (f: number) => choreo625.camera(G0 + f);
export const visibility = (f: number) => choreo625.visibility(G0 + f);
export const TOWN = { center: borderTownPos, size: BORDER_TOWN };
