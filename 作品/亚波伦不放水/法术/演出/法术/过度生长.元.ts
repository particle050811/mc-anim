// 过度生长（goety:overgrowth_focus → OvergrowthSpell）的元数据和摆位。出处见 过度生长.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** summonSurroundTrap：目标周围 8 格，游戏坐标的 (x, z) 偏移，第 i 根 warmup = i 刻 */
const surroundOffsets = [[1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1]] as const;
export const vinePositions = (target: Vec3): Vec3[] => surroundOffsets.map(([x, z]) => [target[0] + x, target[1] - z, target[2]] as const);
/** AbstractVine：warmup 走完后 activeTick 第 1 刻破土（BURST 0.75 秒），第 15 刻转 IDLE，lifeSpan 3 秒到了 BURROW（0.75 秒）缩回 */
export const vineEmergeTick = (i: number) => i + 1;
export const vineIdleTicks = 15;
export const vineLifeTicks = 60;
export const vineRetractSpanTicks = 15;

export default defineSpellMeta({
  id: 'overgrowth',
  长秒: (vineEmergeTick(7) + vineLifeTicks + vineRetractSpanTicks + 5) / 20,
  // QuickGrowingVine.burst / burrow：各一声（音量 2），8 根错开 1 刻，这里记头一根
  sound: [
    { asset: '音效/诡厄巫法/goety.quick_growing_vine_burst.1', sec: vineEmergeTick(0) / 20, 音量: 2 },
    { asset: '音效/诡厄巫法/goety.quick_growing_vine_burrow.1', sec: (vineEmergeTick(0) + vineLifeTicks) / 20, 音量: 2 },
  ],
});
