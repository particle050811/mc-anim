// 第 1 场打在监守者身上的每一下：命中的场时刻 t（秒）和汇流来世显示的伤害。7-1-5、7-1-7 的伤害数字层和 7-2-1 Jade 框的血都从这里取，
//   保证是同一条时间线（用户 10-19：「我要求是在一个时间线上的观察」）。
// 打中它的都是黄叛的风矢（每一箭都开鼓风机，用户 10-19 定）：1500 上下 10%、满弦暴击深红字，依据见 ../../7-1-5/伤害数字层.tsx。
//   7-1-5 那一箭 1527 是用户 10-18 定的；7-1-7 两箭 1503.6、1461.2（用户 10-19 定，7-4-1 开头剩的血照这两个数接着算，别改）。
// 血量五万是原文（7.md 第 46 行李樱「五万血？！」）。
import type { ArrowShot } from './黄叛.ts';
import { windArrowShot, huangFollowArrows } from './黄叛.ts';

export const wardenMaxHp = 50000;
export type WardenHit = { t: number; damage: number; crit: boolean; 箭: ArrowShot };
const followDamages = [1503.6, 1461.2];
export const wardenHits: WardenHit[] = [
  { t: windArrowShot.中, damage: 1527, crit: true, 箭: windArrowShot },
  ...huangFollowArrows.map((a, i) => ({ t: a.中, damage: followDamages[i], crit: true, 箭: a })),
].sort((a, b) => a.t - b.t);
// 场时刻 t 那一刻的血（命中那一刻已经扣掉），保留一位小数
export const wardenHpAt = (t: number) => Math.round((wardenMaxHp - wardenHits.filter((h) => h.t <= t).reduce((sum, h) => sum + h.damage, 0)) * 10) / 10;
