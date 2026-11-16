// 6-1-4至9 穿塔斩首领：照旧 6-1/段界.ts 的截拼（scene1Shot，截表 1/120 秒一刻、按秒放）；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { definePicture } from '@engine/段/段画面.tsx';
import { scene1Shot } from '../../场/6-暮色森林/6-1/分段.tsx';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(segment, soundUrl, scene1Shot('6-1-4至9').component);
