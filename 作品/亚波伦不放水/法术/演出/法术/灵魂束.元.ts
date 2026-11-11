// 灵魂束（goety:soul_bolt_focus）的元数据和弹道。出处见 灵魂束.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 减, 命中刻, 火球道 } from '../零件/弹道.ts';

/** 打史蒂夫的哪：游戏里弹是朝视线飞的，这里瞄胸口（脚底上 0.9 格） */
export const 灵魂束瞄点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];
/** SpellHurtingProjectile：惯性 0.82，加速 0.1（稳态 0.456 格/刻 ≈ 9.1 格/秒）；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const 灵魂束道 = (起点: 点, 目标: 点, 高速 = 0) => 火球道(起点, 减(灵魂束瞄点(目标), 起点), { 惯性: 0.82 + 高速 / 50 });
/** 碰到史蒂夫的刻：史蒂夫碰撞箱宽 0.6，弹宽 0.3125，取离瞄点 0.45 格算碰上 */
export const 灵魂束命中刻 = (起点: 点, 目标: 点, 高速 = 0) => 命中刻(灵魂束道(起点, 目标, 高速), 灵魂束瞄点(目标), 0.45) ?? 200;

// 命中粒子最长活 40 刻（AdditiveSpellParticle 的寿命 8 ÷ (随机 × 0.8 + 0.2)）
const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 命中秒 = 灵魂束命中刻(起点, 目标, 选项?.高速) / 20;
  return { 长秒: 命中秒 + 2, 命中秒 };
};

export default 定义法术元({
  id: 'soul_bolt',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SoundUtil.playSoulBolt：三声一起响；命中 SoulBolt.onHit 的 BOLT_IMPACT。同一事件有几个变体的取第 1 个
  声音: [
    { 资产: '音效/诡厄巫法/goety.soul_bolt_cast', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.vex_vapor.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.cast_spell_two.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.bolt_impact.1', 秒: 0, 从命中: true },
  ],
});
