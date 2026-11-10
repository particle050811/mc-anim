// 电刑（goety:electrocute_focus）的元数据和弹道。出处见 electrocute.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 乘, 单位, 直线 } from '../零件/弹道.ts';
import { 终刻, 瞄点 } from '../零件/甲/共用.ts';

/** ElectroOrb：出手 0.66 格/刻；有目标时不受重力，直线过去 */
export const 电刑道 = (起点: 点, 目标: 点) => 直线(起点, 乘(单位(减(瞄点(目标), 起点)), 0.66));
export const 电刑命中刻 = (起点: 点, 目标: 点) => 终刻(电刑道(起点, 目标), 目标, 0.5);

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 电刑命中刻(起点, 目标) / 20;
  return { 长秒: 命中秒 + 0.1, 命中秒 };
};

export default 定义法术元({
  id: 'electrocute',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // ElectrocuteSpell：SHOCK_CAST；命中 THUNDERBOLT
  声音: [
    { 资产: '音效/诡厄巫法/goety.shock_cast.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.thunderbolt.1', 秒: 0, 从命中: true },
  ],
});
