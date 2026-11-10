// 段的窗口、声音 cue（放 音效和配乐、说 台词，每条只写一次；时长、峰值由 anim cues 生成进 声音表）。纯模块。
import { 窗口段 } from '@engine/段/窗口段.ts';
import 线 from '../../场/2-教堂/时间线.ts';
import 声音表 from './声音表.生成.ts';

export default 窗口段(线, {
  起: '开始',
  止: '结束',
  声音表,
  声音: () => [],
});
