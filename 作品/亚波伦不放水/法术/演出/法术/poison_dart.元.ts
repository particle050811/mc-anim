// 毒镖（goety:poison_dart_focus）的元数据和弹道。出处见 poison_dart.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 抛射道, 瞄点 } from '../零件/甲/共用.ts';

/** PoisonQuill 是箭一类：出手 1.6 格/刻，阻力 0.99、重力 0.05 */
export const 毒镖道 = (起点: 点, 目标: 点) => 抛射道(起点, 瞄点(目标), 1.6, { 阻力: 0.99, 重力: 0.05 });

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 毒镖道(起点, 目标).到刻 / 20;
  // 尾迹粒子活 10 刻
  return { 长秒: 命中秒 + 0.6, 命中秒 };
};

export default 定义法术元({
  id: 'poison_dart',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // PoisonDartSpell：POISON_QUILL_VINE_SHOOT；命中 POISON_QUILL_IMPACT
  声音: [
    { 资产: '音效/诡厄巫法/goety.poison_quill_vine_shoot.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.poison_quill_impact.1', 秒: 0, 从命中: true },
  ],
});
