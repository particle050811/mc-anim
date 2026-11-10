// 流星雨（goety:meteor_shower_focus）的元数据和弹道。出处见 meteor_shower.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 火球道 } from '../零件/弹道.ts';
import { 终刻, 瞄点 } from '../零件/甲/共用.ts';
import type { 火球弹 } from '../零件/甲/火球.ts';

/** 游戏里按住每 10 刻一轮；片里一次演 3 轮。配下界魔杖每轮 3 颗 */
export const 流星雨轮数 = 3;
export const 流星雨间隔刻 = 10;
/** 每颗生在目标上方 15 格的中心 + (±12, ±2, ±12)，是熔岩炸弹（Lavaball），朝目标飞 */
export const 流星雨弹 = (目标: 点, 种子: number): (火球弹 & { 生位: 点 })[] => {
  const r = mulberry32(种子 * 73 + 17);
  const 幅 = (a: number) => (r() * 2 - 1) * a;
  return Array.from({ length: 流星雨轮数 * 3 }, (_, k) => {
    const 生位: 点 = [目标[0] + 幅(12), 目标[1] + 幅(12), 目标[2] + 15 + 幅(2)];
    const 道 = 火球道(生位, 减(瞄点(目标), 生位));
    return { 出刻: Math.floor(k / 3) * 流星雨间隔刻, 生位, 道, 飞刻: 终刻(道, 目标, 0.8) };
  });
};

const 时长 = (_起点: 点, 目标: 点) => {
  const 落 = 流星雨弹(目标, 1).map((弹) => 弹.出刻 + 弹.飞刻);
  return { 长秒: Math.max(...落) / 20 + 1.5, 命中秒: Math.min(...落) / 20 };
};

export default 定义法术元({
  id: 'meteor_shower',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // MeteorShowerSpell：每轮 GHAST_SHOOT 音量 2；命中爆炸 GENERIC_EXPLODE（只挂了第一颗）
  声音: [
    ...Array.from({ length: 流星雨轮数 }, (_, k) => ({ 资产: '音效/entity.ghast.shoot', 秒: (k * 流星雨间隔刻) / 20, 音量: 2 })),
    { 资产: '音效/entity.generic.explode.1', 秒: 0, 从命中: true, 音量: 4 },
  ],
});
