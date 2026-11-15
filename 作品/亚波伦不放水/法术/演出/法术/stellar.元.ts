// 星陨（goety:stellar_focus）的元数据和弹的摆法。出处见 stellar.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { voidShockHitTick, type VoidShock } from '../零件/甲/虚空震.ts';

/** 游戏里按住从第 10 刻起每 5 刻生一颗；片里一次演 4 颗 */
export const starfallCount = 4;
/** 生在 施法者位置 + (−3～3 的整数, 身高 + 1, −3～3 的整数)；片里把 起点 当施法者头顶，往上 1 格。悬 10 刻后锁定 */
export const starfallShocks = (from: Vec3, seed: number): VoidShock[] => {
  const r = mulberry32(seed * 41 + 9);
  const jitter = () => Math.floor(r() * 7) - 3;
  return Array.from({ length: starfallCount }, (_, k) => {
    const spawnPos: Vec3 = [from[0] + jitter(), from[1] + jitter(), from[2] + 1];
    return { launchTick: 10 + k * 5, spawnPos, hoverPos: spawnPos, lockTick: 10 };
  });
};

const duration = (from: Vec3, target: Vec3) => {
  const shocks = starfallShocks(from, 1);
  const hitTicks = shocks.map((tremor) => tremor.launchTick + voidShockHitTick(tremor, target));
  return { 长秒: Math.max(...hitTicks) / 20 + 0.8, hitSec: Math.min(...hitTicks) / 20 };
};

export default defineSpellMeta({
  id: 'stellar',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // VoidShockSpell：起手 VOID_PREPARE_SPELL；每颗生出来 TELEPORT_ORB_THROW 音量 2；撞上 FUNGUS_EXPLOSION（只挂了第一颗）
  声音: [
    { 资产: '音效/诡厄巫法/goety.void_prepare_spell.1', 秒: 0 },
    ...Array.from({ length: starfallCount }, (_, k) => ({ 资产: '音效/诡厄巫法/goety.teleport_orb_throw', 秒: (10 + k * 5) / 20, 音量: 2 })),
    { 资产: '音效/诡厄巫法/goety.fungus_explosion.1', 秒: 0, fromHit: true },
  ],
});
