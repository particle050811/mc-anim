// 魔杖细做核对：原版下界魔杖和细做的三个候选（物品/下界魔杖细做.tsx）并排、杖头和杆近看、拿在娘化亚波伦手上、封面式中景，一秒一个视图。纯模块。
import { defineSceneTimeline, windowSeg } from '@engine/段/窗口段.ts';
import soundTable from './声音表.生成.ts';
import { aspect, views } from './视图.ts';

const timeline = defineSceneTimeline({ scene: '核对', aspect, events: { 开始: { 在: { sec: 0 } }, 结束: { 在: { sec: views.length } } } });

export default windowSeg(timeline, {
  start: '开始',
  end: '结束',
  soundTable,
  sound: () => [],
});
