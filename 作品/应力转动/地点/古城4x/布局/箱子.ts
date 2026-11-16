// 古城4x 开过的战利品箱（世界状态）：哪一段开了哪只，按剧情先后。古城4x画布按 段 画：这一段以前开过的画已开贴图，这一段自己开的由画布的 开箱 在盖子开始抬那一刻换。
// 开过的箱子之后所有镜头都是开过的样子，不管谁开的、镜头站在谁那边（用户 10-20：「这边打开箱子以后 箱子应该变白」，见 模型/物品/箱子.tsx）。
// 新开一只箱子要记进 开箱表，后面的段才接得上（画布遇到没记的会报错）。
import { chestArchery } from './射箭.ts';
import { chestB } from './羊毛.ts';
import { chest722, chest742 } from './第7章.ts';
import { storySegmentOrder, type Segment } from '../古城段序.ts';

// 古城各段的故事先后，取自段清单里画在古城4x上的段（6-4-4 是 6-4-3 的回放；6-4-2至3a 这类合成段，各截按自己的原段算）
type AncientCity4xSegment = Extract<Segment, { 古城4x: true }>;
export type AncientCitySegment = AncientCity4xSegment['故事'][number];
export const ancientCitySegmentOrder = storySegmentOrder((s) => '古城4x' in s) as AncientCitySegment[];

export const chestOpenings: { chestId: number; segment: AncientCitySegment; who: string }[] = [
  { chestId: chestB.chestId, segment: '6-4-1', who: '李樱' }, // #212 开箱拿东西
  { chestId: chestArchery.chestId, segment: '6-4-2', who: '李樱' }, // #210 第一次警告
  { chestId: chest722.chestId, segment: '7-2', who: '李樱' }, // #240 开到古卷
  { chestId: chest742.chestId, segment: '7-4-2', who: '刘心忠' }, // #213 又一只
];
const segmentIndex = (segment: AncientCitySegment) => ancientCitySegmentOrder.indexOf(segment);
// 这一段开头已经开过的箱子号
export const openedBefore = (segment: AncientCitySegment): number[] => chestOpenings.filter((c) => segmentIndex(c.segment) < segmentIndex(segment)).map((c) => c.chestId);
// 这一段里开关的箱子（画布的 开箱）要么以前开过，要么开箱表记在这一段
export const checkChestEvent = (segment: AncientCitySegment, chestId: number) => {
  if (openedBefore(segment).includes(chestId) || chestOpenings.some((c) => c.chestId === chestId && c.segment === segment)) return;
  throw new Error(`#${chestId} 在 ${segment} 开关，但 古城4x布局/箱子.ts 的开箱表里没记：记进去，后面的段才画得出它开过`);
};
