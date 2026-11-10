// 蒸汽（goety:steaming_focus）的元数据和弹道。出处见 steaming.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 单位, 火球道, type 弹道 } from '../零件/弹道.ts';
import { 终刻, 瞄点 } from '../零件/甲/共用.ts';

/** 不配对应法杖：一共 5 发，每 2 刻一发 */
export const 蒸汽发数 = 5;
export const 蒸汽间隔刻 = 2;
/** SteamMissile（SpellHurtingProjectile，惯性 0.82）；方向 = 视线单位向量，水平两个分量各加一个三角分布 triangle(0, 0.1378) */
export const 蒸汽弹 = (起点: 点, 目标: 点, 种子: number): { 出刻: number; 道: 弹道; 飞刻: number }[] => {
  const r = mulberry32(种子 * 97 + 11);
  const 向 = 单位(减(瞄点(目标), 起点));
  return Array.from({ length: 蒸汽发数 }, (_, k) => {
    const 三角 = () => 0.1378 * (r() - r());
    const 道 = 火球道(起点, [向[0] + 三角(), 向[1] + 三角(), 向[2]], { 惯性: 0.82 });
    return { 出刻: k * 蒸汽间隔刻, 道, 飞刻: 终刻(道, 目标, 0.5) };
  });
};

const 时长 = (起点: 点, 目标: 点) => {
  const 弹们 = 蒸汽弹(起点, 目标, 1);
  const 命中秒 = Math.min(...弹们.map((弹) => 弹.出刻 + 弹.飞刻)) / 20;
  return { 长秒: Math.max(...弹们.map((弹) => 弹.出刻 + 弹.飞刻)) / 20 + 0.1, 命中秒 };
};

export default 定义法术元({
  id: 'steaming',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SteamSpell：每发 CAST_STEAM；命中 STEAM_IMPACT
  声音: [
    ...Array.from({ length: 蒸汽发数 }, (_, k) => ({ 资产: `音效/诡厄巫法/goety.cast_steam.${(k % 4) + 1}`, 秒: (k * 蒸汽间隔刻) / 20 })),
    { 资产: '音效/诡厄巫法/goety.steam_impact.1', 秒: 0, 从命中: true },
  ],
});
