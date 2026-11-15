// 重击石（goety:smack_stone_focus）的元数据和弹道。出处见 smack_stone.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory, aimPoint } from '../零件/甲/共用.ts';

/** SmackStone 是投掷物（SpellThrowableProjectile）：出手 1.6 格/刻，阻力 0.99、重力 0.03；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const smackStonePath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory(from, aimPoint(target), 1.6 + highSpeed / 3, { drag: 0.99, 重力: 0.03 });

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const hitSec = smackStonePath(from, target, options?.highSpeed).arriveTick / 20;
  return { 长秒: hitSec + 0.5, hitSec };
};

export default defineSpellMeta({
  id: 'smack_stone',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // SmackStoneSpell：BASALT_PLACE；命中 BASALT_BREAK 音高 2
  声音: [
    { 资产: '音效/block.basalt.place.1', 秒: 0 },
    { 资产: '音效/block.basalt.break.1', 秒: 0, fromHit: true, 音高: 2 },
  ],
});
