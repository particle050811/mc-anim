// 剃刀风（goety:razor_wind_focus）的元数据和弹道。出处见 razor_wind.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, scaleVec, unitVec, straightLine } from '../零件/弹道.ts';
import { trajectoryGroundTick, aimPoint } from '../零件/甲/共用.ts';

/** RazorWind：沿视线匀速 2 格/刻，不受重力，最多活 40 刻；穿过人不停，这里飞到落地为止 */
export const razorWindPath = (from: Vec3, target: Vec3) => straightLine(from, scaleVec(unitVec(sub(aimPoint(target), from)), 2));
export const razorWindEndTick = (from: Vec3, target: Vec3) => Math.min(40, trajectoryGroundTick(razorWindPath(from, target), target[2], 40) ?? 40);

const duration = (from: Vec3, target: Vec3) => {
  const toTarget = sub(aimPoint(target), from);
  const hitSec = Math.hypot(toTarget[0], toTarget[1], toTarget[2]) / 2 / 20;
  // 云粒子最长活 60 多刻
  return { 长秒: razorWindEndTick(from, target) / 20 + 2, hitSec };
};

export default defineSpellMeta({
  id: 'razor_wind',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // RazorWindSpell：WIND 音量 2、音高 1.5
  声音: [{ 资产: '音效/诡厄巫法/goety.wind.1', 秒: 0, 音量: 2, 音高: 1.5 }],
});
