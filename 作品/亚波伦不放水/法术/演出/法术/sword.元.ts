// 魔力剑（goety:sword_focus）的元数据和弹道。出处见 sword.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 抛射道, 瞄点 } from '../零件/甲/共用.ts';

/** SwordProjectile 是箭一类：shootFromRotation 出手 1.6 格/刻，阻力 0.99、重力 0.05；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const 魔力剑道 = (起点: 点, 目标: 点, 高速 = 0) => 抛射道(起点, 瞄点(目标), 1.6 + 高速 / 3, { 阻力: 0.99, 重力: 0.05 });

const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 命中秒 = 魔力剑道(起点, 目标, 选项?.高速).到刻 / 20;
  // 附魔台粒子活 30～40 刻
  return { 长秒: 命中秒 + 2, 命中秒 };
};

export default 定义法术元({
  id: 'sword',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SwordSpell：DROWNED_SHOOT；命中 TRIDENT_HIT
  声音: [
    { 资产: '音效/entity.drowned.shoot.1', 秒: 0 },
    { 资产: '音效/item.trident.hit.1', 秒: 0, 从命中: true },
  ],
});
