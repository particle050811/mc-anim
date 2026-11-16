// 绽放（goety:blossoming_focus）的元数据和弹道。出处见 blossoming.tsx。
import { defineSpellMeta, type SpellOptions, type Vec3 } from '../接口.ts';
import { launchTrajectory } from '../零件/甲/共用.ts';

/** BlossomBall（SpellThrowableProjectile）：出手 1.5 格/刻，阻力 0.99、重力 0.03；片里朝史蒂夫脚下的地面抛；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const blossomPath = (from: Vec3, target: Vec3, highSpeed = 0) => launchTrajectory(from, target, 1.5 + highSpeed / 3, { drag: 0.99, 重力: 0.03 });
/** 花刺落地后预警 30 刻再钻出来，钻出来活 20 刻 */
export const thornWarnTicks = 30;
export const thornLifeTicks = 20;

const duration = (from: Vec3, target: Vec3, options?: SpellOptions) => {
  const landSec = blossomPath(from, target, options?.highSpeed).arriveTick / 20;
  return { 长秒: landSec + (thornWarnTicks + thornLifeTicks) / 20 + 0.1, hitSec: landSec + thornWarnTicks / 20 };
};

const makeSounds = (options?: SpellOptions) => [
  { asset: '音效/诡厄巫法/goety.blast_fungus_throw.1', sec: 0, 音高: 0.75 },
  { asset: '音效/诡厄巫法/goety.quick_growing_vine_burrow.1', sec: blossomPath([-10, 0, 7], [0, 0, 0], options?.highSpeed).arriveTick / 20, 音量: 2, 音高: 0.75 },
];

export default defineSpellMeta({
  id: 'blossoming',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  // BlossomSpell：BLAST_FUNGUS_THROW 音高 0.75；落地 QUICK_GROWING_VINE_BURROW 音量 2、音高 0.75（落地时刻按参考距离写死）
  sound: makeSounds(),
  soundsFor: makeSounds,
});
