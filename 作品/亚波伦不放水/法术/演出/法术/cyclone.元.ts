// 气旋（goety:cyclone_focus）的元数据和弹道。出处见 cyclone.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';
import { 减, 火球道, 命中刻 } from '../零件/弹道.ts';

/** Cyclone（AbstractCyclone）：惯性 0.68、加速 0.1，贴着地朝目标去（这里朝史蒂夫脚底）；聚晶的高速（Velocity）附魔每级惯性 +0.02（SpellHurtingProjectile.setBoltSpeed：boltSpeed += 等级 / 50） */
export const 气旋道 = (起点: 点, 目标: 点, 高速 = 0) => 火球道(起点, 减(目标, 起点), { 惯性: 0.68 + 高速 / 50 });
export const 气旋到刻 = (起点: 点, 目标: 点, 高速 = 0) => 命中刻(气旋道(起点, 目标, 高速), 目标, 0.5) ?? 200;
/** 卷到人之后 spun 数到 80 就散 */
export const 气旋卷刻 = 80;

const 时长 = (起点: 点, 目标: 点, 选项?: 法术选项) => {
  const 命中秒 = 气旋到刻(起点, 目标, 选项?.高速) / 20;
  return { 长秒: 命中秒 + 气旋卷刻 / 20 + 2, 命中秒 };
};

export default 定义法术元({
  id: 'cyclone',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // Cyclone.tick：每 40 刻一声 FLIGHT（音量 0.5、音高 0.5），这里记头两声
  声音: [
    { 资产: '音效/诡厄巫法/goety.flight', 秒: 0, 音量: 0.5, 音高: 0.5 },
    { 资产: '音效/诡厄巫法/goety.flight', 秒: 2, 音量: 0.5, 音高: 0.5 },
  ],
});
