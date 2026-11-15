// 6-4-7至9 贪功钻出Warden：画面按秒放，声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { definePicture } from '@engine/段/段画面.tsx';
import { GloryEmergeReveal } from './6-4-7至9/贪功钻出Warden.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, GloryEmergeReveal);
