// 障碍（goety:barricade_focus → BarricadeSpell）的元数据和摆位。出处见 障碍.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** TotemicWall：每刻 age + 5，60 满（12 刻升完）；lifeSpan 6 秒到了每刻 − 5 沉回去，age ≤ 0 消失 */
export const 墙升刻 = 12;
export const 墙寿命刻 = 120;
export const 墙总刻 = 墙寿命刻 + 墙升刻 + 1;
/** 某一刻的 age（0～60） */
export const 墙龄 = (刻: number) => (刻 < 墙寿命刻 ? Math.min(60, Math.floor(刻) * 5) : Math.max(0, 60 - (Math.floor(刻) - 墙寿命刻 + 1) * 5));

// WandUtil.getXShift / getZShift：方阵 16 个位置（5×5 的外圈），游戏坐标的 x、z 偏移
const X移 = (i: number) => ([0, 1, 2, 14, 15].includes(i) ? -2 : i >= 6 && i <= 10 ? 2 : i === 3 || i === 13 ? -1 : i === 5 || i === 11 ? 1 : 0);
const Z移 = (i: number) => (i >= 10 && i <= 14 ? -2 : i >= 2 && i <= 6 ? 2 : i === 9 || i === 15 ? -1 : i === 1 || i === 7 ? 1 : 0);
/** 缺一边的方阵（summonSquareTrap）：目标面朝西时去掉 CONFIG_1_WEST_ROW = 6～10（片里史蒂夫面朝亚波伦，核对段里是朝西） */
export const 障碍墙位 = (目标: 点): 点[] =>
  Array.from({ length: 16 }, (_, i) => i)
    .filter((i) => i < 6 || i > 10)
    .map((i) => [目标[0] + X移(i), 目标[1] - Z移(i), 目标[2]] as const);

export default 定义法术元({
  id: 'barricade',
  长秒: 墙总刻 / 20,
  // TotemicWall.finalizeSpawn：WALL_SPAWN（音量 2）、WALL_ERUPT，11 根各响一遍，这里各记一声；到寿命时 WALL_DISAPPEAR（音量 2）
  声音: [
    { 资产: '音效/诡厄巫法/goety.wall_spawn.1', 秒: 0, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.wall_erupt.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.wall_disappear', 秒: 墙寿命刻 / 20, 音量: 2 },
  ],
});
