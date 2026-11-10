// 火球术（goety:fireball_focus）的元数据和弹道。出处见 fireball.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 火球一发 } from '../零件/甲/火球.ts';

/** 配下界魔杖：3 颗 */
export const 火球术弹 = (起点: 点, 目标: 点, 种子: number) => 火球一发(起点, 目标, 0, { 多颗: 2, 种子 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 火球术弹(起点, 目标, 0)[0]!.飞刻 / 20;
  // 两边的两颗偏出去最多两三格，晚不了几刻；烟活 8～40 刻
  return { 长秒: 命中秒 + 1.5, 命中秒 };
};

export default 定义法术元({
  id: 'fireball',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // FireballSpell：BLAZE_SHOOT 音量 2
  声音: [{ 资产: '音效/entity.blaze.shoot', 秒: 0, 音量: 2 }],
});
