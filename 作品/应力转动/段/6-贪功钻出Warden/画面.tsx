// 6-4-7至9 贪功钻出Warden：原生段（段.ts 写了 时钟: '秒'），画面按秒放，声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { GloryEmergeReveal } from './6-4-7至9/贪功钻出Warden.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, GloryEmergeReveal);
