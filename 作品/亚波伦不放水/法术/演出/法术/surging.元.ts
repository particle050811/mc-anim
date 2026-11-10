// 电涌（goety:surging_focus）的元数据和弹道。出处见 surging.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 火球道, type 弹道 } from '../零件/弹道.ts';
import { 终刻, 瞄点 } from '../零件/甲/共用.ts';

/** 游戏里按住每 6 刻放一颗；片里一次演 3 颗 */
export const 电涌发数 = 3;
export const 电涌间隔刻 = 6;
/** SurgingOrb（SpellHurtingProjectile，惯性 0.82）；会追踪，目标不动时就是直线 */
export const 电涌弹 = (起点: 点, 目标: 点): { 出刻: number; 道: 弹道; 飞刻: number }[] => {
  const 道 = 火球道(起点, 减(瞄点(目标), 起点), { 惯性: 0.82 });
  const 飞刻 = 终刻(道, 目标, 0.5);
  return Array.from({ length: 电涌发数 }, (_, k) => ({ 出刻: k * 电涌间隔刻, 道, 飞刻 }));
};

const 时长 = (起点: 点, 目标: 点) => {
  const 弹们 = 电涌弹(起点, 目标);
  const 命中秒 = 弹们[0]!.飞刻 / 20;
  // 命中的电弧活 8 刻、球爆 6 刻
  return { 长秒: 命中秒 + ((电涌发数 - 1) * 电涌间隔刻 + 10) / 20, 命中秒 };
};

export default 定义法术元({
  id: 'surging',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // SurgingSpell：每颗 SHOCK_CAST；命中 THUNDERBOLT
  声音: [
    ...Array.from({ length: 电涌发数 }, (_, k) => ({ 资产: `音效/诡厄巫法/goety.shock_cast.${k + 1}`, 秒: (k * 电涌间隔刻) / 20 })),
    ...Array.from({ length: 电涌发数 }, (_, k) => ({ 资产: `音效/诡厄巫法/goety.thunderbolt.${k + 1}`, 秒: (k * 电涌间隔刻) / 20, 从命中: true })),
  ],
});
