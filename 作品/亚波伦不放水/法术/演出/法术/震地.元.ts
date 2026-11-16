// 震地（goety:quaking_focus → QuakingSpell）的元数据和排位。出处见 震地.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** 默认 range 12：第 i 刻震到施法者前方第 i 格（i = 0～12） */
export const quakeRange = 12;
/** 三列：正前方和左右各偏 1.5 格 */
export const sideOffsets = [0, 1.5, -1.5] as const;
/** 弹起的方块最多活的刻数（popUp 给得大时），收尾留的余量 */
const tailTicks = 12;

const duration = (from: Vec3, target: Vec3) => {
  const distance = Math.round(Math.hypot(target[0] - from[0], target[1] - from[1]));
  return { 长秒: (quakeRange + tailTicks) / 20, ...(distance <= quakeRange ? { hitSec: distance / 20 } : {}) };
};

// distance % 4 == 0 的那几刻（0、4、8、12），三列各响一组 WALL_ERUPT + DIRT_DEBRIS + GENERIC_EXPLODE（音高 0.8～1.2）；这里每刻记一组
const soundTicks = [0, 4, 8, 12];
export default defineSpellMeta({
  id: 'quaking',
  ...duration([-10, 0, 7], [0, 0, 0]),
  duration: duration,
  sound: soundTicks.flatMap((tick) => [
    { asset: '音效/诡厄巫法/goety.wall_erupt.1', sec: tick / 20 },
    { asset: '音效/诡厄巫法/goety.dirt_debris.1', sec: tick / 20 },
    { asset: '音效/entity.generic.explode.1', sec: tick / 20 },
  ]),
});
