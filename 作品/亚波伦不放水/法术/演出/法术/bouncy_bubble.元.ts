// 弹跳泡泡（goety:bouncy_bubble_focus）的元数据和弹道。出处见 bouncy_bubble.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, addVec, scaleVec, unitVec, vecLength, type Trajectory } from '../零件/弹道.ts';
import { aimPoint } from '../零件/甲/共用.ts';

/**
 * BouncyBubble（SpellHurtingProjectile）：出手速度 = 视线 × 0.82；BouncyBubble.travel 覆写成每刻只 位 += 速、再减 getGravity()（返回 0），
 * 没有惯性和推力，所以一直是 0.82 格/刻匀速；
 * 碰到方块或人就反弹（这里照镜面反射算），弹满 6 次或活到 100 刻就爆。返回弹道、各次反弹的刻、爆的刻。
 */
export const bubblePath = (from: Vec3, target: Vec3): { trajectory: Trajectory; bounceTicks: number[]; burstTick: number } => {
  const dir = unitVec(sub(aimPoint(target), from));
  const pointTable: Vec3[] = [from];
  const bounceTicks: number[] = [];
  let speedVec: Vec3 = scaleVec(dir, 0.82);
  let burstTick = 100;
  for (let n = 0; n < 100; n++) {
    let pos = addVec(pointTable[n]!, speedVec);
    const hitTarget = vecLength(sub(pos, aimPoint(target))) < 0.75 && speedVec[0] * (target[0] - pos[0]) + speedVec[1] * (target[1] - pos[1]) > 0;
    const hitGround = pos[2] <= target[2];
    if (hitTarget || hitGround) {
      if (bounceTicks.length >= 6) {
        pointTable.push(pos);
        burstTick = n + 1;
        break;
      }
      bounceTicks.push(n + 1);
      if (hitGround) {
        pos = [pos[0], pos[1], target[2]];
        speedVec = [speedVec[0], speedVec[1], Math.abs(speedVec[2])];
      } else {
        speedVec = [-speedVec[0], -speedVec[1], speedVec[2]];
      }
    }
    pointTable.push(pos);
  }
  return { trajectory: (n) => pointTable[Math.min(pointTable.length - 1, Math.max(0, Math.floor(n)))]!, bounceTicks, burstTick };
};

const duration = (from: Vec3, target: Vec3) => {
  const { bounceTicks, burstTick } = bubblePath(from, target);
  return { 长秒: burstTick / 20 + 1, hitSec: (bounceTicks[0] ?? burstTick) / 20 };
};

export default defineSpellMeta({
  id: 'bouncy_bubble',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // BouncyBubbleSpell：GENERIC_SPLASH；爆 BUBBLE_COLUMN_BUBBLE_POP、GENERIC_SPLASH（爆的时刻随距离变，这里按参考距离写死在 时长 之外，段里要准的用 泡泡道().爆刻）
  声音: [{ 资产: '音效/entity.generic.splash.1', 秒: 0 }],
});
