// 魔弹（goety:magic_bolt_focus）的元数据和弹道。出处见 magic_bolt.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 火球道 } from '../零件/弹道.ts';
import { 终刻, 瞄点 } from '../零件/甲/共用.ts';

/** MagicBolt（SpellHurtingProjectile）：惯性 0.82、加速 0.1 */
export const 魔弹道 = (起点: 点, 目标: 点) => 火球道(起点, 减(瞄点(目标), 起点), { 惯性: 0.82 });
/** 实体 0.625 格见方，离胸口 0.6 格算碰上 */
export const 魔弹命中刻 = (起点: 点, 目标: 点) => 终刻(魔弹道(起点, 目标), 目标, 0.6);
/** 命中后留在地上的 MagicGround 活 100 刻 */
export const 魔弹地面刻 = 100;

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 魔弹命中刻(起点, 目标) / 20;
  return { 长秒: 命中秒 + 魔弹地面刻 / 20 + 1, 命中秒 };
};

export default 定义法术元({
  id: 'magic_bolt',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // MagicBoltSpell：CAST_SPELL
  声音: [{ 资产: '音效/诡厄巫法/goety.cast_spell.1', 秒: 0 }],
});
