// 箭雨（goety:arrow_rain_focus）的元数据和弹的摆法。出处见 arrow_rain.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { arrowRain } from '../零件/甲/落雨.ts';

/** 游戏里按住每刻落一支；片里一次演 2 秒共 40 支 */
export const arrowRainCount = 40;
export const arrowRainShots = (target: Vec3, seed: number) => arrowRain(target, arrowRainCount, seed);

const duration = (unusedStart: Vec3, target: Vec3) => {
  const landTicks = arrowRainShots(target, 1).map((projectile) => projectile.launchTick + projectile.flightTick);
  return { 长秒: Math.max(...landTicks) / 20 + 1, hitSec: Math.min(...landTicks) / 20 };
};

export default defineSpellMeta({
  id: 'arrow_rain',
  ...duration([-10, 0, 7], [0, 0, 0]),
  时长: duration,
  // ArrowRainSpell：每支一声 ARROW_SHOOT（音量 2），这里每 5 刻记一声
  声音: Array.from({ length: arrowRainCount / 5 }, (_, k) => ({ 资产: '音效/entity.arrow.shoot', 秒: (k * 5) / 20, 音量: 2 })),
});
