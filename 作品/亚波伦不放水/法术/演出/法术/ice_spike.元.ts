// 冰刺（goety:ice_spike_focus）的元数据和弹道。出处见 ice_spike.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory, aimPoint } from '../零件/甲/共用.ts';

/** IceSpike 是箭一类（AbstractArrow）：出手 1.6 格/刻，阻力 0.99、重力 0.05；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const iceSpikePath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory(from, aimPoint(target), 1.6 + highSpeed / 3, { drag: 0.99, 重力: 0.05 });

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = iceSpikePath(from, target, options?.highSpeed).arriveTick / 20;
  return { 长秒: hitSec + 2, hitSec };
};

export default defineSpellMeta({
  id: 'ice_spike',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // IceSpikeSpell：ICE_SPIKE_CAST；命中 ICE_SPIKE_HIT 音高 1.2 ÷ (随机 × 0.2 + 0.9)，这里取 1.2
  sound: [
    { asset: '音效/诡厄巫法/goety.ice_spike_cast', sec: 0 },
    { asset: '音效/诡厄巫法/goety.ice_spike_hit.1', sec: 0, fromHit: true, 音高: 1.2 },
  ],
});
