// 6-3 下坠的起点和动作时刻（纯数据）：时间线.ts、编排/扫帚.ts、编排/李樱姿势.ts、6-3-3/下落攻击.ts 共用。
// 单放出来是为了让 时间线.ts 能 import 李樱的姿势（算起跳点、撞击深度）而不成环：这几个模块只引本文件，不引 时间线.ts。
// 时间线.ts 原样转出这些名字，别的引用方照旧从 时间线.ts 取。
import * as K626 from '../6-2-6/编排.ts';

// ---------- 起点：6-2-6 末帧 ----------
export const start = {
  broom: K626.broom(K626.lastSec),
  camera: K626.camera(K626.lastSec),
  riders: K626.riders(K626.lastSec),
  visibility: K626.visibility(K626.lastSec),
};

// ---------- 动作的物理时刻（秒） ----------
export const tick = {
  standUp: 0.12, // 李樱从跨坐站起来（0.12～0.7）
  releaseWaist: 0.15, // 九胡松开抱着的腰、改扶扫帚杆（她在驾驶扫帚，一直坐在后座上）
  reachForMace: 0.62, // 右手往右肩后面够（0.62～0.86），够到时锤出现
  maceAppears: 0.86,
  swingOut: 1.2, // 锤从背后抡到身前，左手也握上去
  crouch: 1.24, // 蹲下蓄力（1.24～1.5）
  leap: 1.55, // 脚一蹬，头朝下纵身跃出（往前 1.5 米/秒、往下 12 米/秒）
  flipDone: 1.97, // 往前翻成头朝下（跃出后 0.42 秒），鼓风机从这一刻起推
  swingBackStart: 2.3, // 翻完收住架势（6-3-3/下落攻击.ts 2.275 秒）马上把锤往回抡、边冲边喊（编排/李樱.ts 的 `strikeTracks`，用户 10-19 定）
  diveStart: 2.25, // 全局秒 0：上画面的第一刻。翻完的架势已经收稳（臂 168°、腿并拢），锤还没往回抡，思索里的李樱摆的就是这一刻的姿势
};
// 思索盖着的时候九胡把扫帚拉高几米，李樱从更高处跃出（拉高在物理时间 0～`刻`.standUp，藏在全局秒 0 那一跳里，不上画面）。
// 用户 10-20 嫌思索过后下落太短：6-3-3 加长 1 秒，拉高的就是这 1 秒在极速下冲的路，切城墙到砸地（6-3-4～6-3-6）和以前一样。改 6-3-3 段长要跟着改，核对 6-3-5 首帧物理时间 ≈ 切城墙那一刻
export const thinkPullUp = 360;
// 跃出到翻完这 0.42 秒没有推力，只有重力加空气阻力（李樱头朝下俯冲的终端速度 90）
export const liYingTerminalSpeed = 90;

// ---------- 鼓风机推力 ----------
// 只是推力的数值，画面上不画鼓风机、没有嗡鸣（用户 10-10）；声音.tsx 的风声（`AirCurrentSound`）还按它的 `开`、`rpm` 算。
// 照机械动力 6.0.8 鼓风机吹实体（`AirCurrent.tickAffectedEntities` 字节码）：每刻速度往目标速度拉 clamp(差, ±5 格/刻) × 0.125，
// 即最多 250 米/秒²、离目标不到 100 米/秒后按时间常数 0.4 秒贴近。目标速度竖直朝下，起跳往前的 1.5 米/秒被拉回 0；原版叠加的重力和 0.98 阻力省掉。
// 极速 360 米/秒（约 1.05 马赫）：用户选的「约 1 秒冲到 300～400」的中间；翻完开推，1.18 秒到 300、1.68 秒过音速。
// 目标速度的水平分量按落点反算，见 时间线.ts 的 `solveFall`
export const blower = { topSpeed: 360, maxAccel: 250, timeConst: 0.4, 开: tick.flipDone, rpm: 256 };

// 扫帚坐标系里的方向（朝向 0 = +Y 北，正 = 往左转）
export const yawVec = (yawDeg: number) => {
  const rad = (yawDeg * Math.PI) / 180;
  return { fwd: [-Math.sin(rad), Math.cos(rad)], right: [Math.cos(rad), Math.sin(rad)] };
};
