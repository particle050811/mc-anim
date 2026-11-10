// 第 1 幕 召唤：安息仪式（短方案）到亚波伦现身、睁眼。窗口、声音 cue；声音还没排（等 anim cues 和召唤声音表接上）。纯模块。
import { 窗口段 } from '@engine/段/窗口段.ts';
import { 真下界包 } from '../../地点/真下界位置.ts';
import 线 from '../../场/1-台地/时间线.ts';
import 声音表 from './声音表.生成.ts';

export default 窗口段(线, {
  起: '开始',
  止: '召唤完',
  地形: [真下界包],
  声音表,
  声音: () => [],
});
