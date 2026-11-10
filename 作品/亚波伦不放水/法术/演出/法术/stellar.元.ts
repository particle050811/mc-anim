// 星陨（goety:stellar_focus）的元数据和弹的摆法。出处见 stellar.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { 定义法术元, type 点 } from '../接口.ts';
import { 虚空震撞刻, type 虚空震 } from '../零件/甲/虚空震.ts';

/** 游戏里按住从第 10 刻起每 5 刻生一颗；片里一次演 4 颗 */
export const 星陨发数 = 4;
/** 生在 施法者位置 + (−3～3 的整数, 身高 + 1, −3～3 的整数)；片里把 起点 当施法者头顶，往上 1 格。悬 10 刻后锁定 */
export const 星陨震 = (起点: 点, 种子: number): 虚空震[] => {
  const r = mulberry32(种子 * 41 + 9);
  const 整 = () => Math.floor(r() * 7) - 3;
  return Array.from({ length: 星陨发数 }, (_, k) => {
    const 生位: 点 = [起点[0] + 整(), 起点[1] + 整(), 起点[2] + 1];
    return { 出刻: 10 + k * 5, 生位, 悬位: 生位, 锁刻: 10 };
  });
};

const 时长 = (起点: 点, 目标: 点) => {
  const 震们 = 星陨震(起点, 1);
  const 撞 = 震们.map((震) => 震.出刻 + 虚空震撞刻(震, 目标));
  return { 长秒: Math.max(...撞) / 20 + 0.8, 命中秒: Math.min(...撞) / 20 };
};

export default 定义法术元({
  id: 'stellar',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // VoidShockSpell：起手 VOID_PREPARE_SPELL；每颗生出来 TELEPORT_ORB_THROW 音量 2；撞上 FUNGUS_EXPLOSION（只挂了第一颗）
  声音: [
    { 资产: '音效/诡厄巫法/goety.void_prepare_spell.1', 秒: 0 },
    ...Array.from({ length: 星陨发数 }, (_, k) => ({ 资产: '音效/诡厄巫法/goety.teleport_orb_throw', 秒: (10 + k * 5) / 20, 音量: 2 })),
    { 资产: '音效/诡厄巫法/goety.fungus_explosion.1', 秒: 0, 从命中: true },
  ],
});
