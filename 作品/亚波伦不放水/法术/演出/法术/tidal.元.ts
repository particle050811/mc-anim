// 潮涌（goety:tidal_focus）的元数据和弹道。出处见 tidal.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, addVec, scaleVec, unitVec, vecLength, type Trajectory } from '../零件/弹道.ts';

/** 浪从施法者脚下贴地出发：片里取 起点 正下方的地面 */
export const tidalStart = (from: Vec3, target: Vec3): Vec3 => [from[0], from[1], target[2]];
/**
 * TidalSurge（AbstractWave）：每刻 速 = 速 × 0.9 + 方向 × (f² × 0.2)，f = min(活跃刻 ÷ 10, 1)，再 × 0.99；寿命 = floor(距离) + 10。
 * 到寿命或撞到人就停下拍 10 刻（slam），再 10 刻缩没（waveScale 每刻 − 0.1）。返回弹道、停下的刻。
 */
export const tidalPath = (from: Vec3, target: Vec3): { trajectory: Trajectory; stopTick: number } => {
  const startPos = tidalStart(from, target);
  const dir = unitVec(sub(target, startPos));
  const lifetime = Math.floor(vecLength(sub(target, startPos))) + 10;
  const pointTable: Vec3[] = [startPos];
  let speedVec: Vec3 = [0, 0, 0];
  let stopTick = lifetime;
  for (let n = 0; n < lifetime; n++) {
    const f = Math.min(n / 10, 1);
    speedVec = scaleVec(addVec(scaleVec(speedVec, 0.9), scaleVec(dir, f * f * 0.2)), 0.99);
    pointTable.push(addVec(pointTable[n]!, speedVec));
    if (vecLength(sub(target, pointTable[n + 1]!)) < 1) {
      stopTick = n + 1;
      break;
    }
  }
  return { trajectory: (n) => pointTable[Math.min(pointTable.length - 1, Math.max(0, Math.floor(n)))]!, stopTick };
};

const duration = (from: Vec3, target: Vec3) => {
  const hitSec = tidalPath(from, target).stopTick / 20;
  return { 长秒: hitSec + 1, hitSec };
};

export default defineSpellMeta({
  id: 'tidal',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // TidalSpell：PLAYER_SPLASH_HIGH_SPEED；浪每 5 刻一声 GENERIC_SWIM 音量 0.15（没记）
  sound: [{ asset: '音效/entity.player.splash.high_speed', sec: 0 }],
});
