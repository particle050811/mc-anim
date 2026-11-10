// 过度生长（goety:overgrowth_focus → OvergrowthSpell）的元数据和摆位。出处见 过度生长.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** summonSurroundTrap：目标周围 8 格，游戏坐标的 (x, z) 偏移，第 i 根 warmup = i 刻 */
const 围位 = [[1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1]] as const;
export const 藤蔓位 = (目标: 点): 点[] => 围位.map(([x, z]) => [目标[0] + x, 目标[1] - z, 目标[2]] as const);
/** AbstractVine：warmup 走完后 activeTick 第 1 刻破土（BURST 0.75 秒），第 15 刻转 IDLE，lifeSpan 3 秒到了 BURROW（0.75 秒）缩回 */
export const 藤蔓破土刻 = (i: number) => i + 1;
export const 藤蔓闲刻 = 15;
export const 藤蔓寿命刻 = 60;
export const 藤蔓缩回用刻 = 15;

export default 定义法术元({
  id: 'overgrowth',
  长秒: (藤蔓破土刻(7) + 藤蔓寿命刻 + 藤蔓缩回用刻 + 5) / 20,
  // QuickGrowingVine.burst / burrow：各一声（音量 2），8 根错开 1 刻，这里记头一根
  声音: [
    { 资产: '音效/诡厄巫法/goety.quick_growing_vine_burst.1', 秒: 藤蔓破土刻(0) / 20, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.quick_growing_vine_burrow.1', 秒: (藤蔓破土刻(0) + 藤蔓寿命刻) / 20, 音量: 2 },
  ],
});
