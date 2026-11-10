// 凋灵之首（goety:wither_skull_focus）的元数据和弹道。出处见 wither_skull.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 火球一发 } from '../零件/甲/火球.ts';

/** 原版 WitherSkull：惯性 0.73（稳态 0.27 格/刻，很慢）；配下界魔杖 3 颗 */
export const 凋灵之首弹 = (起点: 点, 目标: 点, 种子: number) => 火球一发(起点, 目标, 0, { 惯性: 0.73, 多颗: 2, 种子 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 凋灵之首弹(起点, 目标, 0)[0]!.飞刻 / 20;
  return { 长秒: 命中秒 + 1.5, 命中秒 };
};

export default 定义法术元({
  id: 'wither_skull',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // WitherSkullSpell：WITHER_SHOOT 音量 2；命中爆炸 GENERIC_EXPLODE
  声音: [
    { 资产: '音效/entity.wither.shoot', 秒: 0, 音量: 2 },
    { 资产: '音效/entity.generic.explode.1', 秒: 0, 从命中: true, 音量: 4 },
  ],
});
