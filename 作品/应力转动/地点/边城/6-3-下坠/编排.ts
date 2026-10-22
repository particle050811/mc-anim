// 6-3 下坠的编排（纯函数）：扫帚、李樱、九胡、锤和压路机虚影、金光、坑和竖井、卫兵、机位。输入全局帧 G 或物理时间 w（见 时间线.ts）。
// 从 6-2-6 末帧悬停到砸穿落进古城，分段见 时间线.ts 的 `段表`（城墙上和李樱两边并行，见 时间线.ts 文件头）：
// - 6-3-3 俯冲（原速）：接 6-3-2 思索推近，他已经头朝下摆好锤击架势往下冲（用户 10-19：不演从扫帚上跳下来）。起身、跃出、翻身的动作照算（物理连续），只是画面从 `刻`.俯冲起 开始。
//   被推着高速下冲（用户 10-05，推力见 时间线.ts 的 `鼓风机`），不画推力来源（用户 10-10）；锤往回抡到脑后，压路机虚影浮现、金光亮满（编排/李樱.ts 的 `strikeTracks`）。
// - 6-3-4 城防：从 6-3-3 俯冲硬切到北城墙，子弹时间。按用户 10-13「先瞭望，听到声音回头看，看到金光再拿望远镜细看」分拍，机位见 `cam634`；望远镜里是正抡着锤的他。
// - 6-3-5 举锤（原速）：硬切到李樱左侧正侧面（看清抡锤的弧线），物理时间回到切城墙那一刻；边冲边喊「ロードローラーだッ！」，锤一路拉满。
// - 6-3-6 砸穿：原速。锤砸下、虚影先撞地、金光炸开成坑；镜头跟他钻进竖井、冲破古城洞顶落地，震波（../6-3-6/震地.tsx），他翻身站起。
// 代码分在 编排/ 下；这里留汇报和接 6-4-1 用的两个函数。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { FPS, 刻, 撞击时刻, 段表, 物理时间 } from './时间线.ts';
import { shaftLayout as 竖井4x } from '../../古城4x/布局.ts';
import { liYing, liYingShaft, strikeDepth, LY_LEAP_HIP } from './编排/李樱.ts';
import { shaftCellCenter } from './编排/坑口.ts';

export { groundZ, ancientCity, caveCeilingZ, ancientCityFloorZ } from './编排/地面.ts';
export { type BroomState, broomState, broomMatrixAt, type JiuhuState, jiuhu } from './编排/扫帚.ts';
export { type LiYingState, rollerGhostScale, rollerRadius, strikeDepth, landingSpot, liYingShaft, shoutLine, liYing, maceHeadPos } from './编排/李樱.ts';
export { goldGlow, liYingHip } from './编排/金光.ts';
export { shaftCellCenter, shaftHalfWidth, crater } from './编排/坑口.ts';
export { guardPositions, guardHeadDown, GUARD_I, guardRaiseSec, raiseDuration, type GuardPose, guardPoseAt, guardEye } from './编排/卫兵.ts';
export { type Cam, hiddenGuardIdx, camPose } from './编排/机位.ts';

// 撞击时李樱的速度、打穿洞顶的时刻等（汇报、核对用）
export const fallStats = () => {
  const imp = 撞击时刻();
  const shaft = liYingShaft();
  return { leap: 刻.leap, 撞击: +imp.toFixed(3), impactSpeed: +shaft.impactSpeed.toFixed(1), shaftEntrySpeed: shaft.entrySpeed, ceilingBreach: +(imp + shaft.breachDelay).toFixed(3), 落地: +shaft.落地.toFixed(3), strikeDepth: +strikeDepth.toFixed(2), leapHip: LY_LEAP_HIP.map((v) => +v.toFixed(2)) };
};
// 6-3-6 末帧李樱的状态（6-4-1 首帧接它，G2 用）。古城场景坐标（古城4x.tsx 的 `G4`，同 `GUCHENG4X.落点`）：脚底 = 落点那格的格心、古城地面；
// 朝向（度，0 = 北 +Y，正 = 往左转，同 古城戏.ts）；姿势是站直、双臂微垂、右手握锤
export const liYingEnd636 = () => {
  const globalFrame = 段表['6-3-6'].止;
  const state = liYing(物理时间(globalFrame));
  const center = shaftCellCenter();
  const fwd = new THREE.Vector3(0, 1, 0).transformDirection(state.matrix);
  const yawDeg = (Math.atan2(-fwd.x, fwd.y) * 180) / Math.PI;
  const ancientLanding = 竖井4x.落点; // = GUCHENG4X.落点
  return {
    全局帧: globalFrame,
    脚底: [ancientLanding[0] + state.hip[0] - center[0], ancientLanding[1] + state.hip[1] - center[1], 0] as V3,
    朝向: +yawDeg.toFixed(1),
    pose: state.pose,
    锤: '右手',
  };
};
export { FPS };
