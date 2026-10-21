// 监守者音爆（原版 1.20.1 SonicBoom 行为，照 client jar 反汇编）：粒子和时间点。动作是 角色/监守者.tsx 的 音爆 关键帧动画。
// - 开始（SonicBoom.start）：监守者进入音爆姿势（实体事件 62 → 客户端从头播 SONIC_BOOM 动画，3 秒），放 entity.warden.sonic_charge（音量 3、音高 1）。
// - 第 34 刻（1.7 秒，TICKS_BEFORE_PLAYING_SOUND）：起点 = 监守者位置（脚底中心）+ (0, 1.6, 0)，朝目标眼睛连线；
//   i = 1 … floor(距离) + 6，每格一个 sonic_boom（sendParticles 数量 1、散布 0）——同一刻一起出现，一条直线穿过目标再往后 6 格；
//   同时放 entity.warden.sonic_boom（音量 3、音高 1），目标受 10 点伤害、被击退（水平 2.5、竖直 0.5，乘 1 − 击退抗性）。
//   这一刻没有看到目标（不在 15 格内或看不见）就不放。整个行为 60 刻，第 60 刻结束、冷却 40 刻。
// - sonic_boom 粒子：寿命 16 刻、半边长 1.5、灰度随机 0.4～1、全亮，贴图 sonic_boom_0～15 按年龄换（见 原版粒子.tsx）。
// 坐标：场景坐标（Z 朝上），单位格；时间：刻（1 秒 20 刻）。
import type { V3 } from '../../engine/model/parts.tsx';
import type { ParticleSpawn } from './原版粒子.tsx';

export const sonicBoomParams = { fireTick: 34, totalTicks: 60, cooldownTicks: 40, startHeight: 1.6, extraBlocks: 6, damage: 10, knockback: { 水平: 2.5, vertical: 0.5 } };

// 监守者脚底、目标眼睛（场景坐标）；刻 = 出手那一刻（一般是 音爆开始刻 + 34）
export const sonicBoomParticles = (wardenFeet: V3, targetEye: V3, tick: number, seed: number): ParticleSpawn[] => {
  const origin: V3 = [wardenFeet[0], wardenFeet[1], wardenFeet[2] + sonicBoomParams.startHeight];
  const delta: V3 = [targetEye[0] - origin[0], targetEye[1] - origin[1], targetEye[2] - origin[2]];
  const len = Math.hypot(...delta) || 1;
  const dir: V3 = [delta[0] / len, delta[1] / len, delta[2] / len];
  const out: ParticleSpawn[] = [];
  for (let i = 1; i <= Math.floor(len) + sonicBoomParams.extraBlocks; i++) out.push({ 种: 'sonic_boom', 刻: tick, p: [origin[0] + dir[0] * i, origin[1] + dir[1] * i, origin[2] + dir[2] * i], 种子: seed * 977 + i });
  return out;
};
