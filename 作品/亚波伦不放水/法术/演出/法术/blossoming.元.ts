// 绽放（goety:blossoming_focus）的元数据和弹道。出处见 blossoming.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 抛射道 } from '../零件/甲/共用.ts';

/** BlossomBall（SpellThrowableProjectile）：出手 1.5 格/刻，阻力 0.99、重力 0.03；片里朝史蒂夫脚下的地面抛；聚晶的高速（Velocity）附魔每级出手速度 +1/3 格/刻（IceSpikeSpell 等的 velocity += getLevels(VELOCITY) / 3） */
export const 绽放道 = (起点: 点, 目标: 点, 高速 = 0) => 抛射道(起点, 目标, 1.5 + 高速 / 3, { 阻力: 0.99, 重力: 0.03 });
/** 花刺落地后预警 30 刻再钻出来，钻出来活 20 刻 */
export const 花刺预警刻 = 30;
export const 花刺寿命刻 = 20;

const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 落秒 = 绽放道(起点, 目标, 选项?.高速).到刻 / 20;
  return { 长秒: 落秒 + (花刺预警刻 + 花刺寿命刻) / 20 + 0.1, 命中秒: 落秒 + 花刺预警刻 / 20 };
};

const 声音们 = (选项?: 法术选项) => [
  { 资产: '音效/诡厄巫法/goety.blast_fungus_throw.1', 秒: 0, 音高: 0.75 },
  { 资产: '音效/诡厄巫法/goety.quick_growing_vine_burrow.1', 秒: 绽放道([-10, 0, 7], [0, 0, 0], 选项?.高速).到刻 / 20, 音量: 2, 音高: 0.75 },
];

export default 定义法术元({
  id: 'blossoming',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // BlossomSpell：BLAST_FUNGUS_THROW 音高 0.75；落地 QUICK_GROWING_VINE_BURROW 音量 2、音高 0.75（落地时刻按参考距离写死）
  声音: 声音们(),
  声音随: 声音们,
});
