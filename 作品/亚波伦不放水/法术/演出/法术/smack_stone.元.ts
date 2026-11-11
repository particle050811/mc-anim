// 重击石（goety:smack_stone_focus）的元数据和弹道。出处见 smack_stone.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 抛射道, 瞄点 } from '../零件/甲/共用.ts';

/** SmackStone 是投掷物（SpellThrowableProjectile）：出手 1.6 格/刻，阻力 0.99、重力 0.03；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const 重击石道 = (起点: 点, 目标: 点, 高速 = 0) => 抛射道(起点, 瞄点(目标), 1.6 + 高速 / 3, { 阻力: 0.99, 重力: 0.03 });

const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 命中秒 = 重击石道(起点, 目标, 选项?.高速).到刻 / 20;
  return { 长秒: 命中秒 + 0.5, 命中秒 };
};

export default 定义法术元({
  id: 'smack_stone',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SmackStoneSpell：BASALT_PLACE；命中 BASALT_BREAK 音高 2
  声音: [
    { 资产: '音效/block.basalt.place.1', 秒: 0 },
    { 资产: '音效/block.basalt.break.1', 秒: 0, 从命中: true, 音高: 2 },
  ],
});
