// 起步：新作品自带的核对段，确认能渲（anim new work 生成）。时间线就写在这里，正片的段用 场/<场键>/时间线.ts。
import { defineSceneTimeline, windowSeg } from '@engine/段/窗口段.ts';
import soundTable from './声音表.生成.ts';

const timeline = defineSceneTimeline({ scene: '核对', events: { 开始: { 在: { sec: 0 } }, 结束: { 在: { sec: 2 } } } });

export default windowSeg(timeline, { start: '开始', end: '结束', soundTable });
