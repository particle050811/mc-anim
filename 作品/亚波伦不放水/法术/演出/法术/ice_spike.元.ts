// 冰刺（goety:ice_spike_focus）的元数据和弹道。出处见 ice_spike.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 抛射道, 瞄点 } from '../零件/甲/共用.ts';

/** IceSpike 是箭一类（AbstractArrow）：出手 1.6 格/刻，阻力 0.99、重力 0.05 */
export const 冰刺道 = (起点: 点, 目标: 点) => 抛射道(起点, 瞄点(目标), 1.6, { 阻力: 0.99, 重力: 0.05 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 冰刺道(起点, 目标).到刻 / 20;
  return { 长秒: 命中秒 + 2, 命中秒 };
};

export default 定义法术元({
  id: 'ice_spike',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // IceSpikeSpell：ICE_SPIKE_CAST；命中 ICE_SPIKE_HIT 音高 1.2 ÷ (随机 × 0.2 + 0.9)，这里取 1.2
  声音: [
    { 资产: '音效/诡厄巫法/goety.ice_spike_cast', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.ice_spike_hit.1', 秒: 0, 从命中: true, 音高: 1.2 },
  ],
});
