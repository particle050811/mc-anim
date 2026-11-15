// 虚空闪（goety:void_flash_focus）的元数据和弹道。出处见 void_flash.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory } from '../零件/甲/共用.ts';
import { voidShockHitTick, type VoidShock } from '../零件/甲/虚空震.ts';

/** VoidShockBomb（SpellThrowableProjectile）：从施法者头顶上 1 格抛出，出手 1.0 格/刻，阻力 0.99、重力 0.025；这里朝史蒂夫脚边的地面抛；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const voidFlashBombPath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory([from[0], from[1], from[2] + 1], [target[0] - 1.5, target[1], target[2]], 1.0 + highSpeed / 3, { drag: 0.99, 重力: 0.025 });
/** 落地生 8 颗虚空震弹：各自飘到 落点 + (−3～3, 3～6, −3～3) 的信号点，第 40 + i × 5 刻锁定 */
export const voidFlashShocks = (from: Vec3, target: Vec3, seed: number, highSpeed = 0): VoidShock[] => {
  const { trajectory, arriveTick } = voidFlashBombPath(from, target, highSpeed);
  const landing = trajectory(arriveTick);
  const r = mulberry32(seed * 43 + 5);
  const 整 = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  return Array.from({ length: 8 }, (_, i) => ({ launchTick: arriveTick, spawnPos: landing, hoverPos: [landing[0] + 整(-3, 3), landing[1] + 整(-3, 3), landing[2] + 整(3, 6)] as const, lockTick: 40 + i * 5 }));
};

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const shocks = voidFlashShocks(from, target, 1, options?.highSpeed);
  const hitTicks = shocks.map((tremor) => tremor.launchTick + voidShockHitTick(tremor, target));
  return { 长秒: Math.max(...hitTicks) / 20 + 0.8, hitSec: Math.min(...hitTicks) / 20 };
};

const makeSounds = (options?: SpellOptions) => [
  { 资产: '音效/诡厄巫法/goety.heavy_woosh.1', 秒: 0, 音量: 3 },
  { 资产: '音效/诡厄巫法/goety.teleport_orb_throw', 秒: 0, 音量: 3 },
  { 资产: '音效/entity.dragon_fireball.explode.1', 秒: voidFlashBombPath([-10, 0, 7], [0, 0, 0], options?.highSpeed).arriveTick / 20, 音量: 1.5, 音高: 0.75 },
  { 资产: '音效/诡厄巫法/goety.fungus_explosion.1', 秒: 0, fromHit: true },
];

export default defineSpellMeta({
  id: 'void_flash',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // VoidFlashSpell：HEAVY_WOOSH 音量 3、TELEPORT_ORB_THROW 音量 3；落地 DRAGON_FIREBALL_EXPLODE 音量 1.5、音高 0.75（落地时刻按参考距离写死）；撞上 FUNGUS_EXPLOSION
  声音: makeSounds(),
  soundsFor: makeSounds,
});
