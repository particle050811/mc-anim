// 6-3-10 追进竖井：画面按秒放，声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { ChasePit } from './追进竖井.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, ChasePit);
