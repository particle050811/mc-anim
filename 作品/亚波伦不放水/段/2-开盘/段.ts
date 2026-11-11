// 第 2 幕 追打：史蒂夫追着砍七刀，亚波伦只躲不还手，最后升到祭坛上空 12 格、转身举杖指着他（张盘在第 4 幕开头，用户 11-11）。窗口、声音 cue。纯模块。
// 声音（用户 11-11「为什么没有声音啊」）：时刻都取 场/1-台地/开盘时刻.ts（段从 召唤完 起，段内秒 = 幕内秒），配乐、环境垫底在场时间线上。
// 响度三档（同 声音表.md 6.1 节）：主要音效（挥剑、瞬移）峰值 −10 dBFS，次要（脚步、落地、她躲时带的风、瞬移前兆、她起飞）−18 dBFS。
// 一个事件有几个文件的，挑哪个是 Agent 取的（相邻两下不重样）；用哪种挥剑声、多响都是 Agent 取的，用户没听过。
import { 窗口段 } from '@engine/段/窗口段.ts';
import { 真下界包 } from '../../地点/真下界位置.ts';
import type { 招名 } from '../../角色/剑招.ts';
import { 刀表, 史冲们, 拔, 瞬移后冲, 瞬移时, 跳们, 躲起 } from '../../场/1-台地/开盘时刻.ts';
import 线 from '../../场/1-台地/时间线.ts';
import 声音表 from './声音表.生成.ts';

const 主 = -10;
const 次 = -18;
/**
 * 挥剑声：原版只在打到东西时响（横扫 sweep、重击 strong、暴击 crit；打中没伤害 nodamage），挥空没有声音。七刀都砍空，片里照招的分量借：
 * 跳劈是往下落着砍、原版就是暴击 → crit；横斩是横扫 → sweep；上撩 → strong；下劈砍进她瞬移的烟里 → nodamage（打到了、没伤着）
 */
const 挥声: Record<招名, readonly string[]> = {
  跳劈: ['crit.1', 'crit.2'],
  横斩: ['sweep.1', 'sweep.3'],
  上撩: ['strong.1', 'strong.4'],
  下劈: ['nodamage.2'],
};
/** 往上跳的两跳（3 格高）落地是 fall，其余低跳落地是 step */
const 高跳 = (g: number) => g > 40;

export default 窗口段(线, {
  起: '召唤完',
  止: '开盘完',
  地形: [真下界包],
  声音表,
  声音: ({ 放 }) => {
    const 出: ReturnType<typeof 放>[] = [];
    // 七刀：声音落在刀过去那一下（点下左键）
    const 用过: Partial<Record<招名, number>> = {};
    for (const [i, 刀] of 刀表.entries()) {
      const 候 = 挥声[刀.招];
      const n = 用过[刀.招] ?? 0;
      用过[刀.招] = n + 1;
      出.push(放(`音效/entity.player.attack.${候[n % 候.length]}`, 刀.点, { 峰值: 主, 名: `第${i + 1}刀${刀.招}` }));
    }
    // 他的跳：起跳蹬地、落地
    for (const [i, [起, 落, g]] of 跳们.entries()) {
      出.push(放(`音效/block.stone.step.${(i % 6) + 1}`, 起, { 峰值: 次, 名: `起跳${i + 1}` }));
      出.push(放(高跳(g) ? `音效/block.stone.fall.${(i % 6) + 1}` : `音效/block.stone.step.${((i + 3) % 6) + 1}`, 落, { 峰值: 次, 名: `落地${i + 1}` }));
    }
    // 他在地上的冲刺：起步蹬地、刹停
    for (const [i, [起, 止]] of 史冲们.entries()) {
      出.push(放(`音效/block.stone.step.${((i + 1) % 6) + 1}`, 起, { 峰值: 次, 名: `起步${i + 1}` }));
      出.push(放(`音效/block.stone.step.${((i + 4) % 6) + 1}`, 止, { 峰值: 次, 名: `刹停${i + 1}` }));
    }
    // 她：从祭坛飞出来、每一下躲（第 4 刀是瞬移，另排）、瞬移出来那一冲、往上拔、飞回祭坛上空，带一阵风
    const 风们 = [0, ...躲起.filter((_, i) => i !== 3), 瞬移后冲[0], 拔.飞].sort((a, b) => a - b);
    for (const [i, 秒] of 风们.entries()) 出.push(放(`音效/诡厄巫法/goety.wind.${(i % 4) + 1}`, 秒, { 峰值: 次, 名: `她的风${i + 1}` }));
    // 瞬移：开始冒烟时前兆，挪过去那一下传送声
    出.push(放('音效/诡厄巫法/goety.apostle_pre_teleport', 瞬移时.起, { 峰值: 次, 名: '瞬移前兆' }));
    出.push(放('音效/诡厄巫法/goety.apostle_teleport.1', 瞬移时.移, { 峰值: 主, 名: '瞬移' }));
    // 张盘的声音（apostle_prepare_spell）跟着张盘挪到第 4 幕（用户 11-11）
    return 出;
  },
});
