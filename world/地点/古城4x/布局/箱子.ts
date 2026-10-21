// 古城4x 开过的战利品箱（世界状态）：哪一段开了哪只，按剧情先后。古城4x画布按 段 画：这一段以前开过的画已开贴图，这一段自己开的由画布的 开箱 在盖子开始抬那一刻换。
// 开过的箱子之后所有镜头都是开过的样子，不管谁开的、镜头站在谁那边（用户 10-20：「这边打开箱子以后 箱子应该变白」，见 模型/物品/箱子.tsx）。
// 新开一只箱子要记进 开箱表，后面的段才接得上（画布遇到没记的会报错）。
import { chestArchery } from './射箭.ts';
import { chestB } from './羊毛.ts';
import { chest722, chest742 } from './第7章.ts';
import { 故事段序, type 段 } from '../古城段序.ts';

// 古城各段的故事先后，取自段清单里画在古城4x上的段（6-4-4 是 6-4-3 的回放；6-4-2至3a 这类合成段，各截按自己的原段算）
type 古城4x段 = Extract<段, { 古城4x: true }>;
export type 古城段 = 古城4x段['故事'][number];
export const 古城段序 = 故事段序((s) => '古城4x' in s) as 古城段[];

export const 开箱表: { 号: number; 段: 古城段; 谁: string }[] = [
  { 号: chestB.号, 段: '6-4-1', 谁: '李樱' }, // #212 开箱拿东西
  { 号: chestArchery.号, 段: '6-4-2', 谁: '李樱' }, // #210 第一次警告
  { 号: chest722.号, 段: '7-2', 谁: '李樱' }, // #240 开到古卷
  { 号: chest742.号, 段: '7-4-2', 谁: '刘心忠' }, // #213 又一只
];
const 段号 = (段: 古城段) => 古城段序.indexOf(段);
// 这一段开头已经开过的箱子号
export const openedBefore = (段: 古城段): number[] => 开箱表.filter((c) => 段号(c.段) < 段号(段)).map((c) => c.号);
// 这一段里开关的箱子（画布的 开箱）要么以前开过，要么开箱表记在这一段
export const checkChestEvent = (段: 古城段, 号: number) => {
  if (openedBefore(段).includes(号) || 开箱表.some((c) => c.号 === 号 && c.段 === 段)) return;
  throw new Error(`#${号} 在 ${段} 开关，但 古城4x布局/箱子.ts 的开箱表里没记：记进去，后面的段才画得出它开过`);
};
