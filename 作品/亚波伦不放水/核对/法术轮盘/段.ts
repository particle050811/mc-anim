// 核对-法术轮盘：原版一圈聚晶轮盘的照搬和本片的多圈轮盘，一秒一个视图（视图.ts）。没有声音。
import { defineSceneTimeline, windowSeg } from '@engine/段/窗口段.ts';
import soundTable from './声音表.生成.ts';
import { views } from './视图.ts';

const timeline = defineSceneTimeline({ 场: '核对', 事件: { 开始: { 在: { 秒: 0 } }, 结束: { 在: { 秒: views.length } } } });

export default windowSeg(timeline, { 起: '开始', 止: '结束', soundTable });
