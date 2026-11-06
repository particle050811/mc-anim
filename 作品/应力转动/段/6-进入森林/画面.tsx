// 6-1-1 进入森林：照旧 6-1/段界.ts 的截拼（scene1Shot），截表的数是 1/24 秒一格，按秒放；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { scene1Shot } from '../../场/6-暮色森林/6-1/分段.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, scene1Shot('6-1-1').component);
