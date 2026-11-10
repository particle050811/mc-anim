// 重击石（goety:smack_stone_focus）的元数据和弹道。出处见 smack_stone.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 抛射道, 瞄点 } from '../零件/甲/共用.ts';

/** SmackStone 是投掷物（SpellThrowableProjectile）：出手 1.6 格/刻，阻力 0.99、重力 0.03 */
export const 重击石道 = (起点: 点, 目标: 点) => 抛射道(起点, 瞄点(目标), 1.6, { 阻力: 0.99, 重力: 0.03 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 重击石道(起点, 目标).到刻 / 20;
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
