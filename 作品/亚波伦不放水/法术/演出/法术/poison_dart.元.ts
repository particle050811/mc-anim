// 毒镖（goety:poison_dart_focus）的元数据和弹道。出处见 poison_dart.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory, aimPoint } from '../零件/甲/共用.ts';

/** PoisonQuill 是箭一类：出手 1.6 格/刻，阻力 0.99、重力 0.05；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const poisonDartPath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory(from, aimPoint(target), 1.6 + highSpeed / 3, { drag: 0.99, 重力: 0.05 });

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = poisonDartPath(from, target, options?.highSpeed).arriveTick / 20;
  // 尾迹粒子活 10 刻
  return { 长秒: hitSec + 0.6, hitSec };
};

export default defineSpellMeta({
  id: 'poison_dart',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // PoisonDartSpell：POISON_QUILL_VINE_SHOOT；命中 POISON_QUILL_IMPACT
  声音: [
    { 资产: '音效/诡厄巫法/goety.poison_quill_vine_shoot.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.poison_quill_impact.1', 秒: 0, fromHit: true },
  ],
});
