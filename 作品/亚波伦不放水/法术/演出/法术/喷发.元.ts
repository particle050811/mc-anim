// 喷发（goety:eruption_focus → EruptionSpell）的元数据和时序。出处见 喷发.tsx。
import { 定义法术元 } from '../接口.ts';

/** Volcano：每刻 age + 5，60 满（12 刻升完）；lifeSpan 6 秒到了每刻 − 5 沉回去 */
export const 火山升刻 = 12;
export const 火山寿命刻 = 120;
export const 火山龄 = (刻: number) => (刻 < 火山寿命刻 ? Math.min(60, Math.floor(刻) * 5) : Math.max(0, 60 - (Math.floor(刻) - 火山寿命刻 + 1) * 5));
/** 升完后 attackTime 40 刻走完算第 1 步（不喷），之后每 5 刻一步、第 2～8 步各喷一颗，再歇 80 刻（寿命内只有这 7 颗） */
export const 喷发刻 = Array.from({ length: 7 }, (_, i) => 火山升刻 + 40 + 5 * (i + 1));
/** 喷出去的火山弹飞多久算到头（最慢的一颗落地大约在喷出后 100 刻） */
export const 火山弹最长刻 = 110;

export default 定义法术元({
  id: 'eruption',
  长秒: (喷发刻[6]! + 火山弹最长刻 + 20) / 20,
  // 史蒂夫站在火山口上，第一颗一出膛就炸在他身上
  命中秒: 喷发刻[0]! / 20,
  // Volcano.finalizeSpawn：RUMBLE（音量 2）、WALL_ERUPT；每喷一颗 levelEvent 1018（烈焰人射击声）；寿命到 RUMBLE（音量 2）。
  // 火山弹炸开各一声 GENERIC_EXPLODE（音量 4、音高约 0.7），后六颗落地时刻随种子变，只记第一颗
  声音: [
    { 资产: '音效/诡厄巫法/goety.rumble.1', 秒: 0, 音量: 2 },
    { 资产: '音效/诡厄巫法/goety.wall_erupt.1', 秒: 0 },
    ...喷发刻.map((刻) => ({ 资产: '音效/entity.blaze.shoot', 秒: 刻 / 20 })),
    { 资产: '音效/entity.generic.explode.1', 秒: 喷发刻[0]! / 20, 音量: 4, 音高: 0.7 },
    { 资产: '音效/诡厄巫法/goety.rumble.2', 秒: 火山寿命刻 / 20, 音量: 2 },
  ],
});
