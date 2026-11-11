// 冰风暴（goety:ice_storm_focus）的元数据和弹道。出处见 ice_storm.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 减, 火球道, 命中刻 } from '../零件/弹道.ts';
import { 道触地刻, 瞄点 } from '../零件/甲/共用.ts';

/** IceStorm（SpellHurtingProjectile）：惯性 0.68、加速 0.1（稳态 0.2125 格/刻，很慢）；活 100 刻，穿过人不停，这里飞到落地或 100 刻；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const 冰风暴道 = (起点: 点, 目标: 点, 高速 = 0) => 火球道(起点, 减(瞄点(目标), 起点), { 惯性: 0.68 + 高速 / 50 });
export const 冰风暴终刻 = (起点: 点, 目标: 点, 高速 = 0) => Math.min(100, 道触地刻(冰风暴道(起点, 目标, 高速), 目标[2], 100) ?? 100);

const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 终 = 冰风暴终刻(起点, 目标, 选项?.高速);
  // 越飞越大（碰撞箱跟着 size 长），离胸口 1 格算卷到
  const 命中秒 = Math.min(终, 命中刻(冰风暴道(起点, 目标, 选项?.高速), 瞄点(目标), 1, 100) ?? 终) / 20;
  return { 长秒: 终 / 20 + 1.5, 命中秒 };
};

export default 定义法术元({
  id: 'ice_storm',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // IceStormSpell：WIND_BLAST 音高 0.75
  声音: [{ 资产: '音效/诡厄巫法/goety.wind_blast.1', 秒: 0, 音高: 0.75 }],
});
