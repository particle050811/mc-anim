// 凋灵寂灭（goety_revelation:wither_quietus_focus）的元数据。出处见 凋灵寂灭.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** QuietusVirtualEntity.lifetime：光束 8 刻里消散完 */
export const annihilationBeamTicks = 8;
/** 光束两头都在半身高（caster.getY(0.5)、target.getY(0.5)）；这里起点直接当施法者那头 */
export const annihilateLandPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

export default defineSpellMeta({
  id: 'wither_quietus',
  // 落点的灵魂粒子最长活 40 刻（原版 Particle 的寿命 4 ÷ (随机 × 0.9 + 0.1)）
  长秒: 40 / 20,
  hitSec: 0, // 射线判定，放出来当刻结算
  // WitherQuietusSpell：revelationfix 的 QUIETUS_BEAM，音量 1、音高 1
  声音: [{ 资产: '音效/启示录/revelationfix.quietus_beam', 秒: 0 }],
});
