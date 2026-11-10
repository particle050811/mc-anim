// 熔岩炸弹（goety:lavaball_focus）的元数据和弹道。出处见 lavaball.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 火球一发 } from '../零件/甲/火球.ts';

/** 配下界魔杖：3 颗。大火球碰撞箱 1 格见方，离胸口 0.8 格算碰上 */
export const 熔岩炸弹弹 = (起点: 点, 目标: 点, 种子: number) => 火球一发(起点, 目标, 0, { 多颗: 2, 种子, 命中半径: 0.8 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 熔岩炸弹弹(起点, 目标, 0)[0]!.飞刻 / 20;
  return { 长秒: 命中秒 + 1.5, 命中秒 };
};

export default 定义法术元({
  id: 'lavaball',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // LavaballSpell：GHAST_SHOOT 音量 2；命中 Level.explode 的 GENERIC_EXPLODE（音量 4）
  声音: [
    { 资产: '音效/entity.ghast.shoot', 秒: 0, 音量: 2 },
    { 资产: '音效/entity.generic.explode.1', 秒: 0, 从命中: true, 音量: 4 },
  ],
});
