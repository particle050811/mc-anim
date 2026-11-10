// 绝对零度（revelationfix goety_revelation:ice_focus）的元数据和冰矛的摆法。出处见 ice.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 乘, 单位, 抛物线 } from '../零件/弹道.ts';
import { 道触地刻 } from '../零件/甲/共用.ts';
import type { 落雨弹 } from '../零件/甲/落雨.ts';

/** 引导放多久：游戏里按住就一直放；片里只放 60 刻（自己定的） */
export const 绝对零度放刻 = 60;
const 领域半径 = 24; // 12 + 下界魔杖 12
const 半边 = 领域半径 * 2; // radius4 / 2：x、y、z 各 ±48

/** 每刻 1 颗 IceSpear，生在「施法者头顶天花板」(这里取 脚底 + 15 格，没有天花板) 周围 ±48 格的立方体，朝施法者脚底射，散布 20～30（四分之一的概率几乎不散） */
export const 冰矛们 = (起点: 点, 种子: number): 落雨弹[] => {
  const r = mulberry32(种子 * 97 + 5);
  const 脚: 点 = [起点[0], 起点[1], 起点[2] - 0.5];
  const 心: 点 = [脚[0], 脚[1], 脚[2] + 15.5];
  return Array.from({ length: 绝对零度放刻 }, (_, k) => {
    const 幅 = () => (r() * 2 - 1) * 半边;
    let 生位: 点 = [心[0] + 幅(), 心[1] + 幅(), 心[2] + 幅()];
    // 游戏里生在方块里会重抽竖直 ±2；这里地面以下当方块处理
    if (生位[2] < 脚[2]) 生位 = [生位[0], 生位[1], 心[2] + (r() * 4 - 2)];
    let 散 = 20 + r() * 10;
    if (r() < 0.25) 散 = r();
    const 速率 = 1.0 + 1.5 * r();
    const 向 = 单位(减(脚, 生位));
    const 偏 = 0.0172275 * 散;
    const 三角 = () => 偏 * (r() - r());
    const 速 = 乘(单位([向[0] + 三角(), 向[1] + 三角(), 向[2] + 三角()]), 速率);
    const 道 = 抛物线(生位, 速, { 阻力: 0.99, 重力: 0.05 });
    return { 出刻: k, 生位, 道, 飞刻: 道触地刻(道, 脚[2], 200) ?? 200 };
  });
};

export default 定义法术元({
  id: 'ice',
  长秒: (绝对零度放刻 + 60) / 20,
  命中秒: 1,
  // CastingSound frost_prepare_spell；每颗矛 ICE_SPIKE_CAST 音量 2，这里每 5 刻记一声
  声音: [
    { 资产: '音效/诡厄巫法/goety.frost_prepare_spell.1', 秒: 0 },
    ...Array.from({ length: 绝对零度放刻 / 5 }, (_, k) => ({ 资产: '音效/诡厄巫法/goety.ice_spike_cast', 秒: (k * 5) / 20, 音量: 2 })),
  ],
});
