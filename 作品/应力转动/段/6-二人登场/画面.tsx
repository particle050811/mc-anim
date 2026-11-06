// 6-3-8 二人登场：原生段（段.ts 写了 时钟: '秒'），画面按秒放，台词、音效照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { TwoArrive } from './二人登场.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, TwoArrive);
