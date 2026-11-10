// 剃刀风（goety:razor_wind_focus）的元数据和弹道。出处见 razor_wind.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 乘, 单位, 直线 } from '../零件/弹道.ts';
import { 落地刻, 瞄点 } from '../零件/甲/共用.ts';

/** RazorWind：沿视线匀速 2 格/刻，不受重力，最多活 40 刻；穿过人不停，这里飞到落地为止 */
export const 剃刀风道 = (起点: 点, 目标: 点) => 直线(起点, 乘(单位(减(瞄点(目标), 起点)), 2));
export const 剃刀风终刻 = (起点: 点, 目标: 点) => Math.min(40, 落地刻(剃刀风道(起点, 目标), 目标[2], 40) ?? 40);

const 时长 = (起点: 点, 目标: 点) => {
  const 向 = 减(瞄点(目标), 起点);
  const 命中秒 = Math.hypot(向[0], 向[1], 向[2]) / 2 / 20;
  // 云粒子最长活 60 多刻
  return { 长秒: 剃刀风终刻(起点, 目标) / 20 + 2, 命中秒 };
};

export default 定义法术元({
  id: 'razor_wind',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // RazorWindSpell：WIND 音量 2、音高 1.5
  声音: [{ 资产: '音效/诡厄巫法/goety.wind.1', 秒: 0, 音量: 2, 音高: 1.5 }],
});
