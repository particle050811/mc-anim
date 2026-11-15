// 暴雪（goety:blizzard_focus）的元数据和弹的摆法。出处见 blizzard.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { arrowRain } from '../零件/甲/落雨.ts';

/** 游戏里按住每刻落一颗；片里一次演 2 秒共 40 颗 */
export const blizzardCount = 40;
export const blizzardShots = (target: Vec3, seed: number) => arrowRain(target, blizzardCount, seed + 1000);

const duration = (unusedStart: Vec3, target: Vec3) => {
  const landTicks = blizzardShots(target, 1).map((projectile) => projectile.launchTick + projectile.flightTick);
  return { 长秒: Math.max(...landTicks) / 20 + 1.5, hitSec: Math.min(...landTicks) / 20 };
};

export default defineSpellMeta({
  id: 'blizzard',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // BlizzardSpell：每颗一声 ICE_SPIKE_CAST（音量 2），这里每 5 刻记一声
  声音: Array.from({ length: blizzardCount / 5 }, (_, k) => ({ 资产: '音效/诡厄巫法/goety.ice_spike_cast', 秒: (k * 5) / 20, 音量: 2 })),
});
